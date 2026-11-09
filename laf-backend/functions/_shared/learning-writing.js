import { dayKey } from './learning-date-time.js';
// 原创通知任务；信息条件和量表可追溯，不提供可执行判分或官方等级。
export const NOTICE_CONTRACT = 'english-notice-v1';
export const GUIDED_WRITING_CONTRACT = 'guided-writing-v1';
export const ARGUMENT_WRITING_CONTRACT = 'english-argument-v1';
export const DISCUSSION_WRITING_CONTRACT = 'english-discussion-v1';
export const EMAIL_WRITING_CONTRACT = 'english-email-v1';
export const CHINESE_MATERIAL_ARGUMENT_CONTRACT = 'chinese-material-argument-v1';
export const EXTENDED_WRITING_CONTRACTS = Object.freeze([
  ARGUMENT_WRITING_CONTRACT,
  DISCUSSION_WRITING_CONTRACT,
  EMAIL_WRITING_CONTRACT,
  CHINESE_MATERIAL_ARGUMENT_CONTRACT
]);
export function writingAnswerLimit(question) {
  return [ARGUMENT_WRITING_CONTRACT, CHINESE_MATERIAL_ARGUMENT_CONTRACT].includes(question?.writingExercise?.contract)
    ? 8000
    : EXTENDED_WRITING_CONTRACTS.includes(question?.writingExercise?.contract)
      ? 4000
      : 1000;
}
export function writingDraftLimit(genreId) {
  return ['argument', 'discussion', 'email', 'material_argument'].includes(genreId) ? 2000 : 240;
}
// 项目原创材料与辅助维度；合成观察不提供真实统计、范文答案或考试评分权。
export const CHINESE_MATERIAL_ARGUMENT_TASKS = Object.freeze([
  Object.freeze({
    id: 'reading-corner',
    topic: '午休阅读角',
    focus: '阅读角是否应该取消讨论区？说明你的选择和适用条件。',
    materials: Object.freeze([
      '学校把午休阅读角分成安静区和讨论区。一位同学认为，讨论能帮助大家弄懂难读的段落，因此应该保留讨论区。另一位同学认为，安静阅读需要连续时间，两区相邻会相互干扰。',
      '在一次合成观察中，32名到访同学里有13人进行了讨论，5人因为声音较大换了座位。这个记录只覆盖一个午休，没有记录换座位后的阅读情况。',
      '负责管理的老师提出，可以先调整两区距离，再观察十个午休。到访人数、噪声反馈和阅读需求都应记录，不能把一天的表现当成所有同学的长期需要。'
    ])
  }),
  Object.freeze({
    id: 'community-garden',
    topic: '社区小花园',
    focus: '公共空地应该优先种花还是种菜？提出兼顾使用和维护的方案。',
    materials: Object.freeze([
      '社区准备把一块空地改成小花园。一位居民建议种花，为散步的人提供休息景观；另一位居民建议种菜，让邻居共同劳动并分享收获。两人都希望空地能长期使用。',
      '在一次合成登记中，18位居民表示愿意参加维护，但只有6人填写了每周可以值班的时段。报名意愿没有证明大家都能按时到场，也没有说明各时段的维护需求。',
      '筹备小组提出，方案应明确浇水、工具保管和缺班替补。可以先在一小块地上试行，记录实际到场和维护时间，再讨论扩大范围。'
    ])
  }),
  Object.freeze({
    id: 'reading-medium',
    topic: '纸书与电子阅读',
    focus: '班级是否应该统一改用电子阅读？结合材料区分观察结果和原因判断。',
    materials: Object.freeze([
      '班级讨论阅读方式。一位同学喜欢电子书的检索和字号调整，另一位同学喜欢纸书上不被通知打断的阅读时间。两人都认为，选择应服务于读懂文章。',
      '在一次合成试读中，20名同学自选纸书，另20名自选电子书；两组的阅读完成数分别为16和18。材料没有记录同学原先的阅读习惯，也没有随机安排两种方式。',
      '老师提醒，两组人数相同并不意味着其他条件相同。一次自选试读不能证明电子书导致完成数更高；还应考虑文章难度、设备条件和不同读者的需要。'
    ])
  }),
  Object.freeze({
    id: 'lunch-portions',
    topic: '午餐分量选择',
    focus: '食堂应该统一减少分量，还是提供小份可添？说明依据、限制和下一步。',
    materials: Object.freeze([
      '食堂希望减少剩饭。一位同学建议统一减少分量，另一位同学担心不同人的需求不同，建议先选小份、吃完后可以再添。食堂工作人员关心添饭是否会增加排队。',
      '在一次合成观察中，50份午餐有12份留下了米饭，但记录没有区分食欲、口味或当天活动。另有35人参与一次意向投票，其中21人支持小份可添；未投票者的想法未知。',
      '学生代表提出，先试行一周，分别记录剩饭、添饭次数和等候时间，并提供意见入口。判断方案时应说明观察范围，不能把部分人的投票当成全校一致意见。'
    ])
  })
]);
export const EMAIL_WRITING_BASIS = Object.freeze({
  publisher: 'ETS',
  title: 'TOEFL iBT · Write an Email',
  formatUrl: 'https://www.ets.org/toefl/test-takers/ibt/about/content.html?version=after-jan-2026',
  teachingUrl: 'https://www.ets.org/content/dam/ets-org/pdfs/toefl/toefl-ibt-lesson-plan-writing.pdf',
  sampleUrl: 'https://www.ets.org/content/dam/ets-org/pdfs/toefl/toefl-ibt-lesson-plan-writing.pdf#page=15',
  formatVersion: 'January 2026',
  verified: '2026-10-06',
  recommendedMinutes: 7,
  minimumWords: null,
  sampleNumericScore: null,
  scoringAuthority: false
});
export const EMAIL_WRITING_TASKS = Object.freeze([
  Object.freeze({
    id: 'library-extension',
    topic: '图书延期',
    recipient: 'the library team',
    purpose: '说明情况并提出请求',
    situation:
      'You borrowed a book for a class project. The project meeting has moved to next week, but the book is due this Friday.',
    targets: Object.freeze([
      'Identify the book and explain why you still need it.',
      'Ask whether you can keep it until after the meeting.',
      'Offer to return it sooner if another student needs it.'
    ])
  }),
  Object.freeze({
    id: 'club-room',
    topic: '社团场地调整',
    recipient: 'the club coordinator',
    purpose: '说明问题并建议安排',
    situation:
      'Your club has planned a meeting in a room on Wednesday. You have just learned that the room will be closed for maintenance that day.',
    targets: Object.freeze([
      'Explain the problem with the meeting room.',
      'Suggest another place or time and explain why it would work.',
      'Ask the coordinator to confirm the updated arrangement.'
    ])
  }),
  Object.freeze({
    id: 'project-update',
    topic: '小组项目进度',
    recipient: 'your course tutor',
    purpose: '提供进度信息并寻求建议',
    situation:
      'Your group is preparing a presentation. Most of the work is ready, but you cannot find one source that you planned to use.',
    targets: Object.freeze([
      'Describe the work your group has completed.',
      'Explain which information is missing and how you have looked for it.',
      'Ask for advice on a suitable alternative source.'
    ])
  }),
  Object.freeze({
    id: 'welcome-activity',
    topic: '社区欢迎活动',
    recipient: 'the community organiser',
    purpose: '提出建议并说明帮助方式',
    situation:
      'A community centre wants to welcome students who have recently moved to the neighbourhood. The organiser has asked for activity ideas.',
    targets: Object.freeze([
      'Recommend an activity for welcoming the students.',
      'Explain how the activity could help them meet local people.',
      'Offer a practical way that you could help organise it.'
    ])
  })
]);
// 只采用当前官方格式的事实与出处，不复制官方题目、范文或评分描述。
export const DISCUSSION_WRITING_BASIS = Object.freeze({
  publisher: 'ETS',
  title: 'TOEFL iBT · Write for an Academic Discussion',
  formatUrl: 'https://www.ets.org/toefl/test-takers/ibt/about/content.html?version=after-jan-2026',
  teachingUrl: 'https://www.ets.org/content/dam/ets-org/pdfs/toefl/toefl-ibt-lesson-plan-writing.pdf',
  formatVersion: 'January 2026',
  verified: '2026-10-06',
  recommendedMinimumWords: 100,
  recommendedMinutes: 10,
  scoringAuthority: false
});
export const DISCUSSION_WRITING_TASKS = Object.freeze([
  Object.freeze({
    id: 'campus-spaces',
    topic: '校园共享空间',
    professor:
      'A university has a limited budget for a new shared space. Should it create a quiet study room or a room for group projects? Which option would help students more, and why?',
    students: Object.freeze([
      Object.freeze({
        name: 'Ana',
        post: 'I would choose a quiet study room. Students who share a noisy home need a reliable place to concentrate.'
      }),
      Object.freeze({
        name: 'Ben',
        post: 'I prefer a group project room. It would make it easier for students to discuss ideas and practise working together.'
      })
    ])
  }),
  Object.freeze({
    id: 'community-time',
    topic: '社区志愿安排',
    professor:
      'A community centre wants more university students to volunteer. Should it offer short weekly activities or one longer activity each month? Which arrangement would work better, and why?',
    students: Object.freeze([
      Object.freeze({
        name: 'Mina',
        post: 'Short weekly activities would help students build a habit. They could also get to know the people they help.'
      }),
      Object.freeze({
        name: 'Leo',
        post: 'A longer monthly activity would be easier to plan around exams. Students could finish a useful project in one visit.'
      })
    ])
  }),
  Object.freeze({
    id: 'course-feedback',
    topic: '课程反馈方式',
    professor:
      'A university course can offer either brief feedback every week or detailed feedback after each major project. Which approach would help students learn more, and why?',
    students: Object.freeze([
      Object.freeze({
        name: 'Sara',
        post: 'Weekly feedback lets students change their approach before small problems become serious. It also helps them stay engaged.'
      }),
      Object.freeze({
        name: 'Noah',
        post: 'Detailed project feedback is more useful because teachers can explain the reasons behind their suggestions and show connections across the work.'
      })
    ])
  }),
  Object.freeze({
    id: 'local-travel',
    topic: '校园周边出行',
    professor:
      'A town near a university can improve either bicycle routes or evening buses first. Which improvement would benefit the community more, and why?',
    students: Object.freeze([
      Object.freeze({
        name: 'Eva',
        post: 'Better bicycle routes would make short trips safer and reduce traffic. Many students already own bicycles.'
      }),
      Object.freeze({
        name: 'Omar',
        post: 'Evening buses would help people who work late or cannot ride a bicycle. They would also be useful in bad weather.'
      })
    ])
  })
]);
// 官方格式/维度只提供出处；原创任务和项目辅助维度不换算 IELTS 等级。
export const ARGUMENT_WRITING_BASIS = Object.freeze({
  publisher: 'IELTS',
  title: 'Writing Task 2',
  formatUrl: 'https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-writing',
  criteriaUrl: 'https://ielts.org/cdn/ielts-guides/ielts-writing-band-descriptors.pdf',
  criteriaVersion: 'May 2023',
  verified: '2026-10-06',
  minimumWords: 250,
  recommendedMinutes: 40,
  scoringAuthority: false
});
export const ARGUMENT_WRITING_TASKS = Object.freeze([
  Object.freeze({
    id: 'public-spaces',
    prompt:
      'Some people believe that towns should spend more money on public parks, while others prefer more indoor sports centres. Discuss both views and give your own opinion.',
    topic: '公共运动空间',
    focus: '讨论两种观点，说明你的立场。'
  }),
  Object.freeze({
    id: 'school-projects',
    prompt:
      'Schools should give students more time for practical group projects and less time for individual homework. To what extent do you agree or disagree?',
    topic: '学校项目与作业',
    focus: '明确同意程度，用理由和例子展开。'
  }),
  Object.freeze({
    id: 'remote-work',
    prompt:
      'More adults now work from home instead of travelling to an office every day. Do the advantages of this change outweigh the disadvantages?',
    topic: '居家办公',
    focus: '比较利弊，说明哪一方更重要。'
  }),
  Object.freeze({
    id: 'food-waste',
    prompt:
      'A large amount of food is thrown away by households. What problems can this cause, and what measures could reduce this waste?',
    topic: '家庭食物浪费',
    focus: '解释问题，提出对应措施。'
  })
]);
// 只导入已核验的固定正文；网页图片、个人简介和联系方式不进入产品或记录。
export const PUBLIC_WRITING_REFERENCES = Object.freeze([
  Object.freeze({
    contract: 'public-writing-reference-v1',
    id: 'frontiers-soil-moisture-en-v1',
    version: 1,
    genreId: 'explanation',
    language: 'en',
    purpose: 'writing_reference',
    title: 'Playing the Water Cycle “Game”: Data From Space for A Safer Planet',
    author: 'Luca Brocca',
    coWritingCredit: 'Susan Debad',
    publisher: 'Frontiers for Young Minds',
    published: '2024-03-05',
    retrieved: '2026-10-06',
    doi: '10.3389/frym.2023.1201606',
    url: 'https://kids.frontiersin.org/articles/10.3389/frym.2023.1201606',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    copyright: '© 2024 Brocca',
    location: 'Water, Water Everywhere / paragraph beginning But soil moisture',
    excerpt:
      'But soil moisture, which is a measure of the water content of the soil, also plays a role. The more water there is in the soil, the less “room” there is for additional rainwater. If the soil is saturated and cannot absorb any more water, any precipitation that falls will become runoff—flowing along the ground to fill rivers and streams, which can then rise and cause floods.',
    excerptSha256: 'd1315869f2f9e7ed369f8573bf2f37ee6eb210794cc06c9872348c9078ff95ec',
    changes: '正文未改；Yozi AI 添加写法批注。',
    noteAuthor: 'Yozi AI',
    notes: Object.freeze([
      Object.freeze({ sentence: 1, label: '定义', text: '先解释 soil moisture 指什么，再说明它参与这个过程。' }),
      Object.freeze({ sentence: 2, label: '比较', text: '用 the more … the less … 对照两个量的变化。' }),
      Object.freeze({ sentence: 3, label: '条件与结果', text: '用 if 连接条件与结果，保留 can 表示可能。' })
    ]),
    scoringAuthority: false
  }),
  Object.freeze({
    contract: 'public-writing-reference-v1',
    id: 'wikisource-shexi-return-zh-v1',
    version: 1,
    genreId: 'narrative',
    language: 'zh',
    purpose: 'writing_reference',
    title: '社戏 · 回村片段',
    author: '鲁迅',
    publisher: '维基文库 · 固定版本 10605419',
    published: '1922-12',
    retrieved: '2026-10-06',
    originalPublication: '《小说月报》第13卷第12期',
    url: 'https://zh.wikisource.org/w/index.php?oldid=10605419&title=%E7%A4%BE%E6%88%B2&variant=zh-hans',
    license: 'CC BY-SA 4.0（转录）',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    copyright: '原作公有领域（中国/美国）',
    location: '以“我向船头一望”开头的回村段落',
    excerpt:
      '我向船头一望，前面已经是平桥，桥脚上站着一个人，却是我的母亲，双喜便是对伊说着话。我走出前舱去，船也就进了平桥了，停了船，我们纷纷都上岸。母亲颇有些生气，说是过了三更了，怎么回来得这样迟，但也就高兴了，笑着邀大家去吃炒米。',
    excerptSha256: '51f38b91b1db2dfcb68fa69b8a22800b976182679d1d6d499b3e6712ee593a80',
    changes: '选取固定版本的简体转录，正文未改；Yozi AI 添加写法批注与学习目标。',
    noteAuthor: 'Yozi AI',
    notes: Object.freeze([
      Object.freeze({ sentence: 1, label: '人物与地点', text: '跟随“我”的目光，看清桥边是谁、事情发生在哪里。' }),
      Object.freeze({ sentence: 2, label: '动作顺序', text: '走出前舱、进桥、停船、上岸，让返村过程具体而有序。' }),
      Object.freeze({ sentence: 3, label: '人物反应', text: '留意母亲从责问到笑着邀请的变化，用话语和动作表现人物。' })
    ]),
    teachingBasis: Object.freeze({
      title: '义务教育语文课程标准（2022年版）',
      publisher: '中华人民共和国教育部',
      url: 'https://www.ictr.edu.cn/Uploads/File/2022/04/28/3.%E4%B9%89%E5%8A%A1%E6%95%99%E8%82%B2%E8%AF%AD%E6%96%87%E8%AF%BE%E7%A8%8B%E6%A0%87%E5%87%86%EF%BC%882022%E5%B9%B4%E7%89%88%EF%BC%89.20220428161048.pdf#page=23',
      section: '课程目标 · 表达与交流第5–6条',
      printedPage: 16,
      pdfPage: 23,
      summary: '叙事意图清楚，内容具体，前后有序。',
      interpretationAuthor: 'Yozi AI',
      criterionIds: Object.freeze(['story', 'detail', 'organisation']),
      scoringAuthority: false
    }),
    scoringAuthority: false
  }),
  Object.freeze({
    contract: 'public-writing-reference-v1',
    id: 'wikisource-chengtian-full-zh-v1',
    version: 1,
    genreId: 'narrative',
    language: 'zh',
    purpose: 'writing_reference',
    coverage: 'full_work',
    selectionLabel: '记承天寺夜游 · 全文',
    title: '记承天寺夜游',
    author: '苏轼',
    publisher: '维基文库 · 固定版本 8732064',
    published: '北宋 · 元丰六年',
    retrieved: '2026-10-06',
    originalPublication: '《东坡志林》',
    url: 'https://zh.wikisource.org/w/index.php?oldid=8732064&title=%E8%A8%98%E6%89%BF%E5%A4%A9%E5%AF%BA%E5%A4%9C%E9%81%8A&variant=zh-hans',
    license: 'CC BY-SA 4.0（转录）',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    copyright: '原作公有领域',
    location: '固定版本简体转录全文，含末段',
    excerpt:
      '元丰六年十月十二日夜，解衣欲睡，月色入户，欣然起行。念无与为乐者，遂至承天寺寻张怀民。怀民亦未寝，相与步于中庭。\n\n庭下如积水空明，水中藻荇交横，盖竹柏影也。何夜无月？何处无竹柏？但少闲人如吾两人者耳。\n\n黄州团练副使苏某书。',
    excerptSha256: '822f31a4e103bf15f36fe1e3f8df0c2d0d0f2e62b4777ae4b9fe30ab99ed909a',
    versionNote: '本版用“水中”；末句署名据《永乐大典》补。',
    changes: '采用固定版本简体转录；略去网页脚注标记，正文未改。Yozi AI 添加写法批注。',
    noteAuthor: 'Yozi AI',
    notesLicense: 'CC BY-SA 4.0',
    notes: Object.freeze([
      Object.freeze({ sentence: 1, label: '起因', text: '从日期、夜晚和月色写出出游的起因。' }),
      Object.freeze({ sentence: 4, label: '景物细节', text: '用积水、藻荇描写月光与竹柏影，让眼前景物具体可见。' }),
      Object.freeze({ sentence: 7, label: '收束', text: '从眼前景物转到“闲人”的感受，使结尾呼应夜游。' })
    ]),
    scoringAuthority: false
  }),
  Object.freeze({
    contract: 'public-writing-reference-v1',
    id: 'wikisource-xiaoshitan-full-zh-v1',
    version: 1,
    genreId: 'narrative',
    language: 'zh',
    purpose: 'writing_reference',
    coverage: 'full_work',
    selectionLabel: '小石潭记 · 全文',
    title: '至小丘西小石潭记',
    author: '柳宗元',
    publisher: '维基文库 · 固定版本 2510274',
    published: '唐',
    retrieved: '2026-10-06',
    originalPublication: '《唐柳先生集》卷29',
    url: 'https://zh.wikisource.org/w/index.php?oldid=2510274&title=%E8%87%B3%E5%B0%8F%E4%B8%98%E8%A5%BF%E5%B0%8F%E7%9F%B3%E6%BD%AD%E8%A8%98&variant=zh-hans',
    license: 'CC BY-SA 4.0（转录）',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    copyright: '原作公有领域',
    location: '固定版本简体转录全文，含末段',
    excerpt:
      '从小丘西行百二十步，隔篁竹，闻水声，如鸣珮环，心乐之。伐竹取道，下见小潭，水尤清洌。全石以为底，近岸，卷石底以出，为坻，为屿，为嵁，为岩。青树翠蔓，蒙络摇缀，参差披拂。\n\n潭中鱼可百许头，皆若空游无所依。日光下澈，影布石上，佁然不动；俶尔远逝，往来翕忽，似与游者相乐。\n\n潭西南而望，斗折蛇行，明灭可见。其岸势犬牙差互，不可知其源。\n\n坐潭上，四面竹树环合，寂寥无人，凄神寒骨，悄怆幽邃。以其境过清，不可久居，乃记之而去。\n\n同游者：吴武陵，龚古，余弟宗玄。隶而从者，崔氏二小生：曰恕己，曰奉壹。',
    excerptSha256: '8aebd85753bba934fde9d67923513583ef092805b7816b97427a1e29d03d6b08',
    versionNote: '保留本版“珮环”“清洌”“下澈”“奉壹”；教材可能采用异文。',
    changes: '采用固定版本简体转录；略去网页脚注标记，正文未改。Yozi AI 添加写法批注。',
    noteAuthor: 'Yozi AI',
    notesLicense: 'CC BY-SA 4.0',
    notes: Object.freeze([
      Object.freeze({ sentence: 1, label: '观察顺序', text: '先交代行进位置，再从声音进入景物。' }),
      Object.freeze({ sentence: 6, label: '动静细节', text: '先写日光、鱼影和不动，再写鱼突然游动，使观察具体。' }),
      Object.freeze({ sentence: 10, label: '感受与离开', text: '用环境引出不久留的原因，把游览与感受连起来。' })
    ]),
    scoringAuthority: false
  }),
  Object.freeze({
    contract: 'public-writing-reference-v1',
    id: 'usgs-water-cycle-full-en-v1',
    version: 1,
    genreId: 'explanation',
    language: 'en',
    purpose: 'writing_reference',
    coverage: 'full_text',
    selectionLabel: '水循环 · 英文正文全文',
    title: 'Water cycle',
    author: 'Water Science School',
    publisher: 'U.S. Geological Survey',
    published: '日期未标注',
    retrieved: '2026-10-07',
    url: 'https://www.usgs.gov/special-topics/water-science-school/water-cycle',
    license: '美国公有领域（USGS文字）',
    licenseUrl: 'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits',
    copyright: 'Credit: U.S. Geological Survey',
    location: 'What is the water cycle? 至 What determines water availability?；7小节、8段正文。',
    paragraphCount: 8,
    sectionCount: 7,
    excerpt:
      "What is the water cycle?\n\nThe water cycle describes where water is on Earth and how it moves. Water is stored in the atmosphere, on the land surface, and below the ground. It can be a liquid, a solid, or a gas. Liquid water can be fresh or saline (salty). Water moves between the places it is stored. Water moves at large scales, through watersheds, the atmosphere, and below the Earth's surface. Water moves at very small scales too. It is in us, plants, and other organisms. Human activities impact the water cycle, affecting where water is stored, how it moves, and how clean it is.\n\nPools store water\n\nOceans store 96% of all water on Earth. Ocean water is saline, meaning it’s salty. On land, saline water is stored in saline lakes. The rest of the water on Earth is fresh water. Fresh water is stored in liquid form in freshwater lakes, artificial reservoirs, rivers, and wetlands. Water is stored in solid, frozen form in ice sheets and glaciers, and in snowpack at high elevations or near Earth's poles. Water vapor is a gas and is stored as atmospheric moisture over the ocean and land. In the soil, frozen water is stored as permafrost and liquid water is stored as soil moisture. Deeper below ground, liquid water is stored as groundwater in aquifers. Water in groundwater aquifers is found within cracks and pores in the rock.\n\nFluxes move water between pools\n\nAs it moves, water can change form between liquid, solid, and gas. Circulation mixes water in the oceans and transports water vapor in the atmosphere. Water moves between the atmosphere and the surface through evaporation, evapotranspiration, and precipitation. Water moves across the surface through snowmelt, runoff, and streamflow. Water moves into the ground through infiltration and groundwater recharge. Underground, groundwater flows within aquifers. Groundwater can return to the surface through natural discharge into rivers, the ocean, and from springs.\n\nWhat drives the water cycle?\n\nWater moves naturally and because of human actions. Energy from the sun and the force of gravity drive the continual movement of water between pools. The sun’s energy causes liquid water to evaporate into water vapor. Evapotranspiration is the main way water moves into the atmosphere from the land surface and oceans. Gravity causes water to flow downward on land. It causes rain, snow, and hail to fall from clouds.\n\nHumans alter the water cycle\n\nIn addition to natural processes, human water use affects where water is stored and how water moves. We redirect rivers. We build dams to store water. We drain water from wetlands for development. We use water from rivers, lakes, reservoirs, and groundwater aquifers. We use that water to supply our homes and communities. We use it for agricultural irrigation and grazing livestock. We use it in industrial activities like thermoelectric power generation, mining, and aquaculture.\n\nWe also affect water quality. In agricultural and urban areas, irrigation and precipitation wash fertilizers and pesticides into rivers and groundwater. Power plants and factories return heated and contaminated water to rivers. Runoff carries chemicals, sediment, and sewage into rivers and lakes. Downstream from these sources, contaminated water can cause harmful algal blooms, spread diseases, and harm habitats for wildlife.\n\nThe water cycle and climate change\n\nClimate change is actively affecting the water cycle. It is impacting water quantity and timing. Precipitation patterns are changing. The frequency, intensity, and length of extreme weather events, like floods or droughts, are also changing. Ocean sea levels are rising, leading to coastal flooding. Climate change is also impacting water quality. It is causing ocean acidification which damages the shells and skeletons of many marine organisms. Climate change increases the likelihood and intensity of wildfires, which introduces unwanted pollutants from soot and ash into nearby lakes and streams.\n\nWhat determines water availability?\n\nHumans and other organisms rely on water for life. The amount of water that is available depends on how much water there is in each pool (water quantity). Water availability also depends on when and how fast water moves (water timing) through the water cycle. Finally, water availability depends on how clean the water is (water quality). By understanding human impacts on the water cycle, we can work toward using water sustainably.",
    excerptSha256: '33d6dfea21f4adda94a3b904c5fa347ec53f5ea2cc3dec79a69de739328faa78',
    changes: '正文仅规范化空白；页面导读、配图、图注和导航未收录。Yozi AI 添加批注。',
    noteAuthor: 'Yozi AI',
    notes: Object.freeze([
      Object.freeze({ paragraph: 1, label: '定义', text: '先分清水在哪里，再解释它怎样移动。' }),
      Object.freeze({ paragraph: 3, label: '过程', text: '重复 Water moves 串联不同过程，让位置变化清楚。' }),
      Object.freeze({ paragraph: 8, label: '收束', text: '用数量、时间和水质三项收束，呼应开头的水循环。' })
    ]),
    scoringAuthority: false
  }),
  Object.freeze({
    contract: 'public-writing-reference-v1',
    id: 'mcmurrey-inquiry-letter-body-en-v1',
    version: 1,
    genreId: 'email',
    language: 'en',
    purpose: 'writing_reference',
    title: '硬件咨询信 · 正文',
    selectionLabel: '技术咨询信',
    author: 'W. Gary NNNNN（原文署名）',
    publisher: 'Online Technical Writing · David McMurrey',
    published: '信内日期 1998-07-12',
    retrieved: '2026-10-08',
    url: 'https://mcmassociates.io/textbook/examples/inquirex2c.html',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    copyright: '原文署名保留 · CC BY 4.0',
    coverage: 'full_body',
    location: 'Dear Technical Support Department 至 Sincerely / W. Gary NNNNN，全部信件正文',
    sourceSha256: '19348e088f842da6f5d87509e7432fffb94df81803bae2aa773dcefbe54cdc21',
    originalBodySha256: 'c43b45a6e1be6d4d4fb8755e3c6528fa5182abd6b7eae18bcfff6c3b47fadbd3',
    excerpt:
      "Dear Technical Support Department:\n\nI am writing this letter to ask you some technical questions about hardware support in version 5.1 of Red Hat Linux. I saw Red Hat Software's advertisement for version 5.1 of Linux in the August, 1998, issue of Linux Journal. I was quite impressed with the capabilities as listed in the advertisement, and I would like to learn some more about the product. Before I make the decision to purchase the software, I need to be certain that it will work properly on my computer.\n\nI have three hardware support questions that I would like you to answer. I have reviewed the technical support information at Red Hat Software's home page (www.redhat.com), but I have not been able to find answers to my questions. The three hardware-related questions that I have are as follows:\n\n1. Does the latest release of Red Hat Linux support the Diamond Viper 330 PCI video card? This card uses the Riva chipset released by NVIDIA Corporation.\n\n2. If Red Hat Linux does not currently have a driver for this card, is there a timetable for when the card will be supported?\n\n3. Is there an online site for the latest list of supported hardware. This would be a great aid to me in the future, as I often upgrade my machine.\n\nI am aware that some of the early versions of Red Hat Linux were not able to support some of Diamond Multimedia's products, and I hope that new drivers have been created in this latest software release. If the latest release of Red Hat Linux can support my video hardware, I will definitely purchase the product. I feel that the price on the product is exceptional, and the range of features is outstanding.\n\nFor your convenience, you can respond to me by e-mail. My e-mail address is [contact email]. If you prefer to respond by telephone, you can reach me at [contact number]. I appreciate any assistance that you are able to provide me.\n\nSincerely,\nW. Gary NNNNN",
    excerptSha256: '5ba95b8e183c4403b8ebbc0f2dc6bdc1519e3733bc8a9cdd4f6592b4f0e8f7e6',
    changes: '隐去地址和联系方式，按段落排版；Yozi AI 添加学习批注。',
    versionNote: '1998年课堂参考；用于学习书信写法。',
    noteAuthor: 'Yozi AI',
    notes: Object.freeze(
      [
        {
          paragraph: 2,
          label: '目的与背景',
          text: '开头说明写信目的、信息来源和自己的需要。'
        },
        {
          paragraph: 3,
          label: '问题列表',
          text: '先说明已查资料，再分列三问；第三问原文的句末标点另核对。'
        },
        {
          paragraph: 8,
          label: '回复与感谢',
          text: '给出回复方式并感谢对方；此处已隐去联系方式。'
        }
      ].map((note) => Object.freeze(note))
    ),

    scoringAuthority: false
  })
]);
export function writingReferenceNoteLocation(note) {
  return Number.isInteger(note.paragraph) && note.paragraph > 0 ? `第${note.paragraph}段` : `第${note.sentence}句`;
}
export function publicWritingReference(id, version) {
  const reference = PUBLIC_WRITING_REFERENCES.find((item) => item.id === id && item.version === version);
  requireNotice(reference, '这段参考的版本未开放', 'CAPABILITY_UNAVAILABLE');
  return JSON.parse(JSON.stringify(reference));
}
export const WRITING_GENRES = Object.freeze([
  { id: 'notice', label: '英文通知', language: 'en', goal: '英文通知写作' },
  { id: 'explanation', label: '英文说明', language: 'en', goal: '英文说明写作' },
  { id: 'argument', label: '英文论证', language: 'en', goal: '英文论证写作' },
  { id: 'email', label: '英文邮件', language: 'en', goal: '英文邮件写作' },
  { id: 'discussion', label: '英文讨论', language: 'en', goal: '英文学术讨论' },
  { id: 'narrative', label: '中文叙事', language: 'zh', goal: '中文叙事写作' },
  { id: 'material_argument', label: '中文材料论证', language: 'zh', goal: '中文材料论证' }
]);
const GUIDED_TASKS = Object.freeze({
  explanation: [
    ['paper', '学校回收旧纸', '减少垃圾', '先收集旧纸，再放入纸箱', '邀请同学参与'],
    ['water', '在学校节约用水', '避免浪费', '先洗手，再关紧水龙头', '邀请同学一起节水'],
    ['books', '班级交换旧书', '让更多人读到好书', '先登记书名，再交换书籍', '邀请同学带一本书'],
    ['walking', '步行去附近公园', '锻炼身体', '先选安全路线，再和朋友同行', '建议同学周末尝试']
  ],
  narrative: [
    ['umbrella', '放学时突然下雨，同学没有带伞', '你把伞递给同学', '同学接过伞并道谢', '写当时的感受'],
    ['book', '课间发现图书馆借来的书不见了', '你和同学一起寻找', '最后在教室书架找到书', '写寻找后的感受'],
    ['race', '运动会上同学在终点前摔倒', '你停下来扶起同学', '你们一起走过终点', '写这次经历带来的感受'],
    ['plant', '教室里的小植物叶子开始发黄', '你向老师请教并照顾植物', '后来长出了新叶', '写等待新叶时的感受']
  ]
});
export function writingGenre(question) {
  return [GUIDED_WRITING_CONTRACT, ...EXTENDED_WRITING_CONTRACTS].includes(question?.writingExercise?.contract)
    ? question.writingExercise.genreId
    : 'notice';
}
export function writingGenreInfo(id) {
  const genre = WRITING_GENRES.find((item) => item.id === id);
  requireNotice(genre, '请选择写作体裁');
  return genre;
}
export const NOTICE_REFERENCE =
  'https://www.cambridgeenglish.org/images/231794-cambridge-english-assessing-writing-performance-at-level-b1.pdf';
