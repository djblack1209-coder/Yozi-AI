// Original Yozi validation material, authored for batch 15. Not a public exam bank.
// No cn-math-taxonomy code, labels, edges, questions or data are included.
import { WRITING_KNOWLEDGE_GRAPH } from '../../../laf-backend/functions/_shared/learning-writing-knowledge.js';
const subject = 'kaoyan-english-writing';

function rubric(prompt, criterion) {
  return {
    prompt,
    kind: 'rubric',
    rubric: [
      { level: 0, label: '未表现', criteria: ['已有可评价作答，但未表现关键能力，或核心意思与题意矛盾'] },
      { level: 1, label: '部分表现', criteria: ['已表现部分关键能力，但仍有缺项、错误或借助了提示'] },
      { level: 2, label: '独立完成', criteria: [criterion, '未借助提示或示范答案完成'] }
    ]
  };
}

function skill(id, name, type, chapter, prompt, criterion, loweredPrompt, loweredCriterion) {
  return {
    id,
    subject,
    name,
    type,
    chapter,
    masteryCriteria: [criterion],
    diagnostic: { ...rubric(prompt, criterion), lowered: rubric(loweredPrompt, loweredCriterion) }
  };
}

function choice(id, name, chapter, prompt, options, answerIndex, criterion, lowered) {
  return {
    id,
    subject,
    name,
    type: 'procedural',
    chapter,
    masteryCriteria: [criterion],
    diagnostic: { prompt, kind: 'choice', options, answerIndex, lowered: { kind: 'choice', ...lowered } }
  };
}

