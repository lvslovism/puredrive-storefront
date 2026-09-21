# 母版輪報告 —— 2026-08-24

十五條待辦，**十四條 + A1b 出貨，一條砍掉**。
母版 `46f443a` → 五個 commit。十一站零差異驗收通過。

本檔是該輪的完整紀錄。它**不在 `template.lock.json`** 裡：`scripts/template-lock.mjs`
的 `LOCKED_ROOTS` 逐名列出 `docs/PITFALLS.md` 而不是整個 `docs/` 目錄，
所以這份報告不會進 locked，`locked` 維持 75。

---

## 1. 母版狀態

| commit | 內容 |
| --- | --- |
| `d2ea33f` | 十四條（A1b 除外） |
| `3787712` | lock re-stamp at `d2ea33f` |
| `33e1dd2` | **A1b，單獨 commit** |
| `51cdfa3` | lock re-stamp at `33e1dd2` |
| 第五個 | 本報告 + PITFALLS #13 的 `--dry` 條目 + 隨之重算的 lock |

`git diff --stat 46f443a HEAD` —— 21 檔，**+1328 / −145**

| 檔 | ± | | 檔 | ± |
| --- | --- | --- | --- | --- |
| `README.md` | 17 | | `src/components/product/ProductGallery.astro` | 78 |
| `brand/identity.ts` | 47 | | `src/layouts/BaseLayout.astro` | 16 |
| `brand/legal.ts` | 61 | | `src/lib/content-derivation.mjs` | 52 |
| `docs/PITFALLS.md` | 105 | | `src/lib/features.ts` | 69 |
| `scripts/audit-color.mjs` | 80 | | `src/lib/grounds.mjs` | 202 |
| `scripts/brand-facts.mjs` | 138 | | `src/pages/privacy.astro` | 44 |
| `scripts/build-deployment-files.mjs` | 112 | | `src/pages/terms.astro` | 78 |
| `src/components/common/Footer.astro` | 87 | | `src/routes/faq.astro` | 22 |
| `src/components/common/SocialRail.astro` | 33 | | `template.lock.json` | 34 |
| `src/components/home/HomeLanding.astro` | 65 | | `tests/grounds.test.mjs` | 122 |
| `src/components/home/HomeMultipage.astro` | 11 | | | |

**lock，出貨後（`33e1dd2` / `51cdfa3`）**

```
locked          75
baseline        2
template.commit 33e1dd22d8be5a1d0f64ffab50ddfd486bdee994
sha256          331f228055467b1e82ec274dd8cf80d06060b4f256768d6bcbbf23052ee401b9
```

**lock，第五個 commit 之後（最終）**

```
locked          75
baseline        2
template.commit 51cdfa3…
sha256          c29c74ebc7294aa1ac3a5c69a75e2da862f1210254c98d80de0d8554ae4d919a
```

`locked` / `baseline` 的成員數與檔名全程未變動，只有雜湊值。

第五個 commit 把 `--dry` 條目寫進 `docs/PITFALLS.md`，而那是 lock 的 75 檔之一，
所以它的雜湊改變、lock 必須重算，`template.commit` 據實成為 `51cdfa3`。
**沒有另開 re-stamp commit。** 指標指向「產生這份 lock 時的 HEAD」，
與 `d2ea33f` 在 `3787712` 之前是同一種狀態。

把指標手改回 `33e1dd2` 沒有做，也不該做：`33e1dd2` 並不帶有新的 PITFALLS 位元組，
那會讓 lock 宣稱一個它沒有的來源 —— 而 `audit:template` 比雜湊、不比指標，
所以沒有任何一道檢查會發現。這正是同一個 commit 寫進 PITFALLS #13 的那條指標謊。

---

## 2. 第 0 層 —— A/A 噪音底線

十一站全部 `demo.enabled: false`，build 時打 live API，所以先對同一份 commit
連續 build 兩次。

**十一站全數 clean，噪音為零。** 每站每一頁（18 或 13 頁）改前建置兩次逐位元相同，
包含 `getProducts()` 帶出來的商品列與 404 推薦列。

結論：body 比對在這一輪全程有效，**沒有任何一站需要退回凍結 fixture**。

---

## 3. 十一站三層比對

### 3.1 比對方法 —— 不是「同步 75 檔」

十一站不是一個群體。以 `46f443a` 為基準逐檔比對 75 個 locked 檔：

| 群 | 站 | 狀態 |
| --- | --- | --- |
| **同步** | VALOR、AURELIA、LUMIERE、BROWETOILE | 75/75 逐位元相同 |
| **落後一輪** | LEMONE、Pawfect、NORDIC、SOMMEIL、TRAILNEST、RIDEFORM、AURELLE | 68 同步、6 漂移、**1 缺檔** |

那七站早於地面表：`src/lib/grounds.mjs` **根本不存在**，另有
`docs/PITFALLS.md`、`scripts/audit-color.mjs`、`scripts/brand-facts.mjs`、
`scripts/build-deployment-files.mjs`、`src/lib/commerce.ts`、`src/lib/ground.ts`
六個舊版。

**所以不能用「把 75 檔複製過去」來跑閘門** —— 那會一次套用兩輪，結果無法歸因，
還會把那七站尚未付清的 accent 拆分一起拖進來。

改用的方法：**只套用本輪變更的檔，且僅在該檔原本就與母版改前版本逐位元相同時才套**。
其餘逐檔列為「本輪不可歸因」。

| 群 | 套用 | 不可歸因 |
| --- | --- | --- |
| 同步四站 | 14 / 14 | — |
| 落後七站 | 9 / 14 | `docs/PITFALLS.md`、`scripts/audit-color.mjs`、`scripts/brand-facts.mjs`、`scripts/build-deployment-files.mjs`、`src/lib/grounds.mjs` |

那五個不可歸因的檔**沒有一個會進 HTML**（三個 script、一份 docs、一個只被
`src/lib/ground.ts` 讀的表，而那七站的 `ground.ts` 是不讀它的舊版）。
**所有會影響渲染的檔，十一站全部在步、全部套用**，閘門的意義完整。

### 3.2 A1b 之前 —— 十四條

| 站 | 頁 | `npm run build` | L0 | L1 body | L2 head | L3 CSS |
| --- | --- | --- | --- | --- | --- | --- |
| LEMONE | 18 | 0 | clean | **zero** | 18 頁，僅允許類型 | BaseLayout +113、`_handle_` +543 |
| Pawfect | 18 | 0 | clean | **zero** | 18 頁，僅允許類型 | 同上 |
| NORDIC | 18 | 0 | clean | **zero** | 18 頁，僅允許類型 | 同上 |
| SOMMEIL | 13 | 0 | clean | **zero** | 13 頁，僅允許類型 | 同上 |
| TRAILNEST | 13 | 0 | clean | **zero** | 13 頁，僅允許類型 | 同上 |
| RIDEFORM | 13 | 0 | clean | **zero** | 13 頁，僅允許類型 | 同上 |
| AURELLE | 13 | 0 | clean | **zero** | 13 頁，僅允許類型 | 同上 |
| **VALOR** | 18 | **1**（見 3.4） | clean | **zero** | 18 頁，僅允許類型 | 同上 |
| AURELIA | 13 | 0 | clean | **zero** | 13 頁，僅允許類型 | 同上 |
| LUMIERE | 13 | 0 | clean | **zero** | 13 頁，僅允許類型 | 同上 |
| BROWETOILE | 13 | 0 | clean | **zero** | 13 頁，僅允許類型 | 同上 |

