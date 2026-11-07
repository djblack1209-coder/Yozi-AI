import { readFileSync } from "node:fs";

const source = (name) => readFileSync(new URL(name, import.meta.url), "utf8");
export const download = "Yozi-AI-2.2.0-macOS-arm64.zip";
const metadata = {
  zh: {
    title: "Yozi — 学懂，练会，记牢。",
    description:
      "记得进度的 AI 学习教练。从考研英语写作开始，规划、练习、复习。自带 API Key，自选模型。当前版本 2.2.0。",
  },
  en: {
    title: "Yozi — learn your way.",
    description:
      "An AI study coach that remembers your progress. Plan, practise and review, starting with postgraduate English writing. Bring your own API key. Version 2.2.0.",
  },
};
export const WEBSITE_TITLE = metadata.en.title;
const tr = (zh, en) =>
  `<span data-copy="zh" lang="zh-CN">${zh}</span><span data-copy="en" lang="en">${en}</span>`;
const label = (zh, en) => `data-label-zh="${zh}" data-label-en="${en}" aria-label="${zh}"`;
const paths = {
  arrow: '<path d="M7 17 17 7M7 7h10v10"/>',
  left: '<path d="m12 19-7-7 7-7M5 12h14"/>',
  right: '<path d="m12 5 7 7-7 7M19 12H5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  move: '<path d="m18 8 4 4-4 4M6 8l-4 4 4 4M2 12h20"/>',
  language: '<path d="m5 8 4 5c2 2 4 3 6 4M4 6h11M9 3v3m4 0c-1 5-4 9-9 12m10 3 4-10 4 10m-6-4h4"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m20 6-11 11-5-5"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  pen: '<path d="m16 3 5 5-12 12-6 1 1-6ZM14 5l5 5"/>',
  layers: '<path d="m12 3 10 6-10 6L2 9ZM2 15l10 6 10-6M2 12l10 6 10-6"/>',
  repeat: '<path d="m17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 13h8m-8 4h6"/>',
  key: '<circle cx="8" cy="15" r="5"/><path d="m11.5 11.5 9-9L23 5l-3 3-2-2-2 2 2 2-3 3"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>',
};
const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const symbols = `<svg class="symbols" aria-hidden="true"><defs>${Object.entries(paths)
  .map(([name, path]) => `<symbol id="i-${name}" viewBox="0 0 24 24">${path}</symbol>`)
  .join("")}</defs></svg>`;
