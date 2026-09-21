/**
 * legal.ts — the variables the two legal pages interpolate.
 *
 * ## What is and is not templated
 *
 * Only the *variables* live here: the trading name printed inside the clauses,
 * the service e-mail and site URL the contact clause quotes, each page's
 * banner copy, and its effective date. The clause TEXT itself stays in
 * `src/pages/privacy.astro` and `src/pages/terms.astro` and is NOT rewritten by
 * this layer.
 *
 * That boundary is deliberate. A clause describes how a business actually
 * operates — what it does with personal data, how long it keeps it, which
 * third parties it hands it to. Turning those into config would let a new shop
 * change its legal position by editing a value, which is exactly the mistake
 * worth preventing. Read the clauses, edit the ones that do not match how you
 * trade, and have someone qualified check the result.
 *
 * WHERE YOU EDIT THEM IS HERE, and it did not used to be. `src/pages/` is
 * byte-checked by `audit:template`, so editing a clause there turned the shop's
 * own build red — the README asked for something the audit forbade. Each page's
 * optional `clauses` is where a shop that has rewritten its document puts it;
 * absent, the template's text renders unchanged. See `LegalClauses`.
 *
 * ## The clauses shipped here assume LINE Login only
 *
 * There is no password to collect, reset or safeguard. A storefront with
 * e-mail-and-password accounts has to rewrite the account clauses.
 *
 * The remaining company facts — legal entity, tax id, phone, address, service
 * hours — are NOT here: they derive from the merchant's `storefront_config`
 * so the footer, the contact page and the legal pages cannot disagree.
 *
 * 本檔提供的條文為範本，需依實際營運狀況調整。
 */
import { identity } from './identity';
import { commerce } from './commerce';

/** One numbered clause: a heading, its paragraphs, and an optional list. */
export type LegalSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
};

/**
 * The clause text of one legal page, when a shop writes its own.
 *
 * ## Why this exists, and why it is OPTIONAL
 *
 * README step 3 tells a shop to read `/privacy` and `/terms` and edit the
 * clauses that do not match how it trades. Both files are in
 * `template.lock.json`, so `npm run audit:template` compares them byte for
 * byte — and the lock generator has to be run in the TEMPLATE, because running
 * it in a storefront re-blesses whatever that storefront changed. So the
 * instruction and the audit contradicted each other, and a shop carrying out
 * the instruction turned its own build red with no legitimate way back.
 *
 * The cost was not theoretical. A showcase salon that ships nothing and takes
 * no payment online served 訂單與付款 / 配送 / 退換貨 clauses, and a privacy
 * policy claiming it collected 訂單資料 and 購物車內容. Its `/returns-policy`
 * HAD been rewritten — entirely through `legal.returns` below — which is what
 * proves the shape works.
 *
 * ## The boundary this does NOT move
 *
 * The concern that kept clauses out of config was that turning them into values
 * lets a new shop change its legal position by editing a config. That concern
 * is answered by these being ABSENT by default: the template still ships the
 * clauses, in full, in `src/pages/`, and a shop that says nothing here gets
 * them unchanged, byte for byte. Declaring `clauses` is not a dial to nudge —
 * it is writing the document, deliberately, in one place, and it is the moment
 * to have someone qualified read the result.
 *
 * The statutory contact block is not here: it derives from the merchant's
 * `storefront_config`, so the footer, the contact page and the legal pages
 * cannot disagree. Only its HEADING is settable, because a shop with a
 * different number of clauses needs a different number in front of it.
 */
export type LegalClauses = {
  introParagraphs: string[];
  sections: LegalSection[];
  /** Heading of the derived contact clause the page always appends last. */
  contactHeading: string;
  /** The line above its bullets. */
  contactLead: string;
};

export type LegalPage = {
  /** Banner heading above the intro paragraphs. */
  introTitle: string;
  /** ISO date printed as 最後更新. Bump it when a clause changes, not before. */
  effectiveDate: string;
  /** <meta name="description">. */
  description: string;
  /**
   * This shop's own clause text. ABSENT means the template's, which is what
   * every storefront on this template ships today. See `LegalClauses`.
   */
  clauses?: LegalClauses;
};