const topics = [
  skill(
    'task',
    '提取任务要求',
    'conceptual',
    '审题',
    '社团请你给新成员写一封欢迎信，介绍两项活动并邀请周五参加见面会。列出必须完成的写作任务。',
    '列出欢迎、两项活动介绍、周五见面会邀请三个任务，不添加未给出的事实',
    '写信邀请同学周五参加读书会。这封信必须完成什么任务？',
    '指出邀请同学周五参加读书会'
  ),
  skill(
    'audience',
    '识别读者关系',
    'conceptual',
    '审题',
    '你向未见过面的学院负责人建议延长阅览室开放时间。说明读者关系及两项语气选择。',
    '识别正式且不熟悉的读者关系，选择礼貌请求与客观理由',
    '给第一次联系的老师写信，称呼与请求应采用什么语气？',
    '识别正式礼貌语气'
  ),
  skill(
    'purpose',
    '明确交际目的',
    'reasoning',
    '审题',
    '你报名做活动志愿者，但因考试冲突无法参加。用一句话说明写信主要目的，并区分原因与目的。',
    '把致歉并告知无法参加作为目的，把考试冲突作为原因',
    '你要为错过会议向同学道歉。信的主要目的是什么？',
    '明确表达道歉目的'
  ),
  skill(
    'genre',
    '区分体裁要求',
    'conceptual',
    '审题',
    '对比给老师的建议信与面向全校的活动通知，各列出两项必要的体裁要素。',
    '信件含称呼与落款，通知含活动信息与面向受众的发布结构',
    '给老师写信时，正文前后通常分别需要哪一项要素？',
    '指出称呼与落款'
  ),
  skill(
    'sentence',
    '构造完整句',
    'procedural',
    '语法',
    '将“学生／需要／安静的学习空间”写成一个完整英语句子，标出主语与谓语。',
    '用完整主谓结构表达学生需要安静学习空间，正确标出主语与谓语',
    '用 students 和 study 写一个完整的陈述句。',
    '句子有匹配的主语与谓语，意思完整'
  ),
  choice(
    'agreement',
    '主谓一致',
    '语法',
    '选择正确形式：The list of activities ___ on the noticeboard.',
    ['are', 'is', 'be'],
    1,
    '能依据中心主语而非邻近名词判断谓语单复数',
    { prompt: '选择正确形式：The student ___ ready.', options: ['is', 'are', 'be'], answerIndex: 0 }
  ),
  choice(
    'tense',
    '选择时间表达',
    '语法',
    '活动已于昨天结束：Our club ___ a workshop yesterday.',
    ['holds', 'holding', 'held'],
    2,
    '能使谓语时态与明确时间线索一致',
    { prompt: '选择表示昨天完成的动作：I ___ him yesterday.', options: ['meet', 'met', 'meeting'], answerIndex: 1 }
  ),
  choice(
    'articles',
    '冠词与可数性',
    '语法',
    '选择正确表达：Could you give me ___ about the application?',
    ['an advice', 'some advice', 'many advices'],
    1,
    '能把 advice 作为不可数名词使用',
    { prompt: '选择正确表达：I have ___ question.', options: ['a', 'an', 'many'], answerIndex: 0 }
  ),
  skill(
    'clause',
    '连接主从句',
    'procedural',
    '句式',
    '把“图书馆很小”和“它为学生提供了安静的空间”合成一个让步复合句。',
    '用让步连接词连接两个完整分句，保持原意且不重复使用冲突连词',
    '用 because 连接“I stayed at home”和“It rained”。',
    '因果从句完整且意思一致'
  ),
  choice(
    'collocation',
    '使用固定搭配',
    '表达',
    '选择自然搭配：The workshop will help us ___ progress in writing.',
    ['do', 'take', 'make'],
    2,
    '能使用 make progress 表达取得进步',
    { prompt: '选择自然搭配：Please ___ attention to the deadline.', options: ['pay', 'make', 'do'], answerIndex: 0 }
  ),
  skill(
    'register',
    '保持得体语域',
    'application',
    '表达',
    '向学院负责人请求增设阅读座位，写一句礼貌且不命令对方的请求。',
    '准确提出增设座位请求，以正式礼貌表达避免命令和过度口语化',
    '用 Could you 开头，礼貌请求老师查看你的申请。',
    '完整礼貌地请求查看申请'
  ),
  skill(
    'paraphrase',
    '准确改写',
    'procedural',
    '表达',
    '用不同表达改写“Regular practice helps students write more clearly”，不新增结论。',
    '保留持续练习改善表达清晰度的含义，改变措辞或结构且语法通顺',
    '用 important 替换“This task matters”中的表达，保持意思。',
    '写出语法完整且意思相近的句子'
  ),
  skill(
    'linking',
    '选择逻辑衔接',
    'reasoning',
    '结构',
    '前句说线上学习很灵活，后句说它要求较强自律。补一句英语衔接并说明逻辑关系。',
    '选择转折或让步衔接，准确说明优势与要求之间的关系',
    '前句“他很忙”，后句“他仍来帮忙”，应使用顺承还是转折？说明理由。',
    '识别并解释转折关系'
  ),
  skill(
    'outline',
    '组织写作提纲',
    'procedural',
    '结构',
    '为“邀请外教参加英语读书会”的邮件列三部分提纲，覆盖目的、活动信息、回复请求。',
    '提纲按目的、信息、回复组织且三部分均覆盖',
    '为邀请信列出开头、正文、结尾各要完成的一件事。',
    '依次包含邀请目的、活动细节、回应请求'
  ),
  skill(
    'opening',
    '开篇直达目的',
    'application',
    '结构',
    '为邀请外教参加周五读书会写一至两句英语开头，不编造地点。',
    '开头直接表达邀请对象、读书会和周五时间，不加入未提供的地点',
    '用 I am writing to 开头，写一句邀请老师参加读书会的句子。',
    '句子完整且直接表达邀请目的'
  ),
  skill(
    'detail',
    '展开任务细节',
    'application',
    '结构',
    '为欢迎信补写两句英语：社团每周讨论一本书，每月进行一次写作互评。',
    '两个活动事实均准确表达，未把频率混淆或新增保证',
    '用英语说明社团每周讨论一本书。',
    '准确表达读书讨论及每周频率'
  ),
  skill(
    'closing',
    '结尾推动回应',
    'application',
    '结构',
    '邀请信结尾需要对方在周三前告知能否参加。写一至两句英语结尾。',
    '礼貌提出确认参加与周三期限，结尾与邀请目的相符',
    '写一句英语，请对方告知能否参加。',
    '礼貌请求确认能否参加'
  ),
  skill(
    'claim',
    '形成明确观点',
    'reasoning',
    '论证',
    '围绕“大学生是否应参加志愿活动”，写一句有限定、可展开的英语观点。',
    '观点立场清晰并有限定条件或可展开理由，不用无依据的绝对断言',
    '用一句中文明确你对大学生参加志愿活动的立场。',
    '立场明确且与题目相关'
  ),
  skill(
    'example',
    '用例子支持观点',
    'reasoning',
    '论证',
    '观点：志愿服务有助于学生提升沟通能力。写两句英语，以合成场景举例并说明联系。',
    '例子涉及实际沟通行为，并解释该行为如何支持观点，合成场景不冒充真实研究',
    '为“读书会能促进交流”提出一个相关场景，并说明联系。',
    '举出交流行为并说明它与观点的联系'
  ),
  skill(
    'coherence',
    '保持段落连贯',
    'reasoning',
    '结构',
    '给“观点：应规律练笔；例子：每日改写一句；解释：持续练习发现反复错误”排序，并用英语连接。',
    '按观点、例子、解释组织，指代与衔接清楚，解释未偏离观点',
    '把“提出观点、用例子支持、解释例子”排成合理的段落顺序。',
    '先观点，再例子，后解释'
  ),
  skill(
    'application',
    '整合应用文',
    'application',
    '带写',
    '给老师写一封简短信：邀请周五参加英语读书会，活动为讨论短篇文章，请周三前回复。不编造地点。',
    '称呼落款完整，邀请、活动、时间、回复均准确，语气得体且段落有序',
    '写两句英语邀请老师周五参加读书会并请求回复。',
    '准确表达邀请、时间与回复请求'
  ),
  skill(
    'essay',
    '整合议论段',
    'application',
    '带写',
    '以“规律练笔有助于清晰表达”为观点写一个英语论证段，含合成例子及其解释。',
    '观点、相关例子与解释齐全且连贯，不把合成例子写成真实统计',
    '写两句英语：先提出规律练笔的益处，再给出一个相关例子。',
    '观点与例子均出现且相互支持'
  ),
  skill(
    'translation',
    '短句意义转写',
    'procedural',
    '句式',
    '译成英语：“如果我们定期复习常用搭配，就能在写作中更准确地表达想法。”',
    '完整保留条件、定期复习搭配与准确表达三个意义，句子结构完整',
    '译成英语：“我们每天复习常用搭配。”',
    '保留主语、复习动作、搭配与每天频率'
  ),
  skill(
    'revision-task',
    '检查任务覆盖',
    'procedural',
    '检查',
    '要求邀请老师周五参加活动并请周三前回复；草稿只写了邀请与周五时间。指出缺项并补一句英语。',
    '指出周三前回复缺失，并准确补充该请求',
    '要求介绍两项活动，草稿只有一项。应检查什么？',
    '明确指出缺少第二项活动'
  ),
  skill(
    'revision-language',
    '检查语言错误',
    'procedural',
    '检查',
    '改正“The student have many advices yesterday”，并分别说明一致、名词及时间表达的问题。',
    '改为与过去时间、单数主语和不可数 advice 一致的表达，并解释三处问题',
    '改正“The student are ready”，并说明原因。',
    '将 are 改为 is，并指出主语为单数'
  ),
  skill(
    'timed-check',
    '限时检查排序',
    'modeling',
    '检查',
    '只剩两分钟，草稿漏了回复期限、有一处主谓错误、另有一个可替换的普通形容词。排序并说明理由。',
    '先补任务缺项，再修明显语法，最后才润色词语，并说明时间取舍',
    '只够改一处：漏写邀请时间与一个普通用词，先改哪项？为什么？',
    '先补邀请时间，因为它影响任务完成'
  )
];

