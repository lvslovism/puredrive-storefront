/**
 * 這家店要不要整站不被搜尋引擎收錄。**逐站事實，一家店一個答案。**
 *
 * ## 為什麼在 brand/ 而不在 src/lib/
 *
 * `src/lib/` 是九份逐字相同的共用程式碼；`brand/` 是這家店自己的事實。
 * SITE_NOINDEX 跟 `siteDomain` / `merchantCode` 同類 —— 每家店填不一樣的值；
 * 它不跟 `NOINDEX_DIRECTIVE` 那種「全家共用的字串常數」同類。
 *
 * 一開始它被放在 `src/lib/noindex.mjs`，那是規格把範圍畫錯了，不是設計選擇。
 * 後果具體且不可繞過：`scripts/template-lock.mjs` 把整個 `src/lib/` 列為 CORE，
 * 而 `lockedFiles()` 是自動走訪目錄的 —— 下一次重生 lock，這個逐站的值就會被
 * 以母版的 bytes 釘住，每一家設 `true` 的店都被 `audit:template` 判成漂移，
 * 且 CORE 依定義不可 unlock（見 template-lock.mjs 的 "is CORE and cannot be
 * unlocked"）。搬到 `brand/` 之後 `src/lib/noindex.mjs` 九份相同，可以安然進
 * CORE；而 `brand/` 不在任何 lock 的管轄範圍內，本來就是給逐站差異用的。
 *
 * ## 預設值為什麼是 false
 *
 * 模板出貨為 `false`，展示站在自己的 repo 裡明確寫 `true`。這一格分歧是刻意的，
 * 把預設值倒向「看得見的失敗」那一側：
 *
 *   忘了在展示站設成 true  → 站出現在搜尋結果。看得到，發現當下 10 秒可修。
 *   忘了在真實店設成 false → 店靜默地從搜尋消失。沒有任何徵兆，沒有錯誤，
 *                            沒有紅燈，只有幾週後說不清為什麼的流量曲線。
 *
 * 兩種錯都會發生。差別只在哪一種會被發現。預設值因此不能是「安全的那個」，
 * 必須是「出錯時會自己講出來的那個」。
 *
 * 這也是為什麼這裡不寫「記得改成 false」—— 靠人記得，正是上面第二種失敗的
 * 定義。兩邊都不依賴任何人記得任何事。
 *
 * ## 切成 false 之後會發生什麼
 *
 * robots.txt 退回逐條 Disallow + Sitemap，`/*` 不再帶 X-Robots-Tag，
 * meta robots 不輸出；而交易頁的 noindex（`src/lib/noindex.mjs` 的
 * TRANSACTION_NOINDEX_PATHS）不受影響，仍然生效。
 *
 * 其餘四項（指令字串、robots.txt 全文、交易頁清單、整體取捨說明）都在
 * `src/lib/noindex.mjs`，那支是共用的，不要在這裡重複宣告。
 */
export const SITE_NOINDEX = false;