export const legal = {
  /**
   * The trading name printed inside the clauses. Usually `identity.name`, but
   * a shop that trades under a different registered name says so here.
   */
  tradingName: identity.name,

  /** The address the contact clause tells readers to write to. */
  contactEmail: identity.contact.email,

  /** Public site URL, quoted where a clause has to name the site itself. */
  siteUrl: commerce.siteOrigin,

  privacy: {
    introTitle: `${identity.name} 隱私權政策`,
    effectiveDate: '2026-01-01',
    description: `${identity.name} 隱私權政策`
  } as LegalPage,

  terms: {
    introTitle: `${identity.name} 使用條款`,
    effectiveDate: '2026-01-01',
    description: `${identity.name} 使用條款`
  } as LegalPage,

  /**
   * 退換貨政策 (/returns-policy).
   *
   * Unlike privacy and terms — whose clause TEXT deliberately lives in
   * src/pages/ so nobody can change their legal position by editing a config —
   * this page IS templated. Its structure is fixed by law rather than by the
   * shop (Taiwan's 消費者保護法 gives a七日鑑賞期 to every distance sale), and
   * what actually differs between shops is a short list of facts: how long the
   * refund takes, which categories are exempt, how to file. Those are values,
   * not prose, so they belong here.
   *
   * What is NOT here: the phone, e-mail and service hours the page's contact
   * block shows. Those derive from the merchant record, same as the footer.
   */
  returns: {
    metaTitle: '退換貨政策',
    metaDescription: `${identity.name} 退換貨政策、鑑賞期與退款時程說明。`,
    effectiveDate: '2026-01-01',
    hero: {
      eyebrow: 'RETURNS',
      title: '退換貨政策',
      lead: '完善的售後服務，讓您的每一次訂購都安心無憂。'
    },

    inspection: {
      title: '七日鑑賞期說明',
      lead: '依據消費者保護法規定，您享有商品到貨次日起算七日鑑賞期（含例假日）之權益。鑑賞期為審視商品之期間，非試用期。',
      points: [
        '鑑賞期內可申請退貨或換貨。',
        '退貨商品需保持全新狀態，且包裝完整。',
        '依法不適用七日鑑賞期的品項，於商品頁另行標示。'
      ]
    },

    steps: {
      title: '申請退換貨流程',
      items: [
        { step: '1', title: '聯絡客服', text: '於鑑賞期內透過客服管道提出申請' },
        { step: '2', title: '提供資訊', text: '提供訂單編號、購買人、商品狀態及問題說明' },
        { step: '3', title: '審核申請', text: '客服人員將於 1-2 個工作天內與您確認' },
        { step: '4', title: '商品寄回', text: '依指示將商品妥善包裝並寄回指定地址' },
        { step: '5', title: '退款 / 換貨', text: '確認商品後安排退款或寄出換貨商品' }
      ]
    },

    panels: [
      {
        title: '可退換條件',
        items: [
          '商品於鑑賞期內提出申請。',
          '商品保持全新且包裝完整。',
          '商品配件、贈品、發票齊全。',
          '非因個人因素造成之外盒損毀。'
        ]
      },
      {
        title: '不可退換情況',
        items: [
          '超過鑑賞期之申請。',
          '商品已拆封、使用或因保存不當造成損壞。',
          '客製化商品與依法不適用鑑賞期之品項。',
          '因個人主觀喜好之退換貨。'
        ]
      },
      {
        title: '退款方式與時程',
        items: [
          '退款將依原路退回您的付款方式。',
          '信用卡：7-14 個工作天（依發卡銀行作業時間為準）。',
          'ATM 轉帳：3-7 個工作天。',
          '超商代碼繳費：3-7 個工作天。'
        ]
      },
      {
        title: '瑕疵商品處理',
        items: [
          '若收到商品有瑕疵或運送過程造成損壞，請於收貨後 24 小時內聯繫客服，並提供以下資訊：',
          '訂單編號',
          '現場商品照片',
          '問題描述'
        ]
      }
    ],

    contact: {
      title: '聯絡客服',
      lead: '如有任何退換貨相關問題，歡迎與我們聯繫，我們將竭誠為您服務。'
    },

    note: '本頁內容為範本，需依實際營運狀況調整，並請由具備資格者確認。'
  }
};