const features = [
  {
    icon: "pen",
    title: ["逐段带写", "write, paragraph by paragraph"],
    body: ["从应用文到大作文。", "from a short letter to a full essay."],
    front: "Dear Alex,<br>I am writing to invite you…",
    back: "Dear Alex,<br>I am writing to invite you<br>to our reading club.",
  },
  {
    icon: "layers",
    title: ["理解每次批改", "understand every correction"],
    body: ["AI 评估，非官方评分。", "AI feedback, not an official score."],
    front: 'pay attention <span class="underlined">on</span><br>the details',
    back: "pay attention <del>on</del> <ins>to</ins><br>the details",
  },
  {
    icon: "repeat",
    title: ["接着上次继续", "pick up where you left off"],
    body: ["已保存的记录，成为复习依据。", "saved study records guide your review."],
    front: "pay attention<br>___ the details",
    back: "pay attention<br><ins>to</ins> the details",
  },
  {
    icon: "file",
    title: ["围绕你的资料", "bring your own material"],
    body: ["在对话里理解与练习。", "learn and practise in one conversation."],
    front: tr("我的写作笔记", "my writing notes"),
    back: "make use of<br>what you have learnt.",
  },
];
function featureCards() {
  return features
    .map(
      (f, i) =>
        `<article class="feature-card" data-feature-card style="--delay:${i * 70}ms;--media-position:${[28, 43, 62, 78][i]}%"><div class="feature-artboard" data-artboard><img class="feature-still" src="{{base}}/media/feature-day-${i + 1}.jpg" data-day-src="{{base}}/media/feature-day-${i + 1}.jpg" data-night-src="{{base}}/media/feature-night-${i + 1}.jpg" alt=""><video class="feature-film" data-feature-film data-offset="${i * 2}" data-src="{{base}}/media/yozi-learning-sky.mp4" muted loop playsinline preload="none" aria-hidden="true"></video><div class="feature-scrim" aria-hidden="true"></div><div class="lesson-notes"><div class="art-before">${f.front}</div><div class="art-after" aria-hidden="true">${f.back}</div></div><div class="feature-copy"><div class="feature-name">${icon(f.icon)}<h3>${tr(...f.title)}</h3></div>${i === 1 ? `<p>${tr(...f.body)}</p>` : ""}</div></div></article>`,
    )
    .join("");
}
const principles = [
  [
    [
      "「不必先学会怎么用 AI。先把今天这一段，写明白。」",
      "«You don’t need to master AI first. Start by making today’s paragraph clear.»",
    ],
    ["把学习方法放进对话", "learning methods, inside the conversation"],
  ],
  [
    [
      "「讲解、批改、练习，先把内容做好。」",
      "«A useful explanation. A thoughtful correction. A practice that helps. Quality comes first.»",
    ],
    ["内容质量第一", "content quality first"],
  ],
  [
    [
      "「记得你学过什么，下一次就从那里继续。」",
      "«Remember what you’ve worked on. Make the next practice count.»",
    ],
    ["以已保存的学习事实为依据", "grounded in saved study records"],
  ],
];
const faqs = [
  {
    key: "start",
    label: ["开始使用", "getting started"],
    items: [
      [
        ["Yozi 适合谁？", "who is Yozi for?"],
        [
          "想要持续练习的中国学生。当前先从考研英语写作开始，覆盖英语一、英语二的应用文与大作文。",
          "Students who want a consistent practice routine. The current focus is postgraduate English writing: short letters and essays for English I and II.",
        ],
      ],
      [
        ["现在可以下载哪些版本？", "which version can I download?"],
        [
          "当前提供 2.2.0 Mac 版，需要 macOS 14 或更新版本、Apple 芯片。Windows 与手机 App 正在规划开发中，尚未提供下载。",
          "Version 2.2.0 is available for Mac, with macOS 14 or later and Apple silicon. Windows and mobile apps are planned and in development; downloads are not available yet.",
        ],
      ],
      [
        ["从哪里开始？", "how do I start?"],
        [
          "下载应用、注册登录，在 AI 连接器中接入自己的 API，再选择可用型号。随后通过对话建立学习档案，开始写作练习。",
          "Download the app and sign in. Add your API connection in the AI connector, select an available model, then build your study profile through the conversation.",
        ],
      ],
      [
        ["可以上传自己的资料吗？", "can I use my own material?"],
        [
          "可以。上传自己的学习资料，围绕资料提问与练习。模型使用哪些内容，仍按应用内的分享授权执行。",
          "Yes. Upload your study material and use it for questions and practice. Sharing with a model follows the permission you give in the app.",
        ],
      ],
    ],
  },
  {
    key: "models",
    label: ["模型与费用", "models & costs"],
    items: [
      [
        ["BYOK 是什么？", "what does BYOK mean?"],
        [
          "Bring Your Own Key，即自带 API Key。你选择 API 提供方、连接与型号；型号从所接 API 实时读取。",
          "Bring Your Own Key. You choose the API provider, connection and model. Available models are read from your connected API.",
        ],
      ],
      [
        ["需要另外付模型费用吗？", "are model costs separate?"],
        [
          "需要按 API 提供方的计费规则支付模型调用费用。Yozi 不包含模型额度，不承诺免费调用；本站不销售订阅，也不收取付款。",
          "Model usage is billed under your API provider’s pricing. Yozi does not include model credits or promise free calls. This website does not sell subscriptions or collect payments.",
        ],
      ],
      [
        ["Yozi 有订阅价格吗？", "does Yozi have subscription prices?"],
        [
          "价格、免费档与支付渠道尚未确定。当前真实收费与短信发送保持关闭，不提供购买入口。",
          "Pricing, free plans and payment channels have not been set. Paid billing and SMS remain disabled. There is no purchase flow.",
        ],
      ],
      [
        ["型号不能用时会自动切换吗？", "will Yozi switch models automatically?"],
        [
          "不会自动换供应商或付费型号。当前型号不可用时会明确提示，由你选择切换。",
          "No. Yozi does not silently change providers or paid models. If a model is unavailable, you are told and can choose another one.",
        ],
      ],
    ],
  },
  {
    key: "privacy",
    label: ["隐私与学习记录", "privacy & study records"],
    items: [
      [
        ["学习内容会发送到哪里？", "where does my study content go?"],
        [
          "使用模型需要把本次已授权的学习内容发送到你选择的 API 提供方。请同时查看该提供方的数据政策；不能把 BYOK 理解为所有内容只在本机处理。",
          "Model use sends the study content you have authorised to your chosen API provider. Review that provider’s data policy too. BYOK does not mean all processing stays on your device.",
        ],
      ],
      [
        ["需要在官网填写密钥吗？", "should I enter my key on this website?"],
        [
          "不需要。官网没有 API Key 输入框。请在应用内的 AI 连接器中配置自己的连接。",
          "No. This website has no API key input. Configure your connection in the app’s AI connector.",
        ],
      ],
      [
        ["这些示例是学生成绩吗？", "are these real student results?"],
        [
          "不是。网页展示的是学习过程示例与产品理念，不是学生成绩、用户评价或掌握准确率证据。",
          "No. The website shows illustrative learning examples and product principles. They are not student results, customer reviews or evidence of mastery prediction accuracy.",
        ],
      ],
      [
        ["AI 批改是官方评分吗？", "is AI feedback an official score?"],
        [
          "不是。写作反馈属于 AI 评估，帮助理解与练习，不代表考试机构的官方评分。",
          "No. Writing feedback is an AI assessment to support learning and practice, not a score issued by an examination authority.",
        ],
      ],
    ],
  },
];
const words = {
  skip: ["跳至产品", "skip to product"],
  navProduct: ["产品", "product"],
  navPrinciples: ["方法", "approach"],
  navPricing: ["费用", "costs"],
  navFaq: ["常见问题", "FAQ"],
  navDownload: ["下载", "get app"],
  languageText: ["EN", "中"],
  heroOne: ["学懂，", "LEARN."],
  heroTwo: ["练会，", "PRACTISE."],
  heroThree: ["记牢。", "REMEMBER."],
  heroBody: ["记得进度的<br>AI 学习教练。", "AN AI STUDY COACH<br>THAT REMEMBERS."],
  heroAccent: ["从写作开始", "your own way."],
  startLearning: ["开始探索", "LET’S START"],
  backToStart: ["回到开始", "BACK TO START"],
  collectionTitle: ["学过的，都算数。", "MAKE IT COUNT."],
  mediaError: ["场景加载失败。", "The scene could not load."],
  retryMedia: ["重试", "Retry"],
  versionLabel: ["当前版本", "current version"],
  keyLabel: ["你的密钥，你的模型", "your key. your model."],
  daily: ["每天", "daily"],
  dailyLabel: ["规划 · 练习 · 复习", "plan · practise · review"],
  featuresTitle: ["每一步，<br>都学得更明白。", "a little clearer.<br>every step."],
  featuresBody: [
    "一个对话窗口，串起讲解、批改与练习。",
    "one conversation for explanations, feedback and practice.",
  ],
  demoLabel: ["学习过程示例", "illustrative learning examples"],
  demoBefore: ["播放示例", "play examples"],
  demoAfter: ["返回静态", "back to stills"],
  principlesTitle: ["我们相信的学习。", "a way of learning we believe in."],
  principlesNote: ["产品理念，非用户评价", "product principles, not customer reviews"],
  pricingTitle: ["你的模型。<br>费用说清楚。", "your model.<br>clear about the cost."],
  pricingIntro: [
    "自带 API。模型用量由提供方计费。",
    "bring your own API. model usage is billed by your provider.",
  ],
  appName: ["应用", "the app"],
  appPrice: ["尚未定价", "pricing to come"],
  appCostBody: [
    "价格与支付渠道待定。当前不收款。",
    "pricing and payment channels are not set. no payments collected.",
  ],
  keyName: ["模型调用", "model usage"],
  keyCostBody: [
    "按你选择的 API 提供方计费，不含模型额度。",
    "billed by your chosen API provider. model credits are not included.",
  ],
  keyAction: ["了解模型连接", "about model connections"],
  pricingNotice: [
    "平台预配模型默认关闭。真实收费与短信发送未启用。",
    "platform-supplied models are off by default. paid billing and SMS are disabled.",
  ],
  faqTitle: ["开始前，<br>你可能想知道。", "a few things<br>before you begin."],
  faqIntro: ["接入自己的 API，模型费用另计。", "bring your own API. model usage is billed separately."],
  faqHelp: ["由你授权。", "your permission."],
  faqHelpBody: [
    "密钥与学习内容，只在应用内配置和授权。",
    "configure keys and authorise study-content sharing in the app.",
  ],
  downloadTitle: [
    '<span class="headline-sans">下一步，</span><span class="headline-serif">从今天开始。</span>',
    '<span class="headline-sans">your next step.</span><span class="headline-serif">starts today.</span>',
  ],
  downloadIntro: [
    "从考研英语写作开始，把今天的练习接到下一次。",
    "start with English writing. let today’s practice inform the next.",
  ],
  downloadMac: ["下载 Mac 版", "download for Mac"],
  gatekeeperHint: [
    "首次打开被拦截：系统设置 › 隐私与安全性 › 仍要打开",
    "Blocked on first open: System Settings › Privacy &amp; Security › Open Anyway",
  ],
  openInBrowser: ["在浏览器中打开以下载", "Open in your browser to download"],
  copyLink: ["复制链接", "Copy link"],
  linkCopied: ["链接已复制", "Link copied"],
  copyManually: ["请手动复制下方链接", "Copy the link below"],
  downloadSpec: ["2.2.0 · macOS 14+ · Apple 芯片", "2.2.0 · macOS 14+ · Apple silicon"],
  downloadKey: ["连接你的模型", "connect your model"],
  downloadKeyBody: ["接入 API，再选择型号。", "add your API. choose your model."],
  platformTitle: ["更多设备。", "more devices."],
  platformPending: ["未开放", "unreleased"],
  platformBody: [
    "Windows 与手机 App 规划开发中，尚未开放下载。",
    "Windows and mobile apps are planned and in development. no downloads yet.",
  ],
  stepOne: ["接入 API", "add an API"],
  stepTwo: ["选择型号", "choose a model"],
  stepThree: ["开始学习", "start learning"],
  footerTitle: ["让学习，<br>有迹可循。", "make your<br>learning count."],
  footerPrivacy: ["隐私与数据", "privacy & data"],
  footerBack: ["回到页首", "back to top"],
};
const labels = {
  homeLabel: ["Yozi 首页", "Yozi home"],
  navLabel: ["主导航", "main navigation"],
  languageLabel: ["切换到英语", "switch to Chinese"],
  menuLabel: ["打开导航", "open navigation"],
  playLabel: ["暂停动态效果", "pause motion"],
  scrubLabel: ["左右拖动探索学习场景", "drag to explore the study scene"],
  previousLabel: ["上一条理念", "previous principle"],
  nextLabel: ["下一条理念", "next principle"],
  faqLabel: ["问题分类", "question categories"],
  footerProduct: ["产品链接", "product links"],
  footerUse: ["使用链接", "getting started links"],
  footerDetails: ["了解更多", "more information"],
  copyFallbackLabel: ["下载页面链接", "Download page link"],
};
function fill(template, slots) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in slots)) throw new Error(`Missing website field: ${key}`);
    return slots[key];
  });
}
export function renderHome(lang = "zh", root = false) {
  const base = root ? "." : "..";
  const list = (items) =>
    items
      .map(
        (p) =>
          `<li class="${p[2] === false ? "excluded" : ""}">${icon(p[2] === false ? "close" : "check")}${tr(p[0], p[1])}</li>`,
      )
      .join("");
  return fill(source("index.html"), {
    ...metadata[lang],
    base,
    htmlLang: lang === "zh" ? "zh-CN" : "en",
    locale: lang === "zh" ? "zh_CN" : "en_US",
    canonical: `https://yozi.bot.cd/${root ? "" : lang + "/"}`,
    symbols,
    structuredData: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Yozi AI",
      softwareVersion: "2.2.0",
      applicationCategory: "EducationalApplication",
      operatingSystem: "macOS 14 or later; Apple silicon",
      url: "https://yozi.bot.cd/",
      downloadUrl: `https://yozi.bot.cd/downloads/${download}`,
    }),
    styles: (source("site.css") + "\n" + source("intro.css")).replaceAll("FONT_BASE", base + "/fonts"),
    bootstrap: `(() => { let lang = ${JSON.stringify(root ? "" : lang)}; if (!lang) { try { lang = localStorage.getItem('yozi.website.language'); } catch {} } document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN'; document.documentElement.classList.add('js'); })();`,
    script: source("site.js").replace("LOCALE_METADATA", JSON.stringify(metadata)),
    featureCards: featureCards().replaceAll("{{base}}", base),
    collectionCards: [
      [
        ["写下这一段", "WRITE IT."],
        ["#product", "Dear Alex,<br>I am writing to invite you…"],
      ],
      [
        ["理解这一次", "UNDERSTAND IT."],
        ["#product", "pay attention<br><del>on</del> <ins>to</ins> the details"],
      ],
      [
        ["接着练下去", "REMEMBER IT."],
        ["#principles", "pay attention<br>___ the details"],
      ],
    ]
      .map(
        ([title, [href, note]], i) =>
          `<a class="collection-card" href="${href}" style="--card-rotation:${[-8, 0, 8][i]}deg;--hover-x:${[-60, 0, 60][i]}px;--hover-rotation:${[-12, 0, 12][i]}deg"><img src="${base}/media/feature-day-${i + 1}.jpg" alt=""><video data-deck-film data-src="${base}/media/yozi-learning-sky.mp4" muted loop playsinline preload="none" aria-hidden="true"></video><span class="collection-note" aria-hidden="true">${note}</span><span class="collection-card-title">${tr(...title)}${icon("arrow")}</span></a>`,
      )
      .join(""),
    principleSlides: principles
      .map(
        (p, i) =>
          `<div class="principle-slide" data-slide="${i}" ${i ? "hidden" : ""}><blockquote>${tr(...p[0])}</blockquote></div>`,
      )
      .join(""),
    principleAuthors: principles
      .map(
        (p, i) =>
          `<div class="principle-author" data-author="${i}" ${i ? "hidden" : ""}><img src="${base}/brand/kitten.png" width="56" height="56" alt=""><div><strong>Yozi</strong><p>${tr(...p[1])}</p></div></div>`,
      )
      .join(""),
    faqCategories: faqs
      .map(
        (g, i) =>
          `<button type="button" class="spotlight" role="tab" id="category-${g.key}" aria-controls="faq-${g.key}" aria-selected="${i === 0}" tabindex="${i ? "-1" : "0"}" data-category="${g.key}">${tr(...g.label)}</button>`,
      )
      .join(""),
    faqPanels: faqs
      .map(
        (g, index) =>
          `<div id="faq-${g.key}" class="faq-panel" role="tabpanel" aria-labelledby="category-${g.key}" ${index ? "hidden" : ""}>${g.items.map(([q, a]) => `<details class="faq-item spotlight" name="yozi-${g.key}"><summary>${tr(...q)}<span class="chevron">${icon("chevron")}</span></summary><div class="faq-answer">${tr(...a)}</div></details>`).join("")}</div>`,
      )
      .join(""),
    appFeatures: list([
      ["考研英语写作带练", "postgraduate English writing"],
      ["学习与复习记录", "study and review records"],
      ["Mac 版 2.2.0", "Mac version 2.2.0"],
      ["模型额度（不包含）", "model credits (not included)", false],
      ["订阅付款（未开放）", "subscription billing (not available)", false],
    ]),
    keyFeatures: list([
      ["接入自己的 API Key", "connect your own API key"],
      ["可保存多个连接", "save multiple connections"],
      ["从 API 实时读取型号", "discover models from your API"],
      ["由你选择可用型号", "choose an available model"],
      ["由提供方按用量计费", "provider bills for usage"],
    ]),
    archive: `/downloads/${download}`,
    ...Object.fromEntries(Object.entries(words).map(([key, pair]) => [key, tr(...pair)])),
    ...Object.fromEntries(Object.entries(labels).map(([key, pair]) => [key, label(...pair)])),
    ...Object.fromEntries(Object.keys(paths).map((key) => ["i" + key, icon(key)])),
  });
}
export function renderNotFound() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="theme-color" content="#d5effd"><title>找不到页面 · Yozi</title><link rel="icon" href="/brand/kitten.png"><style>${source("site.css").replaceAll("FONT_BASE", "/fonts")}</style></head><body class="not-found"><main><p>404</p><h1>${tr("这一页找不到了。", "page not found.")}</h1><p>${tr("这个地址可能有误，也可能已移动。", "this address may be incorrect or the page may have moved.")}</p><a class="button primary" href="/">${tr("返回首页", "go home")}</a><button class="button" type="button" data-language-link>EN / 中</button></main><script>const button=document.querySelector('[data-language-link]'); const selected=new URLSearchParams(location.search).get('lang'); let saved; try{saved=localStorage.getItem('yozi.website.language');}catch{} const setLanguage=lang=>{document.documentElement.lang=lang==='en'?'en':'zh-CN';document.title=lang==='en'?'Page not found · Yozi':'找不到页面 · Yozi';};setLanguage(selected||saved);button.addEventListener('click',()=>{const lang=document.documentElement.lang==='en'?'zh':'en';setLanguage(lang);try{localStorage.setItem('yozi.website.language',lang);}catch{}});</script></body></html>`;
}