export const NOTICE_TASKS = Object.freeze(
  [
    ['reading-club', '阅读社团活动', '周五下午3点', '教室', '带笔记本'],
    ['art-circle', '美术社团活动', '周二下午2点', '美术教室', '带彩色铅笔'],
    ['sports-meet', '校内运动会', '周三下午5点', '操场', '带水瓶'],
    ['history-tour', '历史参观活动', '周四上午10点', '博物馆', '带学生证']
  ].map(([id, event, time, place, action]) => Object.freeze({ id, event, time, place, action }))
);
function requireNotice(ok, message, code = 'INVALID_INPUT') {
  if (!ok) throw Object.assign(new Error(message), { code });
}
function exact(value, expected) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === Object.keys(expected).length &&
    Object.keys(expected).every((key) => value[key] === expected[key])
  );
}
export function noticeTask(id) {
  const task = NOTICE_TASKS.find((item) => item.id === id);
  requireNotice(task, '当前通知题型未开放');
  return task;
}
export function noticeRubric(taskId) {
  noticeTask(taskId);
  return {
    id: `${NOTICE_CONTRACT}:${taskId}`,
    version: 1,
    source: { kind: 'reference_candidate', reference: NOTICE_REFERENCE },
    criteria: [
      { id: 'content', name: '信息完整', description: '活动、时间、地点和参加要求是否准确完整。', maxScore: 5 },
      { id: 'reader', name: '读者与目的', description: '同学是否能理解通知并知道接下来做什么。', maxScore: 5 },
      { id: 'organisation', name: '组织', description: '信息是否有顺序，句子之间是否连贯。', maxScore: 5 },
      { id: 'language', name: '语言', description: '用词与句子是否清楚，语法是否影响理解。', maxScore: 5 }
    ]
  };
}
export function nextNoticeDay(day) {
  requireNotice(/^\d{4}-\d{2}-\d{2}$/.test(day), '复测日期不合法');
  const date = new Date(`${day}T12:00:00Z`);
  requireNotice(Number.isFinite(+date) && date.toISOString().slice(0, 10) === day, '复测日期不合法');
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
function noticePlanningDay(at, timezone) {
  requireNotice(typeof timezone === 'string' && timezone.length <= 80, '复测时区不合法');
  try {
    return dayKey(at, timezone);
  } catch {
    requireNotice(false, '复测时区不合法');
  }
}
export function createNoticeQuestion(
  id,
  conversationId,
  taskId = 'reading-club',
  parent = null,
  dueDay = null,
  planning = null
) {
  const task = noticeTask(taskId);
  requireNotice(
    typeof id === 'string' && id && typeof conversationId === 'string' && conversationId,
    '写作需绑定当前对话'
  );
  return {
    id,
    version: 1,
    scope: 'generated',
    subject: '英语',
    knowledgePoint: '英文通知写作',
    prompt: `请为同学写一则50–80词的英文通知：${task.event}，${task.time}，地点在${task.place}，请同学${task.action}。`,
    answerType: 'subjective',
    source: { kind: 'project_original', reference: NOTICE_CONTRACT },
    validation: null,
    rubric: noticeRubric(taskId),
    writingExercise: {
      contract: NOTICE_CONTRACT,
      taskId,
      conversationId,
      phase: dueDay ? 'retest' : 'independent',
      dueDay,
      plannedDay: planning?.day ?? null,
      plannedTimezone: planning?.timezone ?? null
    },
    ...(parent ? { parentQuestionKey: parent } : {})
  };
}
export function normalizeNoticeQuestion(question, state, at) {
  const exercise = question.writingExercise;
  requireNotice(exercise?.contract === NOTICE_CONTRACT, '通知题目版本不支持');
  const canonical = createNoticeQuestion(
    question.id,
    exercise.conversationId,
    exercise.taskId,
    question.parentQuestionKey || null,
    exercise.dueDay,
    exercise.dueDay ? { day: exercise.plannedDay, timezone: exercise.plannedTimezone } : null
  );
  return normalizeCanonicalWriting(question, state, at, canonical);
}
function normalizeCanonicalWriting(question, state, at, canonical) {
  const exercise = question.writingExercise;
  requireNotice(exact(exercise, canonical.writingExercise), '通知任务含有不支持的字段');
  requireNotice(
    question.prompt === canonical.prompt &&
      question.subject === canonical.subject &&
      question.knowledgePoint === canonical.knowledgePoint &&
      question.answerType === 'subjective' &&
      !question.validation &&
      question.expectedAnswer == null &&
      !question.options?.length &&
      exact(question.source, canonical.source),
    '原创通知条件已变化，不能沿用原任务合同'
  );
  const session = state.conversations.find((c) => c.id === exercise.conversationId);
  requireNotice(session && !session.stopped, '当前任务已停止', 'STOPPED');
  const previous = state.questions.find((q) => `${q.id}@${q.version}` === question.rubricRevisionOf);
  if (question.rubricRevisionOf) {
    requireNotice(
      previous &&
        previous.id === question.id &&
        previous.version < question.version &&
        exact(previous.writingExercise, exercise) &&
        previous.parentQuestionKey === question.parentQuestionKey &&
        question.scope === 'private',
      '量表修订需保留原通知任务'
    );
  } else {
    requireNotice(question.version === 1 && question.scope === 'generated', '通知任务版本不支持');
    requireNotice(
      !state.questions.some(
        (q) =>
          q.writingExercise?.conversationId === session.id &&
          q.writingExercise.contract === exercise.contract &&
          q.writingExercise.genreId === exercise.genreId &&
          q.writingExercise.taskId === exercise.taskId
      ),
      '当前通知题型已存在',
      'CONFLICT'
    );
    requireNotice(JSON.stringify(question.rubric) === JSON.stringify(canonical.rubric), '通知量表与原任务不符');
    if (exercise.dueDay)
      requireNotice(
        exercise.plannedDay === noticePlanningDay(at, exercise.plannedTimezone) &&
          exercise.dueDay === nextNoticeDay(exercise.plannedDay),
        '复测需保留安排时的时区与明日日期'
      );
  }
  if (question.parentQuestionKey) {
    const parent = state.questions.find((q) => `${q.id}@${q.version}` === question.parentQuestionKey);
    requireNotice(
      parent?.writingExercise?.conversationId === session.id &&
        parent.writingExercise.contract === exercise.contract &&
        parent.writingExercise.genreId === exercise.genreId &&
        parent.writingExercise.taskId !== exercise.taskId &&
        state.attempts.some((a) => a.questionKey === question.parentQuestionKey && a.conversationId === session.id),
      '换题或复测需关联同一对话已保存的通知原答'
    );
  } else requireNotice(!exercise.dueDay, '复测需要原题');
  return question;
}
export function createWritingQuestion(
  id,
  conversationId,
  genreId = 'notice',
  taskId = null,
  parent = null,
  dueDay = null,
  planning = null
) {
  writingGenreInfo(genreId);
  if (genreId === 'notice')
    return createNoticeQuestion(id, conversationId, taskId || 'reading-club', parent, dueDay, planning);
  if (genreId === 'material_argument') {
    const task = CHINESE_MATERIAL_ARGUMENT_TASKS.find(
      (item) => item.id === (taskId || CHINESE_MATERIAL_ARGUMENT_TASKS[0].id)
    );
    requireNotice(task, '当前材料论证情境未开放');
    requireNotice(
      typeof id === 'string' && id && typeof conversationId === 'string' && conversationId,
      '写作需绑定当前对话'
    );
    return {
      id,
      version: 1,
      scope: 'generated',
      subject: '语文',
      knowledgePoint: '中文材料论证',
      prompt: `请结合材料写一篇中文论证，建议300–600字。${task.focus}\n引用材料编号，解释依据怎样支持判断，并回应一种不同意见。\nYozi AI 原创情境 · 合成观察，不是真实统计。\n${task.materials.map((text, index) => `【材料${index + 1}】${text}`).join('\n')}`,
      answerType: 'subjective',
      source: { kind: 'project_original', reference: CHINESE_MATERIAL_ARGUMENT_CONTRACT },
      validation: null,
      rubric: {
        id: `${CHINESE_MATERIAL_ARGUMENT_CONTRACT}:${task.id}`,
        version: 1,
        source: { kind: 'project_original', reference: CHINESE_MATERIAL_ARGUMENT_CONTRACT },
        criteria: [
          { id: 'position', name: '观点与回应', description: '回应本题，说明判断和适用条件。', maxScore: 5 },
          {
            id: 'evidence',
            name: '材料与推理',
            description: '准确引用材料，解释依据与结论的关系，保留观察范围和不确定性。',
            maxScore: 5
          },
          { id: 'balance', name: '不同意见', description: '回应不同意见，说明取舍或可行的改进。', maxScore: 5 },
          { id: 'organisation', name: '组织与表达', description: '段落有重点，词句、衔接和标点清楚。', maxScore: 5 }
        ]
      },
      writingExercise: {
        contract: CHINESE_MATERIAL_ARGUMENT_CONTRACT,
        genreId,
        taskId: task.id,
        conversationId,
        phase: dueDay ? 'retest' : 'independent',
        dueDay,
        plannedDay: planning?.day ?? null,
        plannedTimezone: planning?.timezone ?? null
      },
      ...(parent ? { parentQuestionKey: parent } : {})
    };
  }
  if (genreId === 'email') {
    const task = EMAIL_WRITING_TASKS.find((item) => item.id === (taskId || EMAIL_WRITING_TASKS[0].id));
    requireNotice(task, '当前邮件情境未开放');
    requireNotice(
      typeof id === 'string' && id && typeof conversationId === 'string' && conversationId,
      '写作需绑定当前对话'
    );
    return {
      id,
      version: 1,
      scope: 'generated',
      subject: '英语',
      knowledgePoint: '英文邮件写作',
      prompt: `请用英文给${task.recipient}写一封邮件。\n情境：${task.situation}\n邮件中请完成：\n${task.targets.map((target, index) => `${index + 1}. ${target}`).join('\n')}`,
      answerType: 'subjective',
      source: { kind: 'project_original', reference: EMAIL_WRITING_CONTRACT },
      validation: null,
      rubric: {
        id: `${EMAIL_WRITING_CONTRACT}:${task.id}`,
        version: 1,
        source: { kind: 'project_original', reference: EMAIL_WRITING_CONTRACT },
        criteria: [
          { id: 'purpose', name: '目的与任务', description: '写给指定对象，回应全部要求，写作目的清楚。', maxScore: 5 },
          { id: 'detail', name: '信息与展开', description: '提供对方理解情况和回应所需的具体信息。', maxScore: 5 },
          { id: 'reader', name: '读者与语气', description: '请求、建议或说明适合收件对象，表达得体。', maxScore: 5 },
          { id: 'language', name: '语言与组织', description: '信息安排、词义与句法清楚，表达不妨碍理解。', maxScore: 5 }
        ]
      },
      writingExercise: {
        contract: EMAIL_WRITING_CONTRACT,
        genreId,
        taskId: task.id,
        conversationId,
        phase: dueDay ? 'retest' : 'independent',
        dueDay,
        plannedDay: planning?.day ?? null,
        plannedTimezone: planning?.timezone ?? null
      },
      ...(parent ? { parentQuestionKey: parent } : {})
    };
  }
  if (genreId === 'discussion') {
    const task = DISCUSSION_WRITING_TASKS.find((item) => item.id === (taskId || DISCUSSION_WRITING_TASKS[0].id));
    requireNotice(task, '当前讨论情境未开放');
    requireNotice(
      typeof id === 'string' && id && typeof conversationId === 'string' && conversationId,
      '写作需绑定当前对话'
    );
    return {
      id,
      version: 1,
      scope: 'generated',
      subject: '英语',
      knowledgePoint: '英文学术讨论',
      prompt: `请用自己的话回应教授提问和同学观点，说明并支持你的看法。建议至少100词。\nProfessor: ${task.professor}\n${task.students.map((student) => `${student.name}: ${student.post}`).join('\n')}`,
      answerType: 'subjective',
      source: { kind: 'project_original', reference: DISCUSSION_WRITING_CONTRACT },
      validation: null,
      rubric: {
        id: `${DISCUSSION_WRITING_CONTRACT}:${task.id}`,
        version: 1,
        source: { kind: 'project_original', reference: DISCUSSION_WRITING_CONTRACT },
        criteria: [
          {
            id: 'contribution',
            name: '讨论贡献',
            description: '回应提问和相关同学观点，用自己的话提出清楚的看法。',
            maxScore: 5
          },
          { id: 'development', name: '观点展开', description: '理由和具体例子支持看法，补充有用的信息。', maxScore: 5 },
          {
            id: 'organisation',
            name: '组织与衔接',
            description: '观点、回应和理由顺序清楚，指代与连接自然。',
            maxScore: 5
          },
          { id: 'language', name: '语言表达', description: '词义、搭配和句法适合当前表达，不妨碍理解。', maxScore: 5 }
        ]
      },
      writingExercise: {
        contract: DISCUSSION_WRITING_CONTRACT,
        genreId,
        taskId: task.id,
        conversationId,
        phase: dueDay ? 'retest' : 'independent',
        dueDay,
        plannedDay: planning?.day ?? null,
        plannedTimezone: planning?.timezone ?? null
      },
      ...(parent ? { parentQuestionKey: parent } : {})
    };
  }
  if (genreId === 'argument') {
    const task = ARGUMENT_WRITING_TASKS.find((item) => item.id === (taskId || ARGUMENT_WRITING_TASKS[0].id));
    requireNotice(task, '当前论证情境未开放');
    requireNotice(
      typeof id === 'string' && id && typeof conversationId === 'string' && conversationId,
      '写作需绑定当前对话'
    );
    return {
      id,
      version: 1,
      scope: 'generated',
      subject: '英语',
      knowledgePoint: '英文论证写作',
      prompt: `请写至少250词的英文论证文章：\n${task.prompt}`,
      answerType: 'subjective',
      source: { kind: 'project_original', reference: ARGUMENT_WRITING_CONTRACT },
      validation: null,
      rubric: {
        id: `${ARGUMENT_WRITING_CONTRACT}:${task.id}`,
        version: 1,
        source: { kind: 'project_original', reference: ARGUMENT_WRITING_CONTRACT },
        criteria: [
          {
            id: 'response',
            name: '回应题目',
            description: '回应全部提问，立场清楚，理由和例子贴合题目。',
            maxScore: 5
          },
          {
            id: 'coherence',
            name: '组织与衔接',
            description: '段落各有重点，观点有顺序，衔接和指代清楚。',
            maxScore: 5
          },
          { id: 'lexis', name: '词汇', description: '词义和搭配适合当前语境，表达准确。', maxScore: 5 },
          { id: 'grammar', name: '句法', description: '句子结构支持表达，语法和标点错误不妨碍理解。', maxScore: 5 }
        ]
      },
      writingExercise: {
        contract: ARGUMENT_WRITING_CONTRACT,
        genreId,
        taskId: task.id,
        conversationId,
        phase: dueDay ? 'retest' : 'independent',
        dueDay,
        plannedDay: planning?.day ?? null,
        plannedTimezone: planning?.timezone ?? null
      },
      ...(parent ? { parentQuestionKey: parent } : {})
    };
  }
  const tasks = GUIDED_TASKS[genreId];
  const task = tasks.find((item) => item[0] === (taskId || tasks[0][0]));
  requireNotice(task, '当前写作情境未开放');
  requireNotice(
    typeof id === 'string' && id && typeof conversationId === 'string' && conversationId,
    '写作需绑定当前对话'
  );
  const language = genreId === 'narrative' ? '语文' : '英语';
  const criteria =
    genreId === 'narrative'
      ? [
          ['story', '事情完整', '人物、起因、经过与结果是否清楚。'],
          ['detail', '具体细节', '动作、神态或对话是否让事情具体。'],
          ['organisation', '顺序', '前后是否连贯，指代是否清楚。'],
          ['language', '表达', '词句和标点是否清楚、自然。']
        ]
      : [
          ['content', '信息完整', '主题、原因、步骤与建议是否清楚。'],
          ['reader', '读者与目的', '读者是否理解原因并知道如何行动。'],
          ['organisation', '组织', '原因与步骤是否按顺序连接。'],
          ['language', '语言', '词句是否清楚，语法是否影响理解。']
        ];
  return {
    id,
    version: 1,
    scope: 'generated',
    subject: language,
    knowledgePoint: writingGenreInfo(genreId).goal,
    prompt: `请写${genreId === 'narrative' ? '一段80–150字的中文叙事' : '一段50–80词的英文说明'}：${task.slice(1).join('；')}。`,
    answerType: 'subjective',
    source: { kind: 'project_original', reference: GUIDED_WRITING_CONTRACT },
    validation: null,
    rubric: {
      id: `${GUIDED_WRITING_CONTRACT}:${genreId}:${task[0]}`,
      version: 1,
      source: { kind: 'project_original', reference: GUIDED_WRITING_CONTRACT },
      criteria: criteria.map(([id, name, description]) => ({ id, name, description, maxScore: 5 }))
    },
    writingExercise: {
      contract: GUIDED_WRITING_CONTRACT,
      genreId,
      taskId: task[0],
      conversationId,
      phase: dueDay ? 'retest' : 'independent',
      dueDay,
      plannedDay: planning?.day ?? null,
      plannedTimezone: planning?.timezone ?? null
    },
    ...(parent ? { parentQuestionKey: parent } : {})
  };
}
export function normalizeWritingQuestion(question, state, at) {
  if (question.writingExercise?.contract === NOTICE_CONTRACT) return normalizeNoticeQuestion(question, state, at);
  const exercise = question.writingExercise;
  requireNotice(
    (exercise?.contract === GUIDED_WRITING_CONTRACT && ['explanation', 'narrative'].includes(exercise.genreId)) ||
      (exercise?.contract === ARGUMENT_WRITING_CONTRACT && exercise.genreId === 'argument') ||
      (exercise?.contract === EMAIL_WRITING_CONTRACT && exercise.genreId === 'email') ||
      (exercise?.contract === CHINESE_MATERIAL_ARGUMENT_CONTRACT && exercise.genreId === 'material_argument') ||
      (exercise?.contract === DISCUSSION_WRITING_CONTRACT && exercise.genreId === 'discussion'),
    '写作任务版本或体裁不支持'
  );
  const canonical = createWritingQuestion(
    question.id,
    exercise.conversationId,
    exercise.genreId,
    exercise.taskId,
    question.parentQuestionKey || null,
    exercise.dueDay,
    exercise.dueDay ? { day: exercise.plannedDay, timezone: exercise.plannedTimezone } : null
  );
  return normalizeCanonicalWriting(question, state, at, canonical);
}
export function nextWritingTask(state, conversationId, genreId = 'notice') {
  writingGenreInfo(genreId);
  if (genreId === 'notice') return nextNoticeTask(state, conversationId);
  const used = new Set(
    state.questions
      .filter((q) => q.writingExercise?.conversationId === conversationId && writingGenre(q) === genreId)
      .map((q) => q.writingExercise.taskId)
  );
  if (genreId === 'material_argument') {
    const task = CHINESE_MATERIAL_ARGUMENT_TASKS.find((item) => !used.has(item.id));
    requireNotice(task, '本组材料论证情境已写完', 'CAPABILITY_UNAVAILABLE');
    return task.id;
  }
  if (genreId === 'argument') {
    const task = ARGUMENT_WRITING_TASKS.find((item) => !used.has(item.id));
    requireNotice(task, '本组论证情境已写完', 'CAPABILITY_UNAVAILABLE');
    return task.id;
  }
  if (genreId === 'discussion') {
    const task = DISCUSSION_WRITING_TASKS.find((item) => !used.has(item.id));
    requireNotice(task, '本组讨论情境已写完', 'CAPABILITY_UNAVAILABLE');
    return task.id;
  }
  if (genreId === 'email') {
    const task = EMAIL_WRITING_TASKS.find((item) => !used.has(item.id));
    requireNotice(task, '本组邮件情境已写完', 'CAPABILITY_UNAVAILABLE');
    return task.id;
  }
  const task = GUIDED_TASKS[genreId].find((item) => !used.has(item[0]));
  requireNotice(task, '当前体裁的原创情境已练完', 'CAPABILITY_UNAVAILABLE');
  return task[0];
}
export function writingRetestReady(question, at = Date.now()) {
  const exercise = question?.writingExercise;
  return !exercise || exercise.phase !== 'retest' || noticePlanningDay(at, exercise.plannedTimezone) >= exercise.dueDay;
}

// 原创情境的草稿支架；仅检查字面线索与格式，不判作文语义或词汇掌握。
export const GUIDED_WRITING_STEPS = Object.freeze({
  material_argument: [
    {
      id: 'position',
      label: '观点',
      prompt: '回应提问，写清你的判断和适用条件。',
      scaffold: '我主张……，前提是……。',
      words: ['条件'],
      needs: [],
      hint: '允许有条件地支持或反对，不必选固定立场。'
    },
    {
      id: 'evidence',
      label: '材料与分析',
      prompt: '引用材料编号，解释依据怎样支持判断。',
      scaffold: '材料……提到……；这能说明……，但不能据此认定……。',
      words: ['依据', '范围'],
      needs: [],
      hint: '区分材料中的观察与你的推论，保留范围限制。'
    },
    {
      id: 'balance',
      label: '不同意见',
      prompt: '回应一种不同意见，说明取舍。',
      scaffold: '不过，……的担心也有道理；可以通过……回应。',
      words: ['不过', '条件'],
      needs: [],
      hint: '回应理由，不必把另一种意见写成错误。'
    },
    {
      id: 'conclusion',
      label: '结论',
      prompt: '概括判断，提出可检验的下一步。',
      scaffold: '因此，我建议……，并观察……后再决定……。',
      words: ['因此', '范围'],
      needs: [],
      hint: '结论与依据相连，说明还需要知道什么。'
    }
  ],
  email: [
    {
      id: 'purpose',
      label: '来意',
      prompt: '称呼收件对象，说明写邮件的来意。',
      scaffold: 'Dear …,\nI am writing to …',
      words: ['request', 'please'],
      needs: [],
      hint: '先让对方知道你为什么写这封邮件。'
    },
    {
      id: 'detail',
      label: '情况',
      prompt: '把对方需要知道的具体信息说清楚。',
      scaffold: 'The situation is …',
      words: ['because', 'however'],
      needs: [],
      hint: '选与任务有关的信息，不必编造私人情况。'
    },
    {
      id: 'action',
      label: '回应',
      prompt: '提出具体的请求、建议或可行的下一步。',
      scaffold: 'Could you please …?',
      words: ['please', 'confirm'],
      needs: [],
      hint: '给对方一个清楚、可以回应的请求。'
    },
    {
      id: 'closing',
      label: '结尾',
      prompt: '礼貌收尾，可写署名。',
      scaffold: 'Thank you for your help.\nBest regards,\n…',
      words: ['thanks'],
      needs: [],
      hint: '语气适合收件对象，不需要套固定结尾。'
    }
  ],
  discussion: [
    {
      id: 'position',
      label: '看法',
      prompt: '回应教授提问，写清你的看法。',
      scaffold: 'In my view, …',
      words: ['view', 'because'],
      needs: [],
      hint: '选一个重点，用自己的话表达。'
    },
    {
      id: 'response',
      label: '回应',
      prompt: '回应一位同学的观点，补充或说明不同看法。',
      scaffold: 'I agree with …, but …',
      words: ['however', 'also'],
      needs: [],
      hint: '说明你对同学观点的补充，不必复述原句。'
    },
    {
      id: 'support',
      label: '展开',
      prompt: '给一个理由和具体例子，说明它怎样支持你的看法。',
      scaffold: 'For example, … This would …',
      words: ['reason', 'example'],
      needs: [],
      hint: '让例子与前面的判断相连。'
    }
  ],
  argument: [
    {
      id: 'position',
      label: '立场',
      prompt: '回应提问，写清你的立场。',
      scaffold: 'In my view, …',
      words: ['view', 'because'],
      needs: [],
      hint: '回应题目，不必套固定句型。'
    },
    {
      id: 'support',
      label: '论据',
      prompt: '展开一个主要理由，给一个相关例子。',
      scaffold: 'One reason is … For example, …',
      words: ['reason', 'example'],
      needs: [],
      hint: '解释例子怎样支持理由。'
    },
    {
      id: 'balance',
      label: '另一面',
      prompt: '回应另一种观点或展开第二个重点。',
      scaffold: 'However, … This means …',
      words: ['however', 'also'],
      needs: [],
      hint: '回到本题的讨论、比较或解决问题要求。'
    },
    {
      id: 'conclusion',
      label: '结论',
      prompt: '概括判断，回应题目。',
      scaffold: 'Overall, …',
      words: ['overall', 'therefore'],
      needs: [],
      hint: '结论与前面的理由保持一致。'
    }
  ],
  explanation: [
    {
      id: 'topic',
      label: '主题',
      prompt: '学校准备回收旧纸。用一句话介绍这件事。',
      scaffold: 'Our school is going to recycle …',
      words: ['recycle', 'paper', 'school'],
      needs: [/\brecycl\w*\b/i, /\bpaper\b/i],
      hint: '先说明要做什么。'
    },
    {
      id: 'reason',
      label: '原因',
      prompt: '回收能减少垃圾。写一句说明原因。',
      scaffold: 'This can reduce …',
      words: ['reduce', 'waste', 'because'],
      needs: [/\b(?:reduce|waste)\b/i],
      hint: '用一个原因就够了。'
    },
    {
      id: 'steps',
      label: '步骤',
      prompt: '先收集旧纸，再放进回收箱。写清这两个步骤。',
      scaffold: 'First, … Then, …',
      words: ['first', 'collect', 'then', 'box'],
      needs: [/\b(?:first|then|next)\b/i, /\b(?:box|bin)\b/i],
      hint: '按先后顺序写。'
    },
    {
      id: 'action',
      label: '建议',
      prompt: '邀请同学带旧纸来。给读者一个具体建议。',
      scaffold: 'Please bring …',
      words: ['please', 'bring', 'paper'],
      needs: [/\b(?:please|can|should)\b/i, /\b(?:bring|recycl\w*|paper)\b/i],
      hint: '让读者知道下一步做什么。'
    }
  ],
  narrative: [
    {
      id: 'scene',
      label: '起因',
      prompt: '放学时下雨，同学没有带伞。写一句交代这件事。',
      scaffold: '放学时，……',
      words: ['雨点', '同学', '伞'],
      needs: [/雨/u, /伞/u],
      hint: '先让读者知道发生了什么。'
    },
    {
      id: 'action',
      label: '动作',
      prompt: '你把伞借给同学。写一个具体动作。',
      scaffold: '我……，把伞……',
      words: ['递给', '撑开', '握住'],
      needs: [/伞/u],
      hint: '选一个动作，写清谁做了什么。'
    },
    {
      id: 'response',
      label: '回应',
      prompt: '同学接过伞。写他的神态、动作或一句话。',
      scaffold: '他……，说：“……”',
      words: ['接过', '抬头', '道谢'],
      needs: [],
      hint: '补一个能看见或听见的细节。'
    },
    {
      id: 'reflection',
      label: '感受',
      prompt: '写一句你当时的感受。',
      scaffold: '那一刻，我……',
      words: ['安心', '温暖', '回头'],
      needs: [],
      hint: '用自己的话，不必写大道理。'
    }
  ]
});
export const WRITING_WORD_MEANINGS = Object.freeze({
  依据: '说明你用材料中的哪项信息支持判断',
  范围: '说明观察涉及哪些人、时段或条件',
  条件: '说明什么情况下你的建议适用',
  不过: '引出需要考虑的不同意见或限制',
  因此: '连接依据与判断，还要解释两者的关系',
  request: '请求；说明希望对方做什么',
  confirm: '确认',
  thanks: '感谢',
  view: '看法；in my view 表示在我看来',
  reason: '理由',
  example: '例子；for example 表示例如',
  however: '然而，连接转折的看法',
  also: '也；还',
  overall: '总体而言',
  therefore: '因此，连接理由与结果',
  school: '学校',
  hold: '举行',
  science: '科学',
  club: '社团',
  start: '开始',
  Monday: '周一',
  at: '具体时刻前用 at',
  on: '星期前用 on',
  place: '地点；take place 表示举行',
  library: '图书馆',
  in: '在……里面',
  please: '请',
  bring: '带来',
  notebook: '笔记本',
  recycle: '回收利用',
  paper: '纸',
  reduce: '减少',
  waste: '浪费；废弃物',
  because: '因为',
  first: '首先',
  collect: '收集',
  then: '然后',
  box: '箱子',
  reading: '阅读',
  art: '美术',
  pencils: '铅笔',
  sports: '运动',
  water: '水',
  history: '历史',
  tour: '参观',
  Friday: '周五',
  Tuesday: '周二',
  Wednesday: '周三',
  Thursday: '周四',
  classroom: '教室',
  room: '房间',
  playground: '操场',
  museum: '博物馆',
  card: '卡片；student card 表示学生证',
  save: '节约；保存',
  avoid: '避免',
  tap: '水龙头',
  turn: '转动；turn off 表示关掉',
  exchange: '交换',
  books: '书籍',
  share: '分享',
  title: '书名；标题',
  walk: '步行',
  park: '公园',
  exercise: '锻炼',
  route: '路线',
  friend: '朋友',
  雨点: '可以写雨点落在哪里',
  同学: '让读者知道谁遇到了困难',
  伞: '可以写伞的样子或动作',
  递给: '写清谁伸出手、把东西交给谁',
  撑开: '可以写打开伞时的动作',
  握住: '可以写手握住什么',
  接过: '写清从谁手里拿过什么',
  抬头: '可以写目光看向哪里',
  道谢: '可以写一句实际说的话',
  安心: '可以写让你放心的具体变化',
  温暖: '可以写当时的感受',
  回头: '可以补一个离开前的动作',
  书架: '可以交代书放在哪里',
  寻找: '可以写先找哪里、再找哪里',
  翻开: '可以写打开书或查看物品的动作',
  发现: '可以写看到了什么变化',
  松了口气: '可以写找回物品后的反应',
  终点: '让读者知道运动发生在哪里',
  停下: '可以写原本在做什么、何时停止',
  扶起: '写清如何帮助对方站起',
  一起: '可以写两个人共同做了什么',
  新叶: '可以写叶子的颜色或形状',
  浇水: '可以写照顾植物的一个动作',
  等待: '可以写每天观察到的变化',
  发黄: '可以交代植物起初的样子'
});
const NOTICE_ENGLISH = {
  'reading-club': {
    topic: ['reading', 'club'],
    day: 'Friday',
    hour: '(?:3|three)',
    place: ['classroom'],
    action: ['bring', 'notebook']
  },
  'art-circle': {
    topic: ['art', 'club'],
    day: 'Tuesday',
    hour: '(?:2|two)',
    place: ['art', 'room'],
    action: ['bring', 'pencils']
  },
  'sports-meet': {
    topic: ['sports'],
    day: 'Wednesday',
    hour: '(?:5|five)',
    place: ['playground'],
    action: ['bring', 'water']
  },
  'history-tour': {
    topic: ['history', 'tour'],
    day: 'Thursday',
    hour: '(?:10|ten)',
    place: ['museum'],
    action: ['bring', 'card']
  }
};
const EXPLANATION_WORDS = {
  paper: [
    ['recycle', 'paper'],
    ['reduce', 'waste'],
    ['first', 'collect', 'then', 'box'],
    ['please', 'bring', 'paper']
  ],
  water: [
    ['save', 'water'],
    ['avoid', 'waste'],
    ['first', 'then', 'tap', 'turn'],
    ['please', 'save', 'water']
  ],
  books: [
    ['exchange', 'books'],
    ['share', 'books'],
    ['first', 'title', 'then', 'exchange'],
    ['please', 'bring', 'books']
  ],
  walking: [['walk', 'park'], ['exercise'], ['first', 'route', 'then', 'friend'], ['please', 'walk', 'friend']]
};
const NARRATIVE_WORDS = {
  umbrella: [
    ['雨点', '同学', '伞'],
    ['递给', '撑开', '握住'],
    ['接过', '抬头', '道谢'],
    ['安心', '温暖', '回头']
  ],
  book: [
    ['同学', '书架'],
    ['寻找', '翻开'],
    ['发现', '书架'],
    ['松了口气', '安心']
  ],
  race: [
    ['同学', '终点'],
    ['停下', '扶起'],
    ['一起', '终点'],
    ['温暖', '回头']
  ],
  plant: [
    ['发黄', '新叶'],
    ['浇水', '等待'],
    ['发现', '新叶'],
    ['安心', '等待']
  ]
};
export function writingStepsForQuestion(question) {
  const exercise = question?.writingExercise;
  requireNotice(exercise, '请先开始当前写作');
  const genreId = writingGenre(question);
  const canonical = createWritingQuestion(
    question.id,
    exercise.conversationId,
    genreId,
    exercise.taskId,
    question.parentQuestionKey || null,
    exercise.dueDay,
    exercise.dueDay ? { day: exercise.plannedDay, timezone: exercise.plannedTimezone } : null
  );
  requireNotice(
    exact(exercise, canonical.writingExercise) &&
      exact(question.source, canonical.source) &&
      question.prompt === canonical.prompt,
    '当前写作情境已变化'
  );
  if (genreId === 'notice') {
    const task = noticeTask(exercise.taskId),
      en = NOTICE_ENGLISH[exercise.taskId];
    return [
      {
        id: 'purpose',
        label: '活动',
        prompt: `${task.event}。写一句说明活动。`,
        scaffold: 'Our school will hold a …',
        words: en.topic,
        needs: en.topic.map((word) => new RegExp(`\\b${word}\\b`, 'i')),
        hint: '先交代活动。'
      },
      {
        id: 'time',
        label: '时间',
        prompt: `${task.time}。只写时间这一句。`,
        scaffold: 'It will start at … on …',
        words: [en.day, 'at', 'on'],
        needs: [new RegExp(`\\b${en.day}\\b`, 'i'), new RegExp(`\\b${en.hour}\\b`, 'i')],
        hint: '时刻前用 at，星期前用 on。'
      },
      {
        id: 'place',
        label: '地点',
        prompt: `地点在${task.place}。写一句地点说明。`,
        scaffold: 'It will take place in …',
        words: en.place,
        needs: en.place.map((word) => new RegExp(`\\b${word}\\b`, 'i')),
        hint: '让读者知道去哪里。'
      },
      {
        id: 'action',
        label: '行动',
        prompt: `请同学${task.action}。写一句参加要求。`,
        scaffold: 'Please bring …',
        words: en.action,
        needs: en.action.map((word) => new RegExp(`\\b${word}\\b`, 'i')),
        hint: '写一个具体行动。'
      }
    ];
  }
  if (genreId === 'material_argument') {
    const task = CHINESE_MATERIAL_ARGUMENT_TASKS.find((item) => item.id === exercise.taskId);
    return GUIDED_WRITING_STEPS.material_argument.map((step) => ({
      ...step,
      words: [...step.words],
      needs: [],
      prompt: `${task.topic} · ${step.id === 'position' ? task.focus : step.prompt}`
    }));
  }
  if (genreId === 'email') {
    const task = EMAIL_WRITING_TASKS.find((item) => item.id === exercise.taskId);
    return GUIDED_WRITING_STEPS.email.map((step, index) => ({
      ...step,
      words: [...step.words],
      needs: [],
      prompt: `${task.topic} · ${index === 0 ? `收件对象：${task.recipient}；${task.situation}` : index === 1 ? task.targets[0] : index === 2 ? task.targets.slice(1).join(' ') : task.purpose} ${step.prompt}`
    }));
  }
  if (['argument', 'discussion'].includes(genreId)) {
    const task = (genreId === 'argument' ? ARGUMENT_WRITING_TASKS : DISCUSSION_WRITING_TASKS).find(
      (item) => item.id === exercise.taskId
    );
    return GUIDED_WRITING_STEPS[genreId].map((step) => ({
      ...step,
      words: [...step.words],
      needs: [],
      prompt:
        genreId === 'argument'
          ? `${task.topic} · ${task.focus} ${step.prompt}`
          : `${task.topic} · ${step.id === 'response' ? task.students.map((student) => `${student.name}: ${student.post}`).join('\n') : task.professor} ${step.prompt}`
    }));
  }
  const task = GUIDED_TASKS[genreId].find((item) => item[0] === exercise.taskId);
  const words = (genreId === 'narrative' ? NARRATIVE_WORDS : EXPLANATION_WORDS)[exercise.taskId];
  const instructions =
    genreId === 'narrative'
      ? ['写一句交代起因。', '写一个具体动作。', '补一个能看见或听见的细节。', '用自己的话写一句感受。']
      : ['用一句话介绍这件事。', '写一个原因。', '按先后顺序写这两个步骤。', '给读者一个具体建议。'];
  const scaffolds =
    genreId === 'narrative'
      ? ['当时，……', '我……，……', '后来，……', '那一刻，我……']
      : ['We are going to …', 'This can …', 'First, … Then, …', 'Please …'];
  return GUIDED_WRITING_STEPS[genreId].map((step, index) => ({
    ...step,
    label: genreId === 'narrative' ? ['起因', '经过', '结果', '感受'][index] : step.label,
    prompt: `${task[index + 1]}。${instructions[index]}`,
    scaffold: scaffolds[index],
    words: words[index],
    needs:
      genreId === 'narrative'
        ? []
        : [
            new RegExp(
              `\\b(?:${words[index].filter((word) => !['please', 'first', 'then'].includes(word)).join('|')})\\b`,
              'i'
            )
          ]
  }));
}
export function guidedSentenceFeedback(genreId, stepId, raw, question = null) {
  const steps = question ? writingStepsForQuestion(question) : GUIDED_WRITING_STEPS[genreId];
  requireNotice(!question || writingGenre(question) === genreId, '当前写作体裁已变化');
  const step = steps?.find((item) => item.id === stepId);
  requireNotice(
    step && typeof raw === 'string' && raw.length <= writingDraftLimit(genreId),
    '请选择当前写作步骤并保持输入长度'
  );
  const text = raw.trim();
  if (genreId === 'material_argument') {
    if (!text) return { ready: false, message: '先写一段。', kind: 'empty' };
    if (/[<>]/.test(text)) return { ready: false, message: '请写普通文本。', kind: 'format' };
    if (!/[\u3400-\u9fff]/u.test(text)) return { ready: false, message: '用中文写这一段。', kind: 'language' };
    if (!/[。！？][”」』）)]?$/u.test(text)) return { ready: false, message: '补一个句末标点。', kind: 'punctuation' };
    return { ready: true, message: '草稿 · 表达待核对', kind: 'draft' };
  }
  if (!text) return { ready: false, message: '先写一句。', kind: 'empty' };
  if (/[<>]/.test(text)) return { ready: false, message: '请写普通文本。', kind: 'format' };
  if (genreId === 'email')
    return /[A-Za-z]/.test(text)
      ? { ready: true, message: '草稿 · 表达待核对', kind: 'draft' }
      : { ready: false, message: '用英文写这封邮件。', kind: 'language' };
  if (genreId === 'narrative' && !/[\u3400-\u9fff]/u.test(text))
    return { ready: false, message: '用中文写这一句。', kind: 'language' };
  if (step.needs.some((pattern) => !pattern.test(text))) return { ready: false, message: step.prompt, kind: 'content' };
  if (genreId === 'notice' && /\bin\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday)\b/i.test(text))
    return { ready: false, message: '星期前用 on，时刻前用 at。', kind: 'preposition' };
  if (genreId !== 'narrative' && !/^[A-Z]/.test(text))
    return { ready: false, message: '句首字母改成大写。', kind: 'capital' };
  if (!(genreId === 'narrative' ? /[。！？][”」』）)]?$/u : /[.!?]$/).test(text))
    return { ready: false, message: '补一个句末标点。', kind: 'punctuation' };
  return { ready: true, message: '草稿 · 表达待核对', kind: 'draft' };
}
export function nextNoticeTask(state, conversationId) {
  const used = new Set(
    state.questions
      .filter((q) => q.writingExercise?.conversationId === conversationId)
      .map((q) => q.writingExercise.taskId)
  );
  const next = NOTICE_TASKS.find((task) => !used.has(task.id));
  requireNotice(next, '当前通知题型已练完', 'CAPABILITY_UNAVAILABLE');
  return next.id;
}