「僅允許類型」= head 的差異只有 `/_astro/*.css` 雜湊與 inline `<style>` 內文，
其餘 head 逐位元相同。**沒有任何一站出現不允許的 head 差異。**

**L3 逐字比對**（產物對產物，兩邊經過同一個壓縮器）：**只增不改，零移除。**

```
BaseLayout.css   +1 條
  .social-rail[…]:has(.rail-top[hidden]) .rail-divider[…]{display:none}

_handle_.css     +1 個 media block
  @media(min-width:721px){ .product-gallery--side[…]:has(.thumb-grid){…}
                           …lead-frame{grid-column:2;grid-row:1}
                           …thumb-grid{grid-column:1;grid-row:1;flex-direction:column;overflow-x:visible}
                           …thumb-frame{flex:0 0 auto} }
```

沒有任何既有規則被修改或刪除。壓縮器把 `@media (min-width: 721px)` 改寫成
`@media(min-width:721px)` —— 這正是只能比產物、不能比原始字串的理由（PITFALLS #13）。

### 3.3 A1b 之後

`before` 側就是上表的 B 產物，所以這一段量到的**只有 mask 這一項**。

| 站 | `social[]` | 每頁替換數 | 差異位置 | head | CSS |
| --- | --- | --- | --- | --- | --- |
| LEMONE / Pawfect / NORDIC / SOMMEIL / TRAILNEST / RIDEFORM / AURELLE / VALOR / AURELIA / LUMIERE | 3 | **3** | 全部在 `<ul class="footer-social">` 內 | 0 不允許 | BaseLayout +128 |
| BROWETOILE | 1 | **1** | 同上 | 0 不允許 | 同上 |

驗收方式：**不數行數。** 建置後的頁尾整段在同一行，所以數行只會答錯問題。
改成逐頁證明兩件事 ——（一）把 `footer-social` 區塊挖掉之後，body 其餘部分逐位元相同；
（二）該區塊內 `<img>` 由 N 變 0、`<span class="footer-mark">` 由 0 變 N，且 N 等於該站
`social[]` 長度。十一站 × 每一頁全部通過，`problems=none`。

CSS 內容差異：

```
移除  .footer-social img{width:16px;height:16px;filter:invert(1);opacity:.85}
新增  .footer-social .footer-mark{display:block;width:16px;height:16px;
        background:var(--color-footer-text);
        -webkit-mask:var(--glyph) center / contain no-repeat;
        mask:var(--glyph) center / contain no-repeat}
```

### 3.4 VALOR 的 build 退出碼 —— 澄清

**`astro build` 成功，失敗發生在 `postbuild`。**

```
> astro build
  18 page(s) built in 4.31s
  Complete!
> node scripts/build-deployment-files.mjs
  Error: build-deployment-files: 1 same-origin file(s) … not in dist/:
    /assets/home/hero.svg  (referenced by dist/404.html)
```

所以：

- `dist/**/*.html` **完整產出**，18 頁全部可比對 —— 這就是 L1/L2/L3 有效的原因。
- 沒有寫出的是 `_headers`、`_redirects`、`robots.txt`、`wrangler.jsonc`。
- `npm run build` 退出碼 **1**（B 與 C 兩次皆是）。

**這是 B2 依設計動作，不是本輪造成的回歸。** VALOR 的 `notFound.heroImage` 指向
`/assets/home/hero.svg`，而它的 `brand/assets/home/` 只有 `hero-v1.jpg` ——
線上 404 頁現在就是破圖，四道稽核全綠。B2 就是為了讓這件事變成 build 失敗。

Pawfect 有**完全相同**的破圖，B 建置卻回 0 —— 因為它是落後七站之一，
`scripts/build-deployment-files.mjs` 屬「不可歸因」而未被套用，新檢查沒跑到它。
**同步輪一到，它會跟 VALOR 一樣紅。**

第一版回報的表格只寫了 L1 而沒有把退出碼列出來，兩句話因此看起來衝突。已修正。

### 3.5 收尾

十一站建置後全部 `git checkout -- .` 復原，`dist/` 清除。
現況：`git status --porcelain` 全空，`## main...origin/main`，無 ahead/behind。

---

## 4. 四道稽核

母版：

```
audit:brand       Brand isolation verified: 5 brand string(s) … none present.
audit:color       Palette contrast verified: 101 token pair(s) across 4 ground(s), all clear.
audit:template    Template boundary verified: 75 shared file(s) match the template at 51cdfa3.
assets:validate   Brand assets validated: 28 declared file(s) present.
npm test          81 / 81
```

### AURELIA —— 24 → 2，形狀符合修訂後的驗收

在母版的 scratch 複本上（帶 AURELIA 的 `brand/`）宣告兩個 fill 的
`groundFloor: 'accepted'` 後：

```
2 floor(s) accepted rather than checked, covering 22 token pair(s)
  — measured, decided, recorded:
    color.cta (#CB938F) — 11 pair(s) vs the light ground's background(s),
      2.23–2.56:1, floor 3:1
      why: …
    color.header-cta-bg (#CE9A96) — 11 pair(s) vs the light ground's background(s),
      2.08–2.39:1, floor 3:1
      why: …

Error: 2 palette contrast failure(s) in brand/identity.ts:
  color.cta-text (#ffffff) on color.cta (#CB938F) — 2.59:1, needs 4.5:1
  color.header-cta-ink (#ffffff) on color.header-cta-bg (#CE9A96) — 2.42:1, needs 4.5:1
```

- 22 筆 fill-vs-ground 全部計入並印出，`why` 兩筆皆有 —— 印成 2 行、各自標明涵蓋 11 對，
  數字 22 在輸出裡看得見。
- 2 筆 label-on-fill **維持 checked、維持紅**（刻意）。
- **0 筆無聲豁免。**

**未編輯 AURELIA。** 宣告本身是店側編輯，屬同步輪；今天 AURELIA 仍然是紅 24。

### B1 的兩個 memory 沒寫到、但會讓它做不出來的東西

1. `scripts/brand-facts.mjs` 用 `topLevelStrings` 讀 `fill`，那個掃描器**會整段跳過物件值** ——
   長格式會被**無聲丟掉**，稽核於是量得比店家宣告的還少。已改成自己的掃描器，
   讀不懂就 throw。
