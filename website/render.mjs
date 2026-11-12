import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { legalFooterLinks } from './legal.mjs';
import { brandUrl } from './brand.mjs';
import { buildSync } from 'esbuild';
import { BOARD_ICONS } from '../src/components/base/base-icon/board-icons.js';

const read = (name, encoding) => readFileSync(new URL(name, import.meta.url), encoding);
const source = (name) => read(name, 'utf8');
export const download = 'Yozi-AI-2.3.0-macOS-arm64.zip';
const metadata = {
  zh: {
    title: 'Yozi AI',
    description: '记得进度的 AI 学习 App。用自己的资料练习、订正和复习。自带 API Key，自选模型。'
  },
  en: {
    title: 'Yozi AI',
    description:
      'An AI study app that remembers your progress through practice, feedback and review. Bring your own API key.'
  }
};
export const WEBSITE_TITLE = metadata.en.title;
const tr = (zh, en) => `<span data-copy="zh" lang="zh-CN">${zh}</span><span data-copy="en" lang="en">${en}</span>`;
const mediaUrl = (name, base) =>
  `${base}/media/${name}?v=${createHash('sha256')
    .update(read(`media/${name}`))
    .digest('hex')
    .slice(0, 8)}`;
const label = (lang, zh, en) => `data-label-zh="${zh}" data-label-en="${en}" aria-label="${lang === 'en' ? en : zh}"`;
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
  key: '<circle cx="8" cy="15" r="5"/><path d="m11.5 11.5 9-9L23 5l-3 3-2-2-2 2 2 2-3 3"/>',
  lamp: BOARD_ICONS['lamp-desk'],
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>'
};
const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const symbols = `<svg class="symbols" aria-hidden="true"><defs>${Object.entries(paths)
  .map(([name, path]) => `<symbol id="i-${name}" viewBox="0 0 24 24">${path}</symbol>`)
  .join('')}</defs></svg>`;
const sample = {
  attempt: tr(
    '三角形的内角和是 <span class="underlined">360°</span>。',
    'I pay attention <span class="underlined">on</span> the details.'
  ),
  correction: tr(
    '三角形的内角和是 <del>360°</del> <ins>180°</ins>。',
    'I pay attention <del>on</del> <ins>to</ins> the details.'
  ),
  review: tr('三角形的内角和是多少？', 'What follows <em>pay attention</em>?')
};
const features = [
  {
    icon: 'pen',
    media: 'yozi-glass-route',
    title: ['用自己的资料练习', 'Practise with your material'],
    front: tr('三角形的内角和是多少？', 'Use <em>pay attention</em> in a sentence.'),
    back: sample.attempt
  },
  {
    icon: 'layers',
    media: 'yozi-study-console',
    title: ['看懂每次反馈', 'Make sense of feedback'],
    assessment: ['AI 评估，非官方评分。', 'AI assessment for practice.'],
    front: sample.attempt,
    back: sample.correction
  },
  {
    icon: 'repeat',
    media: 'yozi-neon-field',
    title: ['下次接着学', 'Pick up where you left off'],
    front: sample.review,
    back: tr('三角形的内角和是 <ins>180°</ins>。', 'pay attention <ins>to</ins> + noun')
  }
];
function studyImage(src, className = '') {
  const attributes = `${className ? ` class="${className}"` : ''} alt="" width="1600" height="1200" loading="lazy" decoding="async" fetchpriority="low"`;
  return `<img data-study-image="${src}"${attributes}><noscript><img src="${src}"${attributes}></noscript>`;
}