const hard = (from, to) => ({ from, to, strength: 'hard', reason: '本验证任务依赖该先修能力' });
const soft = (from, to) => ({ from, to, strength: 'soft', reason: '可能有助于表现，仅提示，不据此回溯' });

export const knowledgeGraphSeed = {
  version: WRITING_KNOWLEDGE_GRAPH,
  subject,
  subjectLabel: '考研英语写作',
  topics,
  edges: [
    hard('task', 'purpose'),
    hard('audience', 'register'),
    hard('purpose', 'outline'),
    hard('genre', 'outline'),
    hard('sentence', 'agreement'),
    hard('sentence', 'tense'),
    hard('sentence', 'articles'),
    hard('sentence', 'clause'),
    hard('outline', 'opening'),
    hard('outline', 'detail'),
    hard('outline', 'closing'),
    hard('claim', 'example'),
    hard('linking', 'coherence'),
    hard('outline', 'coherence'),
    hard('opening', 'application'),
    hard('detail', 'application'),
    hard('closing', 'application'),
    hard('register', 'application'),
    hard('claim', 'essay'),
    hard('example', 'essay'),
    hard('coherence', 'essay'),
    hard('sentence', 'translation'),
    hard('collocation', 'translation'),
    hard('task', 'revision-task'),
    hard('agreement', 'revision-language'),
    hard('tense', 'revision-language'),
    hard('articles', 'revision-language'),
    hard('revision-task', 'timed-check'),
    hard('revision-language', 'timed-check'),
    soft('collocation', 'paraphrase'),
    soft('clause', 'paraphrase'),
    soft('paraphrase', 'essay'),
    soft('linking', 'application'),
    soft('collocation', 'detail'),
    soft('clause', 'essay'),
    soft('translation', 'application')
  ]
};