2. `resolveGrounds` 用 spread 覆蓋店家對 header 按鈕的宣告，所以
   `color.header-cta-bg` 是全表唯一沒有店側槓桿的 fill —— 而它**正好是 AURELIA 22 筆裡的 11 筆**。
   已改成店家宣告優先，缺席時才注入。

---

## 5. Palette contrast 對數變化

### 5.1 本輪實際生效（同步四站）

| 站 | 改前 | 改後 |
| --- | --- | --- |
| VALOR | 110 pairs，全綠 | **106** pairs，全綠（−4） |
| LUMIERE | 102 pairs，全綠 | **101** pairs，全綠（−1） |
| BROWETOILE | 102 pairs，全綠 | **101** pairs，全綠（−1） |
| **AURELIA** | **102 pairs，紅 24** | **102 pairs，紅 24**（**不變**） |

減少量 = `color.footer-text` 退出 `dark.ink` 後少掉的配對數，等於該站 `dark.on` 的背景數：

```
VALOR       dark.on = 4  ["ui.cta-dark","color.header-bg","color.scenes-bg","color.scene-card-bg"]  → −4
LUMIERE     dark.on = 1  ["ui.cta-dark"]                                                            → −1
BROWETOILE  dark.on = 1  ["ui.cta-dark"]                                                            → −1
AURELIA     dark.on = 1  ["ui.cta-dark"]                                                            →  0  ← 例外
```

**AURELIA 是例外，而理由是它已經自己做過了。** 它的 `brand/identity.ts` 帶著
`grounds.dark.ink` 覆寫，列出的六個 token **本來就不含 `color.footer-text`**
（就是 `pale-footer-needs-footer-text-freed` 記的那個店側修正）。所以母版把
`footer-text` 移出 `dark.ink` 對它是 no-op，配對數維持 102。

供參考，若 AURELIA 補上宣告：`102 = 80 checked + 22 accepted`，紅 2。

### 5.2 落後七站 —— 本輪不變

| 站 | 改前 = 改後 |
| --- | --- |
| LEMONE / Pawfect / NORDIC / SOMMEIL / AURELLE | 83 pairs，全綠 |
| TRAILNEST | 84 pairs，全綠 |
| RIDEFORM | 79 pairs，全綠 |

`scripts/audit-color.mjs` 與 `src/lib/grounds.mjs` 對它們屬「不可歸因」，未套用。

**同步輪預演**（用改後母版的 `audit:color` 讀各站自己的 `brand/`）：

| 站 | 追平後 |
| --- | --- |
| LEMONE | **紅 11** |
| TRAILNEST | **紅 12** |
| RIDEFORM | **紅 4** |
| Pawfect / NORDIC / SOMMEIL / AURELLE | 101 / 101 / 101 / 103 pairs，全綠 |

與 `accent-ink-split-pending-shops` 記載的 11 / 12 / 4 **一字不差**。那條 memory 準確且仍待處理。

---

## 6. Hand-off 待辦

### 6.0 先讀這一段 —— 這一輪的稽核只覆蓋四站

三件事是同一件事的三個面，而且都指向同一個結論：

| # | 這一輪加的東西 | 實際覆蓋 | 沒被覆蓋的地方 |
| --- | --- | --- | --- |
| **B2** | 同源資產失效檢查 | 同步四站 | **Pawfect 的破圖與 VALOR 完全相同，build 卻回 0** —— 它沒拿到新的 `scripts/build-deployment-files.mjs`，檢查根本沒跑到它 |
| **B4** | `grounds.test.mjs` 的過度指定修好了 | 有那個檔的四站 | **七站連 `tests/grounds.test.mjs` 都沒有**，修正無處可去 |
| **A1a** | `color.footer-text` 移出 `dark.ink` | 母版 + 同步四站 | **十站的 `HomeLanding.astro` 仍在深底上畫它**，那個配對現在沒有人在量 |

換句話說：**這一輪讓母版的稽核更嚴、更誠實，但那個更嚴的稽核目前只作用在十一站裡的四站。**
另外七站不是「通過」，是「沒被問」。

Pawfect 的例子最值得記住 —— 它與 VALOR 有**同一個線上破圖**，
一個 build 紅、一個 build 綠，差別只在誰拿到了檢查。
綠燈在這裡的意思是「沒有人量」，不是「沒有問題」。

**所以同步輪的順序是：先讓七站追平到能被稽核，再談同步新功能。**
先把落後的 `scripts/` + `src/lib/` + `tests/` 帶上去（會炸出 accent 拆分的
11 / 12 / 4，那是預期的、要逐站決定調色），確認四道稽核在十一站都真的在跑，
然後才輪到 `surfaces` / `sameAs` / `productGallery` / `legal.clauses` 這些
「宣告了才生效」的能力。反過來做，等於在七個沒有人量的站上疊新功能。

### 6.1 逐項

**先做這一條。優先度高於本節其他任何一項，包括第 9 條。**

0. **`seo_defaults.noindex` 沒有讀者，三個掛假法人資料的展示站對爬蟲全開** ——
   `BaseLayout.astro` 讀 `merchant.storefront_config.seo_defaults`，但只取
   `og_image` 一個 key。`noindex` 沒有任何地方讀，所以頁面不會有
   `<meta name="robots">`；`scripts/build-deployment-files.mjs` 寫的
   `X-Robots-Tag: noindex` 只掛在交易頁，而這些展示站 `commerce: false`
   根本不建那些頁。robots.txt 則是模板固定寫死的
   `# Search and AI crawlers welcome.` + `Allow: /` + 一份 sitemap。

   **2026-08-25 實測，三站都已上線且都是這個狀態：**

   | 站 | record 的 `noindex` | 線上 `/robots.txt` | record 的 `legal_entity` |
   | --- | --- | --- | --- |
   | AURELIA | `true` | HTTP 200，`Allow: /` + sitemap | （展示範例站，非實際營業人）AURÉLIA BRIDAL |
   | LUMIERE | `true` | HTTP 200，`Allow: /` + sitemap | （展示範例站，非實際營業人）LUMIÈRE Hair Salon |
   | BROW ÉTOILE | `true` | HTTP 200，`Allow: /` + sitemap | （展示範例站，非實際營業人）BROW ÉTOILE 眉藝星采工作室 |

   PEARL 的 record 同樣是 `noindex: true`，目前尚未部署（線上 robots.txt
   還是 Cloudflare 的預設檔），所以它是第四個，不是例外。

   為什麼排在最前面：其他每一條的代價都留在專案內部——一個沒人量的配對、
   一個量了不畫的 token、一個 build 沒跑到的檢查。**這一條的代價在外面。**
   商家在後台把 `noindex` 打開，是一個明確的、已經表達過的意思表示；
   前台收下它、不讀它、然後發一份 sitemap 邀請爬蟲，是我們這邊單方面
   否決了那個意思，而且沒有任何檢查會說話。被索引的內容還帶著
   「非實際營業人」「非實際營業地址」與 `tax_id: 00000000`。

   要做的事：`BaseLayout.astro` 在 `noindex` 為真時輸出
   `<meta name="robots" content="noindex, nofollow">`；
   `build-deployment-files.mjs` 在同一條件下改寫 robots.txt 為
   `Disallow: /` 並停止輸出 sitemap 行，同時對整站下 `X-Robots-Tag`。
   兩處都要，理由同 #246 那段註解自己寫的：robots.txt 擋的是抓取，
   不是索引。

   同時做掉的第二半：`store_name` 與 `seo_defaults.default_title` /
   `default_description`、`storefront_config.brand.{logomark,tagline_zh,story}`
   也一樣沒有讀者。站名唯一來源是 `identity.name`，所以一個沒填 brand/ 的
   商店會產出「首頁 | Example Store」，而同一頁的 JSON-LD `legalName`
   已經是正確店名——**同一份文件兩個名字**。PEARL 於 2026-08-25 以手寫
   第二份的方式解掉（見該站 `brand/identity.ts` 的註解），那份副本就是
   這條修好之後要刪的東西。