function featureCards() {
  return features
    .map(
      (f, i) =>
        `<article class="feature-card" data-delay="${i * 80}"><div class="feature-artboard">${studyImage(mediaUrl(`${f.media}.webp`, '{{base}}'), 'feature-still')}<video class="feature-film" data-feature-film data-src="${mediaUrl(`${f.media}.mp4`, '{{base}}')}" data-poster="${mediaUrl(`${f.media}.webp`, '{{base}}')}" muted loop playsinline preload="none" aria-hidden="true"></video><div class="feature-scrim" aria-hidden="true"></div><div class="feature-copy"><div class="feature-name">${icon(f.icon)}<h3>${tr(...f.title)}</h3></div>${f.assessment ? `<p>${tr(...f.assessment)}</p>` : ''}</div></div></article>`
    )
    .join('');
}
const principles = [
  [
    [
      '带上你正在学的内容，在对话里提问、练习和订正。',
      'Bring what you’re studying. Ask questions, practise and work through feedback in the conversation.'
    ],
    ['从手头的内容学起。', 'Start with what you’re studying.']
  ],
  [
    [
      '理解哪里出了错、为什么要改，再用一次练习巩固。',
      'See where you went wrong and why. Then try again to make it stick.'
    ],
    ['把每次订正学明白。', 'Understand every correction.']
  ],
  [
    [
      'Yozi 依据你保存的学习记录，帮你安排接下来的练习与复习。',
      'Yozi uses your saved study records to plan what to practise and review next.'
    ],
    ['从上次的进度继续。', 'Keep your place.']
  ]
];
const faqs = [
  {
    key: 'start',
    label: ['开始使用', 'Getting started'],
    items: [
      [
        ['Yozi 适合谁？', 'Who is Yozi for?'],
        [
          'Yozi 面向从小学到成人备考的学习者，帮助你用手头的资料练习、理解反馈和安排复习。',
          'Yozi is for learners from primary school through adult exam preparation who want to practise with their material, understand feedback and keep up with review.'
        ]
      ],
      [
        ['现在可以下载哪些平台？', 'Which platforms are available?'],
        [
          '当前提供 Mac 版，需要 macOS 14 或更新版本、Apple 芯片。Windows 与手机 App 正在规划开发中，尚未提供下载。',
          'Yozi is available for Mac, with macOS 14 or later and Apple silicon. Windows and mobile apps are planned and in development; downloads are not available yet.'
        ]
      ],
      [
        ['从哪里开始？', 'How do I start?'],
        [
          '下载应用、注册登录，在 AI 连接器中接入自己的 API，再选择可用型号。随后通过对话建立学习档案，开始练习。',
          'Download the app and sign in. Add your API connection in the AI connector, select an available model, then build your study profile through the conversation.'
        ]
      ],
      [
        ['可以上传自己的资料吗？', 'Can I use my own material?'],
        [
          '可以。上传自己的学习资料，围绕资料提问与练习。模型使用哪些内容，仍按应用内的分享授权执行。',
          'Yes. Upload your study material and use it for questions and practice. Sharing with a model follows the permission you give in the app.'
        ]
      ]
    ]
  },
  {
    key: 'models',
    label: ['模型与费用', 'Models & costs'],
    items: [
      [
        ['BYOK 是什么？', 'What does BYOK mean?'],
        [
          'Bring Your Own Key，即自带 API Key。你选择 API 提供方、连接与型号；型号从所接 API 实时读取。',
          'Bring Your Own Key. You choose the API provider, connection and model. Available models are read from your connected API.'
        ]
      ],
      [
        ['在哪里查看模型用量？', 'Where can I view model usage?'],
        ['在所选连接的提供方账户中查看模型用量。', 'View model usage in your connected provider’s account.']
      ],
      [
        ['Yozi 有订阅价格吗？', 'Does Yozi have subscription prices?'],
        ['Plus ¥19、Pro ¥39、Max ¥68。', 'Plus ¥19, Pro ¥39 and Max ¥68.']
      ],
      [
        ['型号不能用时会自动切换吗？', 'Will Yozi switch models automatically?'],
        [
          '不会自动换供应商或付费型号。当前型号不可用时会明确提示，由你选择切换。',
          'No. Yozi does not silently change providers or paid models. If a model is unavailable, you are told and can choose another one.'
        ]
      ]
    ]
  },
  {
    key: 'privacy',
    label: ['隐私与学习记录', 'Privacy & study records'],
    items: [
      [
        ['学习内容会发送到哪里？', 'Where does my study content go?'],
        [
          '使用模型需要把本次已授权的学习内容发送到你选择的 API 提供方。请同时查看该提供方的数据政策；不能把 BYOK 理解为所有内容只在本机处理。',
          'Model use sends the study content you have authorised to your chosen API provider. Review that provider’s data policy too. BYOK does not mean all processing stays on your device.'
        ]
      ],
      [
        ['需要在官网填写密钥吗？', 'Should I enter my key on this website?'],
        [
          '不需要。官网没有 API Key 输入框。请在应用内的 AI 连接器中配置自己的连接。',
          'No. This website has no API key input. Configure your connection in the app’s AI connector.'
        ]
      ],
      [
        ['这些示例是学生成绩吗？', 'Are these real student results?'],
        [
          '不是。网页展示的是学习过程示例与产品理念，不是学生成绩、用户评价或掌握准确率证据。',
          'No. The website shows illustrative learning examples and product principles. They are not student results, customer reviews or evidence of mastery prediction accuracy.'
        ]
      ],
      [
        ['AI 批改是官方评分吗？', 'Is AI feedback an official score?'],
        [
          '不是。写作反馈属于 AI 评估，帮助理解与练习，不代表考试机构的官方评分。',
          'No. Writing feedback is an AI assessment to support learning and practice, not a score issued by an examination authority.'
        ]
      ]
    ]
  }
];
const words = {
  skip: ['跳至内容', 'skip to content'],
  navProduct: ['产品', 'Product'],
  navPrinciples: ['方法', 'Approach'],
  navPricing: ['费用', 'Costs'],
  navFaq: ['常见问题', 'FAQ'],
  navDownload: ['下载 App', 'Get the App'],
  navAccount: ['登录', 'Sign In'],
  languageText: ['EN', '中'],
  heroOne: ['学懂，练会。', 'Learn it today.'],
  heroTwo: ['下次接着来。', 'Pick up tomorrow.'],
  heroBody: [
    '记得进度的 AI 学习 App。<br>用自己的资料练习、订正和复习。',
    'An AI study app that remembers your progress. Practise, get feedback and review with your own material.'
  ],
  previewTitle: ['学习示例', 'Study example'],
  previewWrite: ['练习', 'Practice'],
  previewFeedback: ['反馈', 'Feedback'],
  previewReview: ['复习', 'Review'],
  previewAttempt: ['首次作答', 'First attempt'],
  previewAssessment: ['AI 反馈', 'AI feedback'],
  previewExplanation: ['记住：三角形的内角和是 180°。', 'Remember the pattern: pay attention to + noun.'],
  startLearning: ['看三张卡', 'See all three cards'],
  backToStart: ['返回预览', 'Back to preview'],
  collectionTitle: ['一次练习的三张卡', 'One practice, three cards'],
  featuresTitle: ['练习、反馈、复习。', 'Practice that carries forward.'],
  inkTitle: ['把练习写进记忆', 'MAKE IT STICK.'],
  inkHint: ['划过纸面', 'Trace the paper'],
  mediaError: ['场景加载失败。', 'The scene could not load.'],
  retryMedia: ['重试', 'Retry'],
  expoOpen: ['浏览学习路线', 'Explore the study route'],
  expoTitle: ['学习路线', 'Study route'],
  expoHint: ['滚动浏览，或选择一站。', 'Scroll through the route or choose a stop.'],
  expoStaticHint: ['选择一站查看示例。', 'Choose a stop to see its example.'],
  principlesTitle: ['学习方法', 'How Yozi helps you learn'],
  keyAction: ['了解模型连接', 'About model connections'],
  faqTitle: ['常见问题', 'Frequently asked questions'],
  signupLink: ['注册与登录', 'Sign up or sign in'],
  signupTitle: ['注册或登录 Yozi。', 'Sign up or sign in to Yozi.'],
  signupBody: [
    '安装 Yozi 后注册或登录，再接入自己的 API，选择可用模型。',
    'Install Yozi to sign up or sign in. Then connect your own API and choose a model.'
  ],
  pricingTitle: ['套餐', 'Plans'],
  pricingPoints: [
    '每月学习点数用于讲解、练习和 AI 反馈。各套餐的点数额度将在开放订阅前公布。',
    'Monthly study points fund explanations, practice and AI feedback. Point allowances will be announced before subscriptions open.'
  ],
  pricingRules: [
    'DeepSeek Flash 按 1 倍、Pro 模型按 3.5 倍扣点。点数不结转。加油包：¥10／¥30。不设免费档。',
    'DeepSeek Flash 1× · Pro model 3.5×. Points do not roll over. Top-ups: ¥10 / ¥30. No free tier.'
  ],
  pricingAvailability: [
    '订阅和加油包尚未开售。目前可使用自己的 API 接入应用。',
    'Subscriptions and top-ups are not on sale yet. Bring your own API to use the app today.'
  ],
  appleChip: ['Apple 芯片', 'Apple silicon'],
  downloadOne: ['带上 Yozi。', 'TAKE YOZI'],
  downloadTwo: ['接着学。', 'WITH YOU.'],
  downloadMac: ['下载 Mac 版', 'Download for Mac'],
  gatekeeperHint: [
    '首次打开被拦截：系统设置 › 隐私与安全性 › 仍要打开',
    'Blocked on first open: System Settings › Privacy &amp; Security › Open Anyway'
  ],
  openInBrowser: ['在浏览器中打开以下载', 'Open in your browser to download'],
  copyLink: ['复制链接', 'Copy link'],
  linkCopied: ['链接已复制', 'Link copied'],
  copyManually: ['请手动复制下方链接', 'Copy the link below'],
  platformPending: ['尚未发布', 'Unreleased']
};
const labels = {
  homeLabel: ['Yozi 首页', 'Yozi home'],
  navLabel: ['主导航', 'main navigation'],
  languageLabel: ['切换到英语', 'switch to Chinese'],
  menuLabel: ['打开导航', 'open navigation'],
  motionLabel: ['页面动效', 'Page motion'],
  scrubLabel: ['学习场景画面进度', 'study scene position'],
  previousLabel: ['上一条理念', 'previous principle'],
  nextLabel: ['下一条理念', 'next principle'],
  collectionPreviousLabel: ['上一张学习卡', 'previous study card'],
  collectionNextLabel: ['下一张学习卡', 'next study card'],
  expoCloseLabel: ['收起学习路线', 'Close the study route'],
  expoScrollLabel: ['学习路线滚动视图', 'Scrollable study route'],
  expoStepsLabel: ['学习路线站点', 'Study route stops'],
  faqLabel: ['问题分类', 'question categories'],
  footerProduct: ['产品链接', 'product links'],
  footerUse: ['使用链接', 'getting started links'],
  platformLabel: ['平台发布状态', 'Platform availability'],
  macCardLabel: ['Mac 版下载', 'Mac download'],
  copyFallbackLabel: ['下载页面链接', 'Download page link']
};
function fill(template, slots) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in slots)) throw new Error(`Missing website field: ${key}`);
    return slots[key];
  });
}
export function renderHome(lang = 'zh', root = false) {
  const base = root ? '.' : '..';
  const expoSteps = [words.previewWrite, words.previewFeedback, words.previewReview];
  return fill(source('index.html'), {
    ...metadata[lang],
    base,
    heroPoster: mediaUrl('yozi-pudding-hero-poster.webp', base),
    brandMark: brandUrl('brand/mark-small.webp', base),
    brandMarkReverse: brandUrl('brand/mark-small.webp', base),
    favicon: brandUrl('favicon.svg'),
    appleTouchIcon: brandUrl('brand/apple-touch-icon.png'),
    shareImage: brandUrl('media/yozi-hero-share.jpg', 'https://yozi.bot.cd'),
    otherLang: lang === 'en' ? 'zh-CN' : 'en',
    otherLangUrl: lang === 'en' ? '/zh/' : '/en/',
    htmlLang: lang === 'zh' ? 'zh-CN' : 'en',
    locale: lang === 'zh' ? 'zh_CN' : 'en_US',
    canonical: `https://yozi.bot.cd/${root ? '' : lang + '/'}`,
    symbols,
    structuredData: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Yozi AI',
      softwareVersion: '2.3.0',
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'macOS 14 or later; Apple silicon',
      url: 'https://yozi.bot.cd/',
      downloadUrl: `https://yozi.bot.cd/downloads/${download}`
    }),
    styles: ['site.css', 'intro.css', 'get-app.css', 'expo.css']
      .map(source)
      .join('\n')
      .replaceAll('FONT_BASE', base + '/fonts'),
    bootstrap: `(() => { let lang = ${JSON.stringify(root ? '' : lang)}; if (!lang) { try { lang = localStorage.getItem('yozi.website.language'); } catch {} } document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN'; document.documentElement.classList.add('js'); })();`,
    script: source('site.js').replace('LOCALE_METADATA', JSON.stringify(metadata)) + visitScript,
    sampleAttempt: sample.attempt,
    sampleCorrection: sample.correction,
    featureCards: featureCards().replaceAll('{{base}}', base),
    expoBays: features
      .map(
        (feature, index) =>
          `<div class="expo-bay" data-expo-bay${index === 0 ? ' data-expo-active' : ''}><div class="expo-bay-heading"><h4>${tr(...expoSteps[index])}</h4></div><div class="expo-bay-content">${studyImage(`${base}/media/feature-day-${index + 2}.jpg`)}<p>${feature.back}</p></div></div>`
      )
      .join(''),
    expoSteps: expoSteps
      .map(
        (step, index) =>
          `<li><button type="button" data-expo-step="${index}" aria-controls="expo-note-${index}"${index === 0 ? ' aria-current="step"' : ''}>${tr(...step)}</button></li>`
      )
      .join(''),
    expoNotes: features
      .map(
        (feature, index) =>
          `<article id="expo-note-${index}" class="expo-note" data-expo-note${index === 0 ? '' : ' hidden'}><h4>${tr(...feature.title)}</h4><p>${feature.back}</p>${feature.assessment ? `<small>${tr(...feature.assessment)}</small>` : ''}</article>`
      )
      .join(''),
    collectionCards: [
      [
        ['试着作答', 'Practise'],
        ['#product', sample.attempt]
      ],
      [
        ['看懂反馈', 'Get feedback'],
        ['#product', sample.correction]
      ],
      [
        ['复习', 'Review'],
        ['#principles', sample.review]
      ]
    ]
      .map(
        ([title, [href, note]], i) =>
          `<a class="collection-card" href="${href}" data-slot="${['left', 'center', 'right'][i]}">${studyImage(`${base}/media/feature-day-${i + 2}.jpg`)}<video data-deck-film data-src="${base}/media/yozi-glass-route.mp4" muted loop playsinline preload="none" aria-hidden="true"></video><span class="collection-note" aria-hidden="true">${note}</span><span class="collection-card-title">${tr(...title)}${icon('arrow')}</span></a>`
      )
      .join(''),
    principleSlides: principles
      .map(
        (p, i) =>
          `<article class="principle-slide" data-slide="${i}" ${i ? 'hidden' : ''}><h3>${tr(...p[1])}</h3><p>${tr(...p[0])}</p></article>`
      )
      .join(''),
    faqCategories: faqs
      .map(
        (g, i) =>
          `<button type="button" role="tab" id="category-${g.key}" aria-controls="faq-${g.key}" aria-selected="${i === 0}" tabindex="${i ? '-1' : '0'}" data-category="${g.key}">${tr(...g.label)}</button>`
      )
      .join(''),
    faqPanels: faqs
      .map(
        (g, index) =>
          `<div id="faq-${g.key}" class="faq-panel"><h3>${tr(...g.label)}</h3>${g.items.map(([q, a], i) => `<details class="faq-item" name="yozi-${g.key}"${index === 0 && i === 0 ? ' open' : ''}><summary>${tr(...q)}<span class="chevron">${icon('chevron')}</span></summary><div class="faq-answer">${tr(...a)}</div></details>`).join('')}</div>`
      )
      .join(''),
    priceCards: [
      {
        name: 'Plus',
        amount: 19,
        purpose: ['养成每日学习习惯', 'A steady daily habit'],
        description: ['适合每天短时练习和随时追问。', 'For short daily practice and follow-up questions.']
      },
      {
        name: 'Pro',
        amount: 39,
        featured: true,
        purpose: ['让学习更进一步', 'Room to go deeper'],
        description: [
          '适合规律练习、详细反馈和持续学习。',
          'For regular training, detailed feedback and steady preparation.'
        ]
      },
      {
        name: 'Max',
        amount: 68,
        purpose: ['专注高强度学习', 'For intensive study'],
        description: [
          '适合频繁提问、密集练习和长时间学习。',
          'For frequent questions, intensive practice and longer study sessions.'
        ]
      }
    ]
      .map(
        ({ name, amount, featured, purpose, description }, i) =>
          `<article class="price-card${featured ? ' featured' : ''} reveal" data-delay="${i * 80}"><div class="price-heading"><h3>${name}</h3>${featured ? `<span class="price-badge">${tr('推荐', 'Recommended')}</span>` : ''}</div><p class="price-purpose">${tr(...purpose)}</p><div class="price-month"><data class="price-value" value="${amount}">¥${amount}</data><span class="price-unit">${tr('/ 月', '/ month')}</span></div><p class="price-annual">${tr(`约 ¥${amount * 10} / 年`, `Approx. ¥${amount * 10} / year`)}</p><p class="price-description">${tr(...description)}</p><ul class="price-benefits"><li>${icon('check')}${tr('每月学习点数', 'Monthly study points')}</li><li>${icon('check')}${tr('使用 Flash 和 Pro 模型', 'Flash and Pro model usage')}</li></ul></article>`
      )
      .join(''),
    archive: `/downloads/${download}`,
    legalLinks: legalFooterLinks(),
    ...Object.fromEntries(Object.entries(words).map(([key, pair]) => [key, tr(...pair)])),
    ...Object.fromEntries(Object.entries(labels).map(([key, pair]) => [key, label(lang, ...pair)])),
    ...Object.fromEntries(Object.keys(paths).map((key) => ['i' + key, icon(key)]))
  });
}
const accountWords = {
  signinCaption: ['每天，都更明白一点。', 'A little clearer.<br>Every day.'],
  skip: ['跳到主要内容', 'Skip to content'],
  languageText: ['EN', '中文'],
  signOut: ['退出登录', 'Sign out'],
  signInTitle: ['登录 Yozi', 'Sign in to Yozi'],
  email: ['邮箱', 'Email'],
  password: ['密码', 'Password'],
  signIn: ['登录', 'Sign in'],
  progressTitle: ['我的学习进度', 'My progress'],
  retry: ['重试', 'Retry'],
  studyDays: ['学习天数', 'Study days'],
  answers: ['作答', 'Answers'],
  essays: ['作文', 'Essays'],
  familiar: ['已熟悉', 'Familiar'],
  learning: ['学习中', 'Learning'],
  daysToExam: ['距考试（天）', 'Days to exam'],
  lastActivity: ['最近学习', 'Last activity'],
  weaknesses: ['薄弱点', 'Weak points'],
  subjects: ['科目', 'Subjects'],
  nodes: ['知识点', 'Topics'],
  aiAssessment: ['AI 评估', 'AI assessment']
};
function accountScript() {
  const entry = 'import { mountAccount } from "./app.js"; mountAccount();';
  const directory = new URL('./account/', import.meta.url).pathname;
  const { outputFiles } = buildSync({
    stdin: { contents: entry, resolveDir: decodeURIComponent(directory), loader: 'js' },
    bundle: true,
    minify: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    legalComments: 'none',
    write: false
  });
  return outputFiles[0].text.replaceAll('</script', '<\\/script');
}
const visitScript = `\nfetch('/exam-master/site-visit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ page: location.pathname }), credentials: 'omit', keepalive: true }).catch(() => {});`;

