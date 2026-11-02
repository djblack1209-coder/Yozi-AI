// Host-owned writing skill bindings. No model may supply graph IDs or mastery.
export const WRITING_KNOWLEDGE_CONTRACT = 'writing-knowledge-binding-v1';
export const WRITING_KNOWLEDGE_MAPPING = 'writing-knowledge-map-v1';
export const WRITING_KNOWLEDGE_GRAPH = 'yozi-writing-diagnosis-v0.1';
export const WRITING_KNOWLEDGE_SUBJECT = 'kaoyan-english-writing';
export const WRITING_KNOWLEDGE_SCOPE = 'adult-kaoyan-english-writing';
export const WRITING_KNOWLEDGE_NODE_IDS = Object.freeze([
  'task',
  'audience',
  'purpose',
  'genre',
  'sentence',
  'agreement',
  'tense',
  'articles',
  'clause',
  'collocation',
  'register',
  'paraphrase',
  'linking',
  'outline',
  'opening',
  'detail',
  'closing',
  'claim',
  'example',
  'coherence',
  'application',
  'essay',
  'translation',
  'revision-task',
  'revision-language',
  'timed-check'
]);
const list = (value) => (Array.isArray(value) ? value : []);
const distinct = (values) => [...new Set(values)];

// Versioned host mapping table. Exact labels only: never mine student quotes for keywords.
// Dimension anchors describe observations, not predictive mastery. 表达 has no
// equivalent generic seed node; only a named skill or task can locate it.
export const PROGRESS_NODE_RULES = Object.freeze(
  [
    { nodeId: 'sentence', dimension: '语法', labels: ['语法', '句子结构', '句子不完整', '构造完整句'] },
    { nodeId: 'agreement', dimension: '语法', labels: ['主谓一致', '主谓不一致'] },
    { nodeId: 'tense', dimension: '语法', labels: ['时态', '时态错误', '选择时间表达'] },
    { nodeId: 'articles', dimension: '语法', labels: ['冠词', '可数性', '冠词与可数性'] },
    { nodeId: 'clause', dimension: '语法', labels: ['从句结构', '连接主从句'] },
    { nodeId: 'collocation', dimension: '搭配', labels: ['搭配', '固定搭配', '介词搭配', '动词搭配', '使用固定搭配'] },
    { nodeId: 'register', dimension: '表达', labels: ['语域', '语气', '保持得体语域'] },
    { nodeId: 'paraphrase', dimension: '表达', labels: ['改写', '准确改写'] },
    { nodeId: 'linking', dimension: '表达', labels: ['逻辑衔接', '选择逻辑衔接'] },
    { nodeId: 'coherence', dimension: '表达', labels: ['段落连贯', '保持段落连贯'] },
    { nodeId: 'task', dimension: '任务完成', labels: ['任务完成', '任务覆盖', '提取任务要求'] },
    { nodeId: 'audience', dimension: '任务完成', labels: ['读者关系', '识别读者关系'] },
    { nodeId: 'purpose', dimension: '任务完成', labels: ['交际目的', '明确交际目的'] },
    { nodeId: 'genre', dimension: '任务完成', labels: ['体裁', '区分体裁要求'] },
    {
      nodeId: 'outline',
      dimension: '任务完成',
      labels: ['提纲', '组织写作提纲', '应用文审题'],
      kinds: ['writing_analysis']
    },
    { nodeId: 'translation', labels: ['中译英', '短句意义转写'], kinds: ['translation'] },
    { nodeId: 'sentence', labels: ['成分识别', '长难句拆分'], kinds: ['syntax', 'sentence_analysis'] },
    { nodeId: 'collocation', dimension: '搭配', labels: [], kinds: ['collocation', 'cloze'] },
    { nodeId: 'opening', dimension: '任务完成', labels: ['开篇直达目的'] },
    { nodeId: 'detail', dimension: '任务完成', labels: ['展开任务细节'] },
    { nodeId: 'closing', dimension: '任务完成', labels: ['结尾推动回应'] },
    { nodeId: 'claim', dimension: '任务完成', labels: ['形成明确观点'] },
    { nodeId: 'example', dimension: '任务完成', labels: ['用例子支持观点'] },
    { nodeId: 'revision-task', dimension: '任务完成', labels: ['检查任务覆盖'] },
    { nodeId: 'revision-language', dimension: '语法', labels: ['检查语言错误'] },
    { nodeId: 'timed-check', dimension: '任务完成', labels: ['限时检查排序'] }
  ].map((rule) =>
    Object.freeze({ ...rule, labels: Object.freeze(rule.labels), kinds: Object.freeze(rule.kinds || []) })
  )
);

export function progressNodeIds({ dimension, labels = [], kind = '', nodeIds = [] } = {}) {
  const valid = new Set(WRITING_KNOWLEDGE_NODE_IDS);
  const mapped = PROGRESS_NODE_RULES.filter(
    (rule) =>
      (!rule.dimension || !dimension || rule.dimension === dimension) &&
      (rule.labels.some((label) => labels.includes(label)) || rule.kinds.includes(kind))
  ).map((rule) => rule.nodeId);
  return distinct([...nodeIds, ...mapped].filter((id) => valid.has(id)));
}

// Current final feedback only. A legacy error label must share this dimension's
// quotation; a saved error array is authoritative, including an empty array.
export function writingNodeObservations(feedback, cards = []) {
  const observations = [];
  for (const dimension of list(feedback.dimensions)) {
    if (!['语法', '搭配', '表达', '任务完成'].includes(dimension.name) || ![0, 1, 2].includes(dimension.score))
      continue;
    const evidence = list(dimension.evidence).filter((quote) => typeof quote === 'string' && quote.trim());
    if (!evidence.length) continue;
    const labels = Array.isArray(feedback.errors)
      ? feedback.errors.filter((error) => error.dimension === dimension.name).map((error) => error.label)
      : list(feedback.weaknessEvidence)
          .filter((item) => item.classification === 'error' && dimension.score < 2 && evidence.includes(item.quote))
          .map((item) => item.label);
    const ids = progressNodeIds({ dimension: dimension.name, labels: [dimension.name, ...labels] });
    if (cards.length === 1)
      ids.push(...progressNodeIds({ dimension: dimension.name, kind: cards[0].kind, labels: [cards[0].title] }));
    for (const nodeId of distinct(ids))
      observations.push({ nodeId, dimension: dimension.name, score: dimension.score, weakness: dimension.score < 2 });
  }
  return observations;
}

// No originals in the binding receipt. The existing answer/request/result IDs
// lead back to the saved original; rubric level 2 is not predictive mastery.
export function writingKnowledgeBinding(feedback, assessment) {
  const kind = {
    translate_en: 'translation',
    translate_zh: 'translation',
    syntax_analysis: 'sentence_analysis',
    cloze: 'cloze',
    writing_analysis: 'writing_analysis'
  }[assessment?.kind];
  const cards = kind ? [{ kind }] : [];
  return {
    contract: WRITING_KNOWLEDGE_CONTRACT,
    graphVersion: WRITING_KNOWLEDGE_GRAPH,
    mappingVersion: WRITING_KNOWLEDGE_MAPPING,
    subject: WRITING_KNOWLEDGE_SUBJECT,
    scope: WRITING_KNOWLEDGE_SCOPE,
    curriculumStatus: 'pending_verification',
    rubricVersion: 'writing-dimensions-v1',
    observations: writingNodeObservations(feedback, cards)
  };
}