1. **B4 傳播** —— `tests/` 不在 lock。手動複製 `tests/grounds.test.mjs` 到
   **VALOR / AURELIA / LUMIERE / BROWETOILE**。
   **其餘七站根本沒有這個檔。**
2. **`tests/` 是否納入 lock** —— 本輪刻意不決。納入會讓那七站缺檔直接報 missing，
   是 lock 邊界的決定，不是十五條之一。
3. **Pawfect + VALOR 的 `notFound.heroImage`** —— 都指向不存在的
   `/assets/home/hero.svg`，**兩站的線上 404 頁現在都是破圖**。
   VALOR 的 build 現在會失敗；Pawfect 的不會，**只因為新檢查還沒到它手上**。
   同步前必須先修這兩個路徑，否則同步當天兩站一起紅。
   見 6.0 —— 這一項是「稽核覆蓋不完整」的證據，不只是兩個壞路徑。
4. **B3 五站雙按鈕** —— Pawfect / NORDIC / VALOR / AURELIA / BROWETOILE 的 404 頁
   兩顆按鈕仍指同一處（`/products` 被 `contentPages: false` 濾掉）。
   本輪只做偵測：build 會印一行說明是哪個 flag 關掉了它。**未修。**
5. **十一站 `audit:template`** —— 同步前全紅（手上是舊 lock）。這是同步輪的入口條件，
   不是回歸。
6. **AURELIA 宣告兩個 accepted fill floor**（24 → 2）。
7. **八站改用 `sameAs: false`** —— 機制已出貨，但在每站宣告之前，
   它們仍然只靠協定相對 href 撐著，`^https?://` 一放寬就同時失效。
8. **十站把自己 `HomeLanding.astro` 的四條 `--color-footer-text` 改成
   `--color-on-dark-muted`** —— 母版已把 `footer-text` 移出 `dark.ink`，
   那十站仍在深底上畫它，**那個配對現在沒有人在量**。
9. **`--text-price` 的唯一讀者可以被商店刪掉，稽核的註解不會跟著更新** ——
   `scripts/audit-color.mjs`（locked，約 331 行）寫著「`.catalogue-price` 讀的是
   `var(--text-price, var(--ground-ink-soft))`」。那條 CSS 規則是 `--text-price`
   在 `src/` 裡的**唯一**讀者，而它住在 shop-owned 的 `HomeLanding.astro`。
   一個不報價的商店把它刪掉（PEARL 已於 2026-08-24 刪除），token 的讀者就歸零：
   `GroundOverride.price` 照樣收值、`audit-color` 照樣量它的 AA 樓地板，
   **量完沒有任何東西會拿去畫**。四道稽核全綠，因為沒有人問這個問題。

   容易猜錯的一點：**PDP 不是那個倖存的讀者。**
   `src/pages/products/[handle].astro` 的 `.price` 用的是 `var(--color-ink)`。
   「商品頁有價格，所以 token 還活著」這句話是錯的，說之前先 grep。

   兩條路，二選一，但要在母版一次做完：把 PDP 的 `.price` 指向
   `var(--text-price, …)`（token 自己的理由本來就是在講那個數字），
   或者把 price role 從 ground table 與稽核一起退役。
   **不要只讓商店刪 token** —— 那只是把這句不成立的話搬個地方。
   形狀同 PITFALLS #3 那次 `wrangler.jsonc`：locked 檔對產物做了一個
   已經不成立的陳述，而商店改不到它。
10. **PITFALL #7 的第三個實例，而且這次知道成因** —— PEARL 的桌機 hero，
    整塊 `.hero-copy` rect 量出 **36.41% 低於 AA**；同一張圖同一段文案，
    逐字量是 **0/58**。差距不是誤差，是**那個矩形包含了空白**。

    rect 是 `.hero-copy` 子元素的聯集，寬度等於容器（1440 視窗上是 1200px），
    而文字靠左、`max-width: 520px`。所以矩形右邊那半塊**永遠不會有字**，
    它量到的是照片本身。照片右半是那隻手，於是百分比被拉高到 36%。

    前兩個實例（PITFALLS #7 內文的手機 scrim 8.04%、以及本輪 BROW ÉTOILE）
    都只記錄了「rect 百分比會虛高」。這一個補上**為什麼**：
    `max-width` 小於容器寬時，虛高的量約等於
    `1 - (文案柱寬 / 容器寬)`，在 landing 版是 `1 - 520/1200 ≈ 57%` 的面積
    根本不參與可讀性。這個比例是可以先算出來的，不必量完才發現。

    `docs/PITFALLS.md` 是 locked，本輪不改。要補的話，建議把上面那個式子
    寫進 #7 的第三步半，讓下一個人在量之前就知道 rect 百分比會偏高多少。

11. **PEARL 的 rail / footer 三顆全都不是這家店的帳號** ——
    `identity.social` 三筆（LINE / Instagram / Facebook）都是**代理商的
    共用帳號**，多站指向同一組，在這家店只是佔位，等 PEARL 自己開帳號再換。

    ~~原本這條寫「只有 LINE（`@pearl.nail`）是 PEARL 自己的」——**撤回**。~~
    `@pearl.nail` 是從設計稿抄下來的，**那個帳號不存在，line.me 回 404**。
    真正在用的是共用的 `@060mzbbf`，merchant record 的
    `storefront_config.social_links.line` 一直都是它。2026-08-25 已更正
    （PEARL commit `0557d66`）。

    **這件事本身就是一條可重複的教訓**：設計稿是意圖的圖片，不是註冊紀錄。
    稿上出現的帳號、電話、統編都要回 merchant record 對，不能照抄。
    而且錯的代價不對稱 —— `identity.line.id` 會流進 `src/lib/line.ts` 的
    `/R/oaMessage/<id>/?<message>`，也就是**每一張商品卡的詢問按鈕**。
    在 `commerce: false` 的展示站上，那是顧客唯一能按的東西，
    而四道稽核沒有一道會去解析一個外部 URL 是否活著。

    三筆都已宣告 `sameAs: false`，所以 Organization JSON-LD 不會出現
    `sameAs`，爬蟲不會被告知「這幾個站是同一個組織」。**這是目前唯一
    擋住那個錯誤宣稱的東西**，而它是一個宣告，不是一個檢查 —— 誰把
    `sameAs: false` 拿掉，四道稽核都不會說話。與 6.1 第 7 條同源。

    換成真帳號時要一起改的：`sameAs` 可以拿掉（那時它們真的是這家店的
    檔案頁），而在那之前不行。
