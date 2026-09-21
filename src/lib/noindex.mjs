/**
 * demo-noindex —— 「這個站不要被搜尋引擎收錄」的單一判準。
 *
 * 四個消費端都讀這一支，**刻意不讓它們各自寫一次字串**：
 *
 *   1. dist/_headers  的 `/*` X-Robots-Tag      （scripts/build-deployment-files.mjs）
 *   2. dist/robots.txt 的 User-agent / Disallow （同上）
 *   3. dist/robots.txt 的 Sitemap 行要不要出現 （同上）
 *   4. BaseLayout 的 <meta name="robots">       （src/layouts/BaseLayout.astro）
 *
 * 四處只要有一處分歧，症狀就是「以為擋掉了但其實沒有」，而那種錯不會有任何
 * 徵兆 —— 平台側 packages/storefront/src/lib/seo/noindex.ts 為同一個理由把三個
 * 消費端收攏到一支判準，這裡沿用同一個決定並多收一個消費端（_headers）。
 *
 * ## 開關本身不在這裡
 *
 * `SITE_NOINDEX` 宣告在 `brand/noindex.mjs`，本檔只是把它轉出去，讓四個消費端
 * 有單一 import 來源。**這一支九份逐字相同**，逐站差異全部收斂在 brand/ 那一行。
 * 為什麼這樣切，見 `brand/noindex.mjs` 的檔頭（簡短版：src/lib/ 整個目錄是
 * template-lock 的 CORE，把逐站的值放進來會讓每家店都被判漂移，而 CORE 不可
 * unlock）。`src/lib/` 讀 `brand/` 是既有方向，commerce.ts / features.ts /
 * ground.ts 都這樣做。
 *
 * ## 為什麼是 robots.txt 全站 Disallow，而不是只上 X-Robots-Tag
 *
 * 這批 noindex 服務的是 `*.astrapath-marketing.com`。那些 hostname 在決定當下
 * 尚不存在 ⇒ 必然「未收錄」⇒ 平台政策自己的判準選 `Disallow: /`。
 *
 * 更要緊的是 X-Robots-Tag 只有 Google 吃；AI 爬蟲讀的是 robots.txt 的
 * Disallow。虛構品牌被 AI 吃進去、並與 astrapath-marketing.com 綁定，才是
 * 這件事真正要防的 —— header-only 擋不住那個。
 *
 * ## 刻意接受的殘留
 *
 * 舊的 `*.pages.dev` / `*.workers.dev` 網址若**已經**被收錄，`Disallow: /` 會讓
 * Googlebot 讀不到 noindex，舊條目會滯留在索引裡。這是刻意付的代價：那些網址
 * 即將丟棄，而且不在 SEO 主網域上。若哪天需要讓某個已收錄的 URL 消失，作法是
 * 反過來 —— 先允許抓取、讓爬蟲讀到 noindex，也就是把 SITE_NOINDEX 關掉、只留
 * 下面那組交易頁規則與 meta。這個取捨寫在這裡而不是只在 commit message，因為
 * 需要它的人會先看到這個檔。
 */

export { SITE_NOINDEX } from '../../brand/noindex.mjs';

/** meta robots / X-Robots-Tag 共用的指令字串。 */
export const NOINDEX_DIRECTIVE = 'noindex, nofollow';

/**
 * 整站不收錄時的 robots.txt 全文。
 *
 * **刻意只留 `*` 一個群組**：AI bot 若在此另開明確群組，會因為 RFC 9309 §2.2.1
 * 的「明確群組取代 `*`、不疊加」而拿到一張全站通行證 —— 那正是平台側
 * nx-robots-aibot-group-override 修掉的缺陷形態。不要在這裡重演。
 *
 * 也不列 Sitemap：一份 sitemap 指著一個宣告不要被抓的站，是自相矛盾的訊號。
 */
export const NOINDEX_ROBOTS_TXT = `User-agent: *
Disallow: /
`;

/**
 * 交易頁：無論整站是否 noindex，這幾條永遠 noindex。
 *
 * robots.txt 的 Disallow 擋的是抓取，不是索引 —— 一個被別處連到的頁面，即使
 * 沒被抓過也可能被列出來。所以這裡用 header 而非只靠 robots.txt。
 */
export const TRANSACTION_NOINDEX_PATHS = [
  '/cart',
  '/cart/*',
  '/checkout',
  '/checkout/*',
  '/account',
  '/account/*',
  '/auth',
  '/auth/*',
  '/login',
  '/login/*',
];
