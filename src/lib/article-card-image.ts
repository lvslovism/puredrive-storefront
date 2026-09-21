// Build-time resolver for article cover images.
//
// featured_image_url comes back from the API as an absolute URL, but a shop that
// hosts its own article covers points it at this site's own /assets/… files.
// This maps a same-origin URL back to its local path and reads the intrinsic
// size, so the card can reserve the image's box before the bytes arrive.
//
// Truly remote URLs (or local paths with no file behind them) degrade to a bare
// { src } — the card renders a plain <img> with no dimensions, which is worse
// for layout stability but never wrong.

import { imageSize } from "./image-size";
import { SITE_ORIGIN } from "./commerce";

export interface CardImage {
  src: string;
  width?: number;
  height?: number;
}

const cache = new Map<string, CardImage | null>();

export function resolveCardImage(url: string | null | undefined): CardImage | null {
  if (!url) return null;
  if (cache.has(url)) return cache.get(url)!;

  const localSrc = url.startsWith(SITE_ORIGIN + "/")
    ? url.slice(SITE_ORIGIN.length)
    : url.startsWith("/")
      ? url
      : null;
  const size = localSrc ? imageSize(localSrc) : null;

  const out: CardImage =
    localSrc && size
      ? { src: localSrc, width: size.width, height: size.height }
      : { src: url };

  cache.set(url, out);
  return out;
}