12. **`--hero-eyebrow-ink` 的 fallback 兩個 preset 不一致** ——
    `HomeLanding.astro:663` 是 `var(--hero-eyebrow-ink, var(--color-cta))`，
    `HomeMultipage.astro:246` 是 `var(--hero-eyebrow-ink, var(--text-muted))`。
    同一個角色、同一個 token 名、兩個不同的預設來源，而且沒有任何商店
    宣告過 `--hero-eyebrow-ink`，所以**每一站吃到的都是 fallback**。

    後果不是美感問題，是一個看不見的耦合：landing 版的 hero eyebrow 由
    **按鈕顏色**決定。PEARL 把 `--color-cta` 從 `#1a1a1a` 調成 `#636363`
    （按鈕自己的對比需求，見 6.1 第 9 條那一輪），hero eyebrow 就跟著變成
    中灰——而 `#636363` 壓在**純白**上的上限是 **6.01:1**，於是那一站的
    hero 可讀性天花板被一個跟 hero 無關的決定訂死了。改照片、改裁切、
    加濃遮罩都突破不了它。

    兩件事一起做：兩個 preset 的 fallback 統一（`--text-muted` 是比較
    合理的那個，eyebrow 是文字不是按鈕），並讓 `--hero-eyebrow-ink`
    成為 `brand/identity.ts` 可宣告的 token，這樣想要柔灰 eyebrow 的站
    可以自己說，而不是靠借按鈕的顏色。

13. **`mobileCopyGround` 不寫等於繼承桌機，不是 'none'** —— 母版行為，
    不是任何一站的事。`src/lib/hero-copy.ts` 的 `heroMobileCopyGround()` 在欄位
    缺席時回傳 `heroCopyGround(hero)`，也就是桌機的答案。這個預設是刻意的
    （若讓缺席等於 'none'，這個欄位一出貨就會把每一站手機版的遮罩靜默拿掉，
    而量測說手機正是最需要那層洗白的地方），但它的後果是：
    **「把 hero 遮罩拿掉」永遠是兩行，不是一行**。

    只寫 `copyGround: 'none'` 的站，桌機乾淨、手機仍留著一層洗白，
    而且 build 綠、四道稽核綠、沒有任何一道會提到它 —— 同 PITFALLS #10 的形狀：
    沒有人在問那個問題。PEARL 2026-08-25 就是照兩行拿掉的
    （`brand/copy.ts` 的 `homeLanding.hero`，commit `0b02930`），
    **下一站拿掉時會再撞一次**。

14. **`LOCKED_ROOTS` 逐名列檔，所以「有沒有被點名」決定一個檔會不會同步、
    也決定它會不會被檢查** —— 這一條是整類問題的解釋，不是單一檔案的待辦。

    `scripts/template-lock.mjs` 的 `LOCKED_ROOTS` 列的是 `docs/PITFALLS.md`
    這個**檔名**，不是 `docs/` 這個目錄。於是同一個目錄裡的兩個 Markdown
    走上兩條完全不同的路：

    | 檔案 | 被點名 | 十一站的實況 |
    | --- | --- | --- |
    | `docs/PITFALLS.md` | 是（在 `template.lock.json`，`3c2ef7f7b3bdd25b`） | **逐位元相同** —— 母版與 PEARL 都是 945 行、sha256 `3c2ef7f7…` |
    | `docs/master-round-report.md` | 否 | 十一個 fork 各自漂 —— PEARL 465 行 / 母版 607 行，兩個 hunk，PEARL 獨有 9 行、母版獨有 151 行（6.1 的 0/9/10/11/12 與整節 6.2） |

    **同一個目錄、同一種檔案，差別只在有沒有被點名。**

    兩個症狀是同一個機制的兩面，而且都不會有人喊：
    **不會同步**（沒有人把它帶過去），**不會被檢查**（沒有人比對它）。
    `audit:template` 比的是 lock 裡的雜湊 —— 不在 lock 裡的檔案，
    它不是「通過」，是**沒有被問**（同 6.0 對 Pawfect 的那句話）。

    第三個實例已經在本節第 1、2 項裡：`tests/grounds.test.mjs` 不在 lock，
    所以 B4 的修正要**手動**複製到四站，而另外七站連這個檔都沒有，
    修正無處可去。它與報告檔的差別只在誰想起來要複製，不在任何檢查。

    所以「`tests/` 要不要納入 lock」不是逐檔的品味問題。要問的是同一句話：
    **這個檔漂掉的時候，有沒有任何東西會說話？** 沒有的話，答案就是點名它，
    或者接受它從此是十一份各自為政的副本 —— 兩者都可以，
    不能接受的是以為它在同步而它沒有。

    （這一條由 PEARL 撞出來：第 13 條先寫進了 PEARL 自己的報告副本，
    才發現那份副本與母版已經雙向漂移。PEARL 側記在它自己的 6.1 第 10 項。）

### 6.2 量測方法 —— hero 逐字對比可以離線掃

這一段記的是**做法**，不是某一站的結果。PITFALLS #7 第三步半要求逐字量測，
而逐字量測要開瀏覽器，一次約 40 秒 —— 挑一張 hero 照片要試十幾種裁切，
光是等就足以讓人放棄比較、直接選第一張過關的。

不必這樣。瀏覽器裡只有兩樣東西是**跟照片無關**的，各抓一次就好：

1. **scrim 的 alpha map。** 塞一張純黑的 780x1040 進 `mobileImage`，
   隱藏文案後截圖 —— 照片是 0，所以留在畫面上的灰階值**就是那層白洗的
   覆蓋率**，除以 255 得到逐像素的 alpha。存成 PNG。
2. **58 個字的 rect。** 用 `Range` 逐字取 `getBoundingClientRect()`，
   連同各自元素的 `getComputedStyle().color` 一起存成 JSON。
   座標記成**相對於圖片框**，這樣換照片不會失效。