export function renderAccount() {
  return fill(source('account/index.html'), {
    favicon: brandUrl('favicon.svg'),
    appleTouchIcon: brandUrl('brand/apple-touch-icon.png'),
    brandMark: brandUrl('brand/mark.png'),
    styles: ['site.css', 'legal.css', '../src/styles/password-lamp.css', 'account/account.css']
      .map(source)
      .join('\n')
      .replaceAll('FONT_BASE', '/fonts'),
    bootstrap: `(() => { let lang; try { lang = localStorage.getItem('yozi.website.language'); } catch {} document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN'; })();`,
    homeLabel: label('zh', '返回首页', 'Back to home'),
    languageLabel: label('zh', '切换到英语', 'Switch to Chinese'),
    ilanguage: icon('language'),
    ilamp: icon('lamp'),
    symbols,
    script: accountScript() + visitScript,
    ...Object.fromEntries(Object.entries(accountWords).map(([key, pair]) => [key, tr(...pair)]))
  });
}

export function renderOperations() {
  return fill(source('ops/index.html'), {
    favicon: brandUrl('favicon.svg'),
    brandMark: brandUrl('brand/mark.png'),
    styles: (source('site.css') + '\n' + source('ops/ops.css')).replaceAll('FONT_BASE', '/fonts'),
    script: source('ops/app.js').replaceAll('</script', '<\\/script')
  });
}
export function renderNotFound() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <meta name="theme-color" content="#0549ff">
  <title>找不到页面 · Yozi</title>
  <link rel="icon" type="image/svg+xml" href="${brandUrl('favicon.svg')}">
  <style>${source('site.css').replaceAll('FONT_BASE', '/fonts')}</style>
