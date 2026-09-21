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

  /*
   * Both documents are REWRITTEN, not inherited. The template's clauses
   * describe a shop that registers members, takes orders, charges cards and
   * ships parcels; this one does none of that online — `flags.commerce` is off,
   * so /checkout, /login and /account are never built. Shipping clauses about
   * 訂單資料, 購物車內容 and 原路退款 would be statements of fact that are false.
   */
  privacy: {
    introTitle: `${identity.name} 隱私權政策`,
    effectiveDate: '2026-09-22',
    description: `${identity.name} 隱私權政策`,
    clauses: {
      introParagraphs: [
        '本站為 Astrapath Marketing 製作之範例展示站，非實際營業商店。頁面所列公司資訊、統一編號為測試值，商品與價格僅供版面示意，本站不提供線上結帳。',
        `${identity.name} 重視您的個人資料與隱私權保護。本網站僅提供商品瀏覽與 LINE 詢問，不提供會員註冊與線上購物，請您詳閱以下隱私權政策。`
      ],
      sections: [
        {
          heading: '一、適用範圍',
          paragraphs: [
            `本隱私權政策適用於您瀏覽 ${identity.name} 網站時，涉及個人資料蒐集、處理、利用與保護之相關作法。`,
            '本政策不適用於本網站以外之第三方網站或服務，包括 LINE、Instagram 與 Facebook。當您透過本網站的連結前往這些平台時，請另行參閱該平台之隱私權政策。'
          ]
        },
        {
          heading: '二、我們蒐集的資料',
          paragraphs: [
            '本網站不設會員帳號，不提供線上下單或付款，因此不會透過本網站蒐集您的姓名、地址、付款或訂單資料。我們可能取得的資料如下：'
          ],
          bullets: [
            '網站使用資料：IP 位址、瀏覽器類型、裝置資訊與瀏覽紀錄，用於流量統計與維持網站正常運作。',
            'LINE 詢問內容：當您點選「立即詢問」並透過 LINE 官方帳號與我們聯繫時，您以自己的 LINE 帳號登入 LINE，我們僅會看到您在對話中主動提供的內容與 LINE 顯示名稱。'
          ]
        },
        {
          heading: '三、資料使用目的',
          paragraphs: ['我們取得的資料，僅用於以下目的：'],
          bullets: [
            '回覆您透過 LINE 提出的商品詢問。',
            '進行網站流量分析、服務改善與系統安全維護。',
            '配合法令、主管機關或司法機關之要求。'
          ]
        },
        {
          heading: '四、第三方服務',
          paragraphs: [
            '本網站由雲端主機服務商提供網站託管；LINE 對話由 LINE 平台處理。上述服務商僅能在提供服務所需範圍內處理相關資料，除此之外，我們不會將您的資料提供給無關第三人。'
          ]
        },
        {
          heading: '五、Cookie 與本機儲存',
          paragraphs: [
            '本網站可能使用瀏覽器的本機儲存或類似技術記錄基本的瀏覽狀態。您可透過瀏覽器設定拒絕或刪除，停用後不影響商品瀏覽。'
          ]
        },
        {
          heading: '六、個人資料權利',
          paragraphs: [
            '依相關法令規定，您可就您的個人資料請求查詢、閱覽、製給複製本、補充或更正、停止蒐集處理利用，或請求刪除。如需行使上述權利，請透過本政策下方聯絡方式與我們聯繫。'
          ]
        },
        {
          heading: '七、政策修改',
          paragraphs: [
            '我們保留隨時修改本隱私權政策之權利。修改後內容將公告於本網站，並自公告日起生效。'
          ]
        }
      ],
      contactHeading: '八、聯絡資訊',
      contactLead: '若您對本隱私權政策或個人資料使用方式有任何問題，請透過以下方式與我們聯繫：'
    }
  } as LegalPage,

  terms: {
    introTitle: `${identity.name} 使用條款`,
    effectiveDate: '2026-09-22',
    description: `${identity.name} 使用條款`,
    clauses: {
      introParagraphs: [
        /* Verbatim, and first — ahead of every clause. */
        '本站為 Astrapath Marketing 製作之範例展示站，非實際營業商店。頁面所列公司資訊、統一編號為測試值，商品與價格僅供版面示意，本站不提供線上結帳。',
        `歡迎瀏覽 ${identity.name} 網站。當您瀏覽本網站或透過 LINE 向我們詢問時，即表示您已閱讀並同意以下使用條款。`
      ],
      sections: [
        {
          heading: '一、網站服務',
          paragraphs: [
            `${identity.name} 網站提供商品資訊瀏覽與 LINE 詢問服務。本網站不提供會員註冊、線上下單、線上付款或線上退款。我們有權依營運需求調整商品內容、價格與服務項目。`
          ]
        },
        {
          heading: '二、LINE 登入與詢問',
          paragraphs: [
            '本網站不設帳號密碼。您點選「立即詢問」後，將前往 LINE 官方帳號，並以您自己的 LINE 帳號登入 LINE 進行對話；請自行妥善保管您的 LINE 帳號與登入裝置。',
            '詢問時請提供正確、可聯繫的資料。詢問內容不構成訂單，實際供貨、價格與出貨時程，以客服於 LINE 回覆之內容為準。'
          ]
        },
        {
          heading: '三、商品資訊',
          paragraphs: [
            '本網站將盡力提供正確的商品圖片、價格、規格及說明。商品圖片可能因拍攝光線或螢幕顯示不同，與實際商品略有差異。',
            '若商品價格、規格或網站資訊有誤，以客服於 LINE 回覆確認之內容為準。'
          ]
        },
        {
          heading: '四、智慧財產權',
          paragraphs: [
            '本網站所有品牌名稱、LOGO、文字、網頁設計及其他內容，均屬本網站或合法權利人所有；商品與情境照片來自授權圖庫。未經授權，不得擅自複製、轉載、修改、散布或作商業使用。'
          ]
        },
        {
          heading: '五、服務異動與免責',
          paragraphs: [
            '本網站可能因系統維護、網路異常、天災或其他不可抗力因素，導致服務暫停、延遲或中斷。我們將盡力維持服務正常運作，但不保證服務完全不中斷或無錯誤。'
          ]
        },
        {
          heading: '六、條款修改',
          paragraphs: [
            '我們保留隨時修改本使用條款之權利。修改後內容將公告於網站，並自公告日起生效。若您於條款修改後繼續使用本網站，即視為同意修改後內容。'
          ]
        }
      ],
      contactHeading: '七、聯絡資訊',
      contactLead: '如您對商品或本使用條款有任何問題，請透過以下方式與我們聯繫：'
    }
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
    effectiveDate: '2026-09-22',
    hero: {
      eyebrow: 'RETURNS',
      title: '退換貨政策',
      /* The showcase disclaimer, verbatim — the lead is the first line of body
         text on this page, which is where the other two documents carry it. */
      lead: '本站為 Astrapath Marketing 製作之範例展示站，非實際營業商店。頁面所列公司資訊、統一編號為測試值，商品與價格僅供版面示意，本站不提供線上結帳。'
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
        { step: '1', title: '聯絡客服', text: '於鑑賞期內透過 LINE 官方帳號提出申請' },
        { step: '2', title: '提供資訊', text: '提供購買人、購買品項、商品狀態及問題說明' },
        { step: '3', title: '審核申請', text: '客服人員將於 1-2 個工作天內與您確認' },
        { step: '4', title: '商品寄回', text: '依指示將商品妥善包裝並寄回指定地址' },
        { step: '5', title: '退款 / 換貨', text: '確認商品後依雙方約定辦理退款或寄出換貨商品' }
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
          /* Not 「依原路退回」: this site takes no payment, so there is no
             route for a refund to go back along. */
          '本站不提供線上結帳，不經手任何線上付款。',
          '透過 LINE 洽詢成立之訂購，退款方式與時程由客服於受理時個別說明，並於 LINE 對話中確認。',
          '退款於確認退回商品無誤後辦理。'
        ]
      },
      {
        title: '瑕疵商品處理',
        items: [
          '若收到商品有瑕疵或運送過程造成損壞，請於收貨後 24 小時內聯繫客服，並提供以下資訊：',
          '購買人與購買品項',
          '現場商品照片',
          '問題描述'
        ]
      }
    ],

    contact: {
      title: '聯絡客服',
      lead: '如有任何退換貨相關問題，歡迎與我們聯繫，我們將竭誠為您服務。'
    },

    note: '本站為 Astrapath Marketing 製作之範例展示站，非實際營業商店；本頁內容為範本，僅供版面示意。'
  }
};