之後每個候選裁切都可以純離線評分：把候選縮到圖片框的尺寸，
`合成 = alpha*255 + (1-alpha)*照片`，再對每個字的 rect 算 WCAG 對比。
沒有瀏覽器、沒有截圖、沒有等待。

PEARL 這一輪用它掃了八張照片 × 各自的裁切位移，幾分鐘跑完；
**離線模型與瀏覽器實測的差距是 0.03**（模型 5.08、瀏覽器 5.05）。

⚠️ 兩個前提，破了就不準：

- alpha map 綁死一組 **viewport + scrim 設定**。改視窗尺寸、改 `scrim.depth`
  或 `copyGround`，就要重抓一次。
- rect 綁死**文案內容與字級**。改標題字數或字級，rect 全部作廢 ——
  這就是 PITFALLS #9 說的「型別改動使掃描結果失效」，同一件事。

所以順序是：**先定文案與版位，再掃照片。** 最後仍然要用瀏覽器實測
確認一次，離線掃是用來**排除**候選的，不是用來簽收的。

---

## 7. 撞到的 PITFALL

### #12 共用資源 —— 平行污染

中途發現**兩個 run 並行**（VALOR 與 SOMMEIL 同時 `npm run build`）。
`TaskStop` 只殺了父行程，**沒有收掉子行程**，被中止的那一輪仍在跑，
兩邊寫同一組結果目錄。

處理：殺掉所有 `run-shop.sh` / `run-all.sh` bash 與 `astro build` / `npm run build`
行程（**只殺這些**，因為這台機器上還掛著多個舊 session 的
`astro preview --port 4399` / `--port 4327`、`wrangler dev --port 8788` / `8790`、
`gold-live.mjs`，都不是這一輪的），確認十一站全部乾淨，然後**整輪重跑**。

**本報告第 2 / 3 / 5 節的所有數字，全部出自污染後的乾淨重跑。**
`runs/` 目錄先整個刪除再重建，最舊的檔案時間是 16:03:29（LEMONE 的第一次建置），
之後十一站的時間戳嚴格單調、每站相隔約 20–25 秒、**沒有任何重疊** ——
那正是單一循序執行的形狀，兩個並行的 run 不可能產生。
A1b 那一輪同理（16:13:41 → 16:15:44）。**沒有任何一站是污染前的殘留。**
第 5 節的對比量測是全部建置結束之後才跑的，讀的是各站未被動過的 `brand/`。

### `audits-read-comments` —— 又一次

A1b 的註解裡寫了兩個 hex 值，`audit:color` 立刻讓 build 失敗：

```
2 colour literal(s) found in src/:
  src/components/common/Footer.astro:229  #fbf9f6
  src/components/common/Footer.astro:230  #e5e5e5
```

改成文字描述（「a near-white one」）。註解也是 `src/`。

### 新的一條 —— Astro 的 `{...spread}` 會注入 scope class（已寫進 PITFALLS #13）

A1c 第一版寫成

```astro
<a href={link.href} {...external(link.href)}>
```

編譯期無法確定屬性集合，於是 Astro 除了 `data-astro-cid-*` **再補上 scope class**
`class="astro-l3trhy4j"`。頁尾每個欄位連結與底欄連結各多 22 bytes，
**每頁 322 bytes、每一站的每一頁**，而畫面完全沒變。

第一次 L1 比對就攔下來了 —— 這正是「body 逐位元」這條硬條件的價值：
一個看起來只是換寫法的重構，實際輸出並不等價。

改成寫出屬性、值給 `undefined`（Astro 不輸出 `undefined` 屬性）後，差異歸零。

### 新的第二條 —— 不存在的旗標被靜默忽略（已寫進 PITFALLS #13）

為了確認這份報告會不會被收進 `template.lock.json`，跑了

```
node scripts/write-template-lock.mjs --dry
```

**`--dry` 不存在，腳本從來不讀 `process.argv`，於是它照常把 lock 寫出去。**
輸出是

```
template.lock.json written: 75 locked file(s), 2 baseline file(s), at 51cdfa3.
```

那個 `75` 正好是當下要問的問題的正確答案（報告檔沒有進鎖），
所以整行讀起來完全像一次成功的乾跑。

實際發生的是 `template.commit` 被重新蓋章，
從 `33e1dd2`（帶著 A1b 的 commit）改成 `51cdfa3`（只是替它蓋章的 commit）。
75 個雜湊一個都沒動，所以**四道稽核前後都是綠的** ——
`audit:template` 比雜湊，不比指標。唯一會說話的是 `git diff`，只差兩行。

已 `git checkout -- template.lock.json` 復原，sha256 回到 `331f2280…`。

重點不是旗標拼錯，是：**一個不影響任何檢查的欄位，就是沒有任何檢查會攔它的欄位** ——
而它偏偏是這一輪用來辨識自己的那個指標。

### 新的第三條 —— sharp 一定先 resize 再 composite（待寫進 PITFALLS #13）

PITFALLS.md 這一輪是 locked，所以先記在這裡，下一輪再進 #13 的實例清單。

離線掃 hero 裁切時要在候選圖上畫出「文案落點」與「手機真正看得到的窗」，
寫成

```js
sharp(buf).composite([{ input: overlay }]).resize({ width: 300 }).toBuffer()
```

得到的是

```
Error: Image to composite must have same dimensions or smaller
```

**訊息指著 overlay，成因在呼叫順序。** sharp 的管線階段是固定的，
不照呼叫順序走：resize 永遠先跑。所以底圖已經被縮成 300x400，
才輪到 780x1040 的 overlay 疊上去 —— 於是「overlay 太大」這句話字面上是對的，
而 overlay 從頭到尾都是對的尺寸，錯的是它被拿去疊在一張已經縮好的圖上。

**報錯了，但報錯的地方不是出錯的地方。** 這正是 #13 那一族的形狀：
第五族講的是「不報錯的錯」，這一條是它的鄰居 —— 報了錯，而錯誤訊息
把人指向一個沒有問題的物件，於是照著訊息去改 overlay 的尺寸，
改多久都不會對。

修法是拆成兩次 `sharp()`：先疊、輸出 buffer，再縮。

```js
const marked = await sharp(buf).composite([{ input: overlay }]).png().toBuffer();
const tile = await sharp(marked).resize({ width: 300 }).png().toBuffer();
```

同一個管線順序也解釋了另一個更早的症狀：`sharp(src).composite([svgBuffer])`
在 src 與 SVG 宣告同尺寸時仍然報同一句話 —— SVG 是以 DPI 算點陣尺寸的，
渲染出來比宣告的大。先把 SVG 用 `resize(w, h, { fit: 'fill' })` 定到確切像素
再疊，就沒事。兩個症狀、一句錯誤訊息、兩個都不在訊息指的地方。

### #13 的壓縮器改寫

比 CSS 時看到 `@media (min-width: 721px)` 被壓成 `@media(min-width:721px)`，
所以全程用「改前產物 vs 改後產物」比較，不用原始碼字串。