</head>
<body class="not-found">
  <main>
    <div class="not-found-bar">
      <a href="/" class="not-found-brand"><img src="${brandUrl('brand/mark.png')}" width="36" height="36" alt="">Yozi AI</a>
      <button class="button secondary" type="button" data-language-link hidden>${tr('EN', '中文')}</button>
    </div>
    <div class="not-found-companion" aria-hidden="true"><video data-explorer-film muted playsinline preload="none" poster="/media/yozi-pudding-hero-poster.jpg"></video></div>
    <div class="not-found-copy">
      <h1>${tr('这一页找不到了。', 'Page not found.')}</h1>
      <p>${tr('这个地址可能有误，也可能已移动。', 'This address may be incorrect or the page may have moved.')}</p>
      <a class="button primary" href="/">${tr('返回首页', 'Back to home')}</a>
    </div>
    <div class="not-found-code" role="img" aria-label="404">
      <span class="not-found-digit" aria-hidden="true"><span>4</span></span>
      <span class="not-found-digit" aria-hidden="true"><span>0</span></span>
      <span class="not-found-digit" aria-hidden="true"><span>4</span></span>
    </div>
  </main>
  <script>
    const button = document.querySelector('[data-language-link]');
    const digits = document.querySelector('.not-found-code');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const selected = new URLSearchParams(location.search).get('lang');
    let saved, paused;
    try {
      saved = localStorage.getItem('yozi.website.language');
      paused = localStorage.getItem('yozi.website.motion') === 'paused';
    } catch {}
    const explorer = document.querySelector('[data-explorer-film]');
    if (!paused && !reduced.matches) {
      explorer.src = '/media/yozi-pudding-lost.mp4';
      explorer.play().catch(() => {});
    }
    digits.toggleAttribute('data-motion', !paused && !reduced.matches);
    digits.addEventListener('pointerdown', (event) => {
      const digit = event.target.closest('.not-found-digit')?.firstElementChild;
      if (!digit || paused || reduced.matches) return;
      digit.getAnimations().forEach((animation) => animation.cancel());
      digit.animate([
        { transform: 'translateY(0) rotate(0)' },
        { transform: 'translateY(-19%) rotate(13deg)', offset: .3 },
        { transform: 'translateY(2%) rotate(-4deg)', offset: .72 },
        { transform: 'translateY(0) rotate(0)' }
      ], { duration: 750, easing: 'cubic-bezier(.24,.7,.33,1)' });
    });
    function setLanguage(lang) {
      const english = lang === 'en';
      document.documentElement.lang = english ? 'en' : 'zh-CN';
      document.title = english ? 'Page not found · Yozi' : '找不到页面 · Yozi';
      button.setAttribute('aria-label', english ? 'Switch to Chinese' : '切换到英语');
    }
    setLanguage(selected || saved);
    button.hidden = false;
    button.addEventListener('click', () => {
      const lang = document.documentElement.lang === 'en' ? 'zh' : 'en';
      setLanguage(lang);
      try { localStorage.setItem('yozi.website.language', lang); } catch {}
    });
  </script>
</body>
</html>`;
}
