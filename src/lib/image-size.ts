// Build-time intrinsic size lookup for assets that live in public/.
//
// Every <img> needs width + height so the browser can reserve the box before
// the bytes arrive (no CLS). Hardcoding the numbers in the templates rots the
// moment an asset is re-exported at a different size, so the dimensions are
// read out of the file header instead — this runs in the Astro frontmatter
// (Node, build time only) and never ships to the browser.
//
// Header parsing rather than an image library on purpose: the project has no
// direct image dependency, and PNG / JPEG / WebP headers are a few bytes each.
// Anything unrecognised returns null, and callers simply omit the attributes
// (same behaviour as before) instead of failing the build.

import { readFileSync } from "node:fs";
import path from "node:path";

export interface ImageSize {
  width: number;
  height: number;
}

const cache = new Map<string, ImageSize | null>();

function parsePng(buf: Buffer): ImageSize | null {
  // 8-byte signature, then the IHDR chunk: length(4) type(4) width(4) height(4)
  if (buf.length < 24) return null;
  if (buf.readUInt32BE(12) !== 0x49484452) return null; // "IHDR"
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function parseJpeg(buf: Buffer): ImageSize | null {
  let i = 2; // skip SOI
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    // SOFn carries the frame dimensions. SOF4/SOF8/SOF12 (0xc4/0xc8/0xcc) are
    // DHT/JPG/DAC, not frame headers — skip those.
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSof) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2; // standalone marker, no payload
      continue;
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

function parseWebp(buf: Buffer): ImageSize | null {
  if (buf.length < 30) return null;
  const kind = buf.toString("ascii", 12, 16);
  if (kind === "VP8X") {
    // extended: 24-bit little-endian canvas width-1 / height-1
    const w = buf.readUIntLE(24, 3) + 1;
    const h = buf.readUIntLE(27, 3) + 1;
    return { width: w, height: h };
  }
  if (kind === "VP8 ") {
    // simple lossy: 14-bit dimensions after the 3-byte start code
    return {
      width: buf.readUInt16LE(26) & 0x3fff,
      height: buf.readUInt16LE(28) & 0x3fff,
    };
  }
  if (kind === "VP8L") {
    // lossless: 0x2f signature byte, then 14 bits width-1 + 14 bits height-1
    if (buf[20] !== 0x2f) return null;
    const bits = buf.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  return null;
}

/**
 * Intrinsic size of a site-root asset path (e.g. "/assets/home/icons/x.png").
 * Returns null for remote URLs, missing files and formats we don't parse —
 * callers must treat null as "no attributes".
 */
export function imageSize(publicPath: string): ImageSize | null {
  if (!publicPath || /^(https?:)?\/\//.test(publicPath)) return null;
  if (cache.has(publicPath)) return cache.get(publicPath)!;

  let size: ImageSize | null = null;
  try {
    const file = path.join(process.cwd(), "public", publicPath.replace(/^\//, ""));
    const buf = readFileSync(file);
    const ext = path.extname(publicPath).toLowerCase();
    if (ext === ".png") size = parsePng(buf);
    else if (ext === ".jpg" || ext === ".jpeg") size = parseJpeg(buf);
    else if (ext === ".webp") size = parseWebp(buf);
  } catch {
    size = null; // missing/unreadable → omit the attributes, never break the build
  }
  cache.set(publicPath, size);
  return size;
}

/** Spread-ready `{ width, height }`, or `{}` when the size is unknown. */
export function sizeAttrs(publicPath: string): { width?: number; height?: number } {
  const s = imageSize(publicPath);
  return s ? { width: s.width, height: s.height } : {};
}