---

## 8. 砍掉的條目

**C2 —— hero 第三層字級。砍掉。**

`assertHeroCopy` 不拒絕未知的 top-level key，而 `HomeLanding.astro` 與
`brand/copy.ts` **兩邊都是 shop-owned**。所以想要第三層字級的站，
今天就可以自己加，沒有任何母版關卡擋著它。在母版做只服務下一個 fork，
而且手上沒有設計稿，只會是猜一個欄位名然後十一站沒人用。

要重新排入，請附上設計稿上那三層的實際字級與位置關係。

**D5 與 D1 的 HomeLanding 半 —— 做了，但要記得它們到不了十一站。**
兩者都落在 shop-owned 檔裡。VALOR 是唯一 `align: 'right'` 的站，
需要同一行修正在它自己的 `HomeLanding.astro`。
D1 真正對十一站生效的是 `src/routes/faq.astro`（locked）。

---

## 9. 字型盤點 —— 2026-08-28

十六站唯讀盤點（YANGFA 建置中，跳過）。本輪只動了 P2，其餘記錄待辦或不做。

### 9.1 盤點結果

`@font-face` 自託管字型：**十六站全部沒有**，`src/` 與 `public/` 都沒有字型檔。
字型只有兩種來源：系統堆疊，或 Google Fonts（`BaseLayout.astro` 一行 `<link rel="stylesheet">`）。

| 類別 | 站 |
| --- | --- |
| A 沒宣告（系統字） | LEMONE、RIDEFORM、VALOR、AURELLE、AURELIA、LUMIERE、PEARL |
| B 有宣告且載得到 | Pawfect、NORDIC、SOMMEIL、TRAILNEST、BROWETOILE、SERENITE、VTONG、EARSPA、MUBU |
| C 有宣告但載不到 | **零站** |

九站的 CSS 與字型檔全部 200，零失敗請求。HTML 裡的 link 數與 repo 宣告完全一致。
**擔心的 C 類不存在**，問題在 B 類的代價與 A 類的宣告不實。

Slow 3G（CDP，latency 2000ms / 400kbps）實測：

```
                        FCP        fallback 可見    字型檔     位元組
A 類（無 webfont）    4.57-6.22s        n/a           0          0
B 類（雙字族八站）    9.64-13.87s    19.6-22.0s     29-34    2.06-2.51MB
NORDIC（單字族）       6.97s          8.4s           4       0.24MB
```

未節流時 fallback 只有 50–111ms，所以**這個問題只在慢速網路存在**。

### 9.2 兩個量測陷阱 —— 兩個訊號同時瞎掉

這一輪最重要的產出不是數字，是**前兩版探針全綠而且全錯**。

**陷阱一：開發機裝了 Noto，`document.fonts.check()` 假陽性。**

`document.fonts.check(shorthand, text)` 的語義是「這段文字現在能不能用這個堆疊算繪」，
**不是**「webfont 到了沒」。堆疊首項若是一個本機已安裝的字族，
它在 webfont 還沒下載完就回 `true`。這台機器裝了 Noto Sans TC 與 Noto Serif TC，
於是所有 B 類站在首次繪製當下就回 `true`，量出來的 fallback 窗口是 **0ms**。

**陷阱二：CJK 全形等寬，寬度法測不到 swap。**

備援方案是量 h1 的 `Range.getBoundingClientRect().width` 隨時間變化。
對拉丁字有效，**對 CJK 無效**：漢字字身一律 1em，
換字型不改變任何一個字的寬度。整條時間軸上寬度紋風不動，`swapAt` 永遠是 `null`。

**危險方向 —— 這個坑在開發機上永遠是綠的。**
兩個訊號各自獨立、看起來互相印證，實際上**同時失明**，
而且失明方向一致：都報「沒有 fallback 窗口」。
於是「最終狀態全綠」不是結論，是這兩個工具在這個組合下的**必然輸出** ——
CJK 站 + 裝了目標字型的工作機，這兩個條件在本專案是常態而非例外。

還有第三個較淺的坑：第 5 題原始要求「比較 `document.fonts.ready` 前後的 computed font-family」，
**這個量法本身測不出時序**。computed style 回傳的是宣告清單字串，
不是實際採用的字面，載入前後永遠相同。

**對策 —— 唯一沒被污染的訊號是網路與繪製時間戳。**
改用 CDP，兩者掛在同一條單調時鐘上：

```js
cdp.on('Page.lifecycleEvent', e => { if (e.name === 'firstContentfulPaint') fcp = e.timestamp; });
cdp.on('Network.loadingFinished', e => { /* fonts.gstatic.com 的 responseEnd */ });
// fallback 可見時間 = 字型 loadingFinished - FCP
```

需要 `Page.setLifecycleEventsEnabled({enabled:true})`，否則 `firstContentfulPaint` 不會送。
另外 `performance.getEntriesByType('resource')` 在這些頁上**取不到字型項**（回空陣列），
不要拿它當位元組來源；`Network.loadingFinished` 的 `encodedDataLength` 才可靠。

還有一個非陷阱但會誤導的量法：曾用 h1 的 layout 寬度當「首次繪製」，
**它比 FCP 早**（外部 stylesheet 阻擋算繪，但不阻擋 `getBoundingClientRect` 以預設樣式回值），
於是量出「FCP 在 CSS 之前」這種不可能的結果。要用 FCP 就用 FCP。

### 9.3 P1 preconnect —— 排入母版輪，本輪不做

十六站**全部沒有任何 preconnect**。九站的 FCP 一律落在 Google Fonts CSS 的
`loadingFinished` 之後 90–150ms —— 這條 CSS 在關鍵算繪路徑上。
慢速下等於整頁空白多等一次 `fonts.googleapis.com` 的 DNS+TLS+RTT，
再多等一次 `fonts.gstatic.com` 的（字型檔在第二個 origin，
瀏覽器要等 CSS 解析完才知道它存在）。

改法（`BaseLayout.astro`，條件輸出）：

```astro
const usesGoogleFonts = identity.fontStylesheets.some((href) =>
  href.startsWith('https://fonts.googleapis.com/')
);
...
{usesGoogleFonts && (
  <Fragment>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  </Fragment>
)}
```

兩個要點：**條件輸出**（`fontStylesheets` 為空的七站不得吐出，那是白開連線），
以及 **gstatic 那條必須帶 `crossorigin`** —— 字型是 CORS 模式抓的，
preconnect 的 CORS 模式不符會另開一條連線，看起來有做實際沒用。

**本輪未實作**（曾改後已 `git checkout` 還原，母版工作區乾淨）。

⚠️ 排程時注意：**`BaseLayout.astro` 目前有兩個版本**，母版一行改不到十一站。

```
與母版相同（8）  AURELIA LUMIERE BROWETOILE PEARL SERENITE VTONG EARSPA MUBU
落後一輪（8）    LEMONE Pawfect NORDIC SOMMEIL TRAILNEST RIDEFORM VALOR AURELLE
```

落後那組的 `BaseLayout.astro` 差異正是 `sameAs !== false` 那條修正；
VALOR 整個 `src/` 落後母版 12 檔，AURELIA 只落後 1 檔（`HomeLanding.astro`）。
所以 P1 是「母版改 + 同步輪」兩件事，不是一件。

### 9.4 P2 已修 —— VALOR 與 AURELLE 的堆疊首項

兩站 `fontStylesheets: []`，但堆疊首項寫著一個**永遠不會被載入**的字族：
VALOR 的 `body`/`sans`/`zh-sans` 首項是 `"Noto Sans TC"`、
`serif`/`serif-display` 首項是 `"Noto Serif TC"`；AURELLE 是後兩者。
實測兩站下載 0 個字型檔。首項無法生效，堆疊靜默落到第二項。

**這條之所以能活這麼久，正是 9.2 陷阱一的直接後果**：
裝了 Noto 的工作機會從本機解析出那個首項、算繪出檔案宣稱的樣子，
所以在最可能被拿來檢查的機器上，它看起來是對的。

已把首項拿掉，剩下的就是本來一直在算繪的東西。
**對真實訪客零視覺變化**，改的是這個檔案宣稱了什麼。
驗證方式（不能靠肉眼）：用 bogus family 當基準線量各候選字族是否存在，
確認 `declared first === first available`。舊堆疊在本機解析到 Noto（印證陷阱），
新堆疊解析到 Georgia —— iOS 與 Windows 都有。

註：這個量法**只對具名字族有效**。`system-ui` / `-apple-system` / `sans-serif`
是系統關鍵字不是字族名，拿 bogus 基準線量它們會得到假的「不存在」
（bogus family 本身就落回同一個預設字），不要把那幾行當成發現。

`npm test`（`audit:brand` + `audit:color` + `audit:template` + 單元測試）：
VALOR 74/74、AURELLE 54/54 全綠。

### 9.5 P3 / P4 —— 結案，不做

**P3：B 類八站的 2.06–2.51MB 與 19.6–22.0 秒 fallback。**

不做，因為減量等於改設計。但 NORDIC 的對照留著，它是這件事的證明：

```
NORDIC     宣告單一字族三個字重，只有 hero 吃 webfont
           （--font-serif 是系統 sans 堆疊，hero 才是 Noto Serif TC）
           → 4 個 subset、0.24MB、fallback 8.4s

其餘八站   內文與標題都吃 webfont
           → 29-34 個 subset、2.06-2.51MB、fallback 19.6-22.0s
```

**驅動成本的是「頁面上有多少文字吃 webfont」，不是宣告了幾個字重。**
Google 的 CJK CSS2 依 unicode-range 切成約一百個 subset，
瀏覽器只抓用得到的 —— 所以決定位元組的是頁面上出現多少不同的字，
而那是「哪些元素用 webfont」的函數。減字重只按比例縮一點，
把 webfont 收斂到標題級元素才是數量級的差別。

**結案理由：系統預設就好。** A 組七站維持不宣告，B 組九站已經載了就不動。
以下觸發條件**留作紀錄**，不是待辦 —— 將來若有人重新提起這件事，
這是當時量到的門檻，不必重跑一次盤點：
- 某站慢速重測 FCP 超過 **10s**（目前 B 類 9.64–13.87s，已有五站在線上）；
- 或 fallback 可見時間超過 **20s**（目前八站有六站在線上）；
- 或該站要進行動網路為主的投放。

若真要重啟，第一順位是「把 webfont 收斂到 hero / 標題」，不是砍字重。

**P4：BROWETOILE 的 Cormorant Garamond。**

結案，不做。`--font-serif-display` 全站只有一個消費者 —— `Footer.astro` 的頁尾字標
（實測該站只載入 5 個 Cormorant face 中的 1 個）。為一個元素多載一個字族，
但那是設計上的字標選擇。SERENITE 情況不同：它的 `--font-serif` 首項就是 Cormorant，
全站標題都在用，屬合理，不在此列。

### 9.6 順帶記錄

- `display=swap` 九站都已在 URL 裡，不用動。
- RIDEFORM 與 NORDIC 的 `--font-serif` 是 **sans 堆疊**（刻意），
  所以這兩站的標題與內文只靠字重分層，不靠字族。
- LEMONE 工作區有未 commit 的改動（見下輪交接），量測期間未動。

---

## 10. CJK 換字型：寬度不用重算，遮罩要重掃

2026-08-28，三站 hero 換上 Noto Serif TC 時量到的，值得單獨記一條，
因為它決定「換字型之後哪些驗收要重跑」。

**兩件事的依據不同，而且方向相反。**

### 寬度計算與字族無關

CJK 排版的行寬是純算術，式子裡沒有字族項：

```
行寬 = 字數 × font-size × (1 + letter-spacing/em)
```

漢字字身一律 1em，**任何** CJK 字面都一樣。所以換字型不會改變斷行位置。

這是量出來的不是推的：AURELIA 換字型前後，四個寬度的行寬**逐像素相同**
（156/281、176/316、183/329、190/342），連 9.2vw 那個 cap 都不用重選。

推論：**換字型不必重跑斷行驗收**（重跑一次確認即可，但不會變）。
反過來，改字數、改 letter-spacing、改頁面 padding 就一定要重算 ——
那三個才是式子裡的變數。

### 落墨量與字族有關

同一批字，襯線體與黑體**每字的著墨面積不同**。所以任何以
「筆畫覆蓋面積 / 逐字對比」為判準的東西，換字型就失去依據。

AURELIA 的手機遮罩是實例：45% 是在手機 fallback 到系統黑體時掃出來的，
換成 Noto Serif TC 之後重掃，**45% 在 390 讓內文掉了 2 個字** ——
正是它當初被選來扛的那個角色。重掃後改為 50%。

```
pct   headline min/fail    body min/fail(320..390)   photo kept
 45   3.92 / 1-2           4.28-4.90 / 0-2            78%   舊值
 50   4.49 / 1             4.57-5.16 / 0（四寬皆過）   74%   新值
 55   5.11 / 0             4.90-5.42 / 0              70%
```

選 50 不選 55：內文（換字型後掉的那個角色）四寬度都過且有餘裕，
headline 剩一個字 4.49（差 0.01，且 sub-AA **筆畫面積** 從 45% 起就是 0.00%），
再買那 0.01 要多付 5 個百分點的照片。判準是「讀得出來 + 照片主體完整」，
不是「第一個過 AA 的值」。

### 一句話

**換字型 → 重掃遮罩，不用重算斷行。**
改文案／字級／letter-spacing／padding → 重算斷行，也要重掃遮罩。

⚠️ 兩者都沒有稽核擋著（PITFALLS #9 與 #10），只能靠記得。
