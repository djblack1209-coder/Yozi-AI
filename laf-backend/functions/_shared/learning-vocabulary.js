import { dayKey } from './learning-date-time.js';
import { writingStepsForQuestion, nextNoticeDay } from './learning-writing.js';

export const VOCABULARY_CONTRACT = 'vocabulary-context-v1';
export const VOCABULARY_REVIEW_CONTRACT = 'vocabulary-review-v1';
export const VOCABULARY_SPACED_REVIEW_CONTRACT = 'vocabulary-review-v2';
export const VOCABULARY_USE_FEEDBACK_CONTRACT = 'vocabulary-use-feedback-v1';
// 例句、释义及干扰项为项目原创。链接只核对词义，不复制词典例句或导入词典语料。
const dictionary = (word) => `https://dictionary.cambridge.org/dictionary/english/${word}`;
const entries = [
  [
    'recycle-material',
    'recycle',
    '回收并加工再利用',
    ['把废物埋起来', '把物品借给别人', '重新排列座位'],
    ['Our town can recycle old bottles into new glass.', 'The factory will recycle used paper to make notebooks.']
  ],
  [
    'paper-material',
    'paper',
    '用于书写等用途的纸张',
    ['一篇研究文章', '一次考试', '一份报纸'],
    ['Fold this sheet of paper into a small boat.', 'We need some clean paper to draw our plan.']
  ],
  [
    'reduce-amount',
    'reduce',
    '使数量或程度减少',
    ['使数量增加', '保持数量不变', '把物品收集起来'],
    ['We can reduce water use by fixing the leaking tap.', 'Walking to school can reduce the number of car trips.']
  ],
  [
    'waste-unwanted',
    'waste',
    '不再需要的废弃物',
    ['浪费的动作', '值得保留的纪念品', '活动的时间安排'],
    ['Put the food waste in the green bin.', 'Workers remove waste from the recycling room every evening.']
  ],
  [
    'collect-gather',
    'collect',
    '把分散的东西收集到一起',
    ['把东西分发出去', '把东西扔掉', '向别人解释原因'],
    ['The class will collect empty bottles in one large box.', 'Please collect the scattered cards before we leave.']
  ],
  [
    'bring-toward',
    'bring',
    '把东西带到说话者或约定地点',
    ['把东西藏起来', '向别人借东西', '把东西留在原处'],
    [
      'I am at the school gate. Please bring my bag here.',
      'We will be in the library. Bring your old books to our table.'
    ]
  ],
  [
    'save-resource',
    'save',
    '节约资源，避免不必要的消耗',
    ['把文件存入电脑', '从危险中救出', '给物品排序'],
    [
      'Close the tap while you brush your teeth to save water.',
      'Turn off the empty classroom lights to save electricity.'
    ]
  ],
  [
    'exchange-swap',
    'exchange',
    '用自己的东西换取别人的东西',
    ['免费送出而不换回', '向别人借用后归还', '把东西放回原处'],
    [
      'At the club, I exchange my old storybook for Lin’s puzzle book.',
      'The two children exchange their cards, so each gets a different one.'
    ]
  ],
  // 同词不同义保持独立；当前写作词卡只绑定上面明确适用的义项。
  [
    'save-file',
    'save',
    '把文件内容保存到存储设备',
    ['节约用水', '从危险中救出', '删除电脑里的内容'],
    ['Click the disk icon to save your new document.', 'Before closing the program, save the file to your computer.']
  ],
  [
    'waste-misuse',
    'waste',
    '不必要地消耗或使用',
    ['分类收集废物', '储存文件内容', '把物品交换给别人'],
    ['Do not waste water by leaving the tap running.', 'We waste paper when we print the same page many times.']
  ]
];
const senses = new Map(
  entries.map(([id, word, meaning, distractors, contexts], index) => [
    id,
    {
      id,
      word,
      meaning,
      distractors,
      contexts,
      offset: index % 4,
      version: 1,
      reference: dictionary(word)
    }
  ])
);
function requireVocabulary(ok, message, code = 'INVALID_INPUT') {
  if (!ok) throw Object.assign(new Error(message), { code });
}
function same(a, b) {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return a === b;
  return (
    Array.isArray(a) === Array.isArray(b) &&
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(b).every((key) => same(a[key], b[key]))
  );
}
function sense(id) {
  const value = senses.get(id);
  requireVocabulary(value, '这个词义尚未提供检验');
  return value;
}
export function writingVocabularySense(question, word) {
  if (!question?.writingExercise) return null;
  const steps = writingStepsForQuestion(question);
  if (!steps.some((step) => step.words.includes(word))) return null;
  return entries.slice(0, 8).find((item) => item[1] === word)?.[0] || null;
}
export function createVocabularyQuestion(id, conversationId, writingQuestionKey, senseId, contextId = 0) {
  const entry = sense(senseId);
  requireVocabulary(typeof id === 'string' && id.length > 0 && id.length <= 120, '认词标识不合法');
  requireVocabulary(
    typeof conversationId === 'string' &&
      conversationId &&
      typeof writingQuestionKey === 'string' &&
      writingQuestionKey,
    '认词需绑定当前写作'
  );
  requireVocabulary(
    Number.isInteger(contextId) && contextId >= 0 && contextId < entry.contexts.length,
    '认词语境不支持'
  );
  const labels = [entry.meaning, ...entry.distractors],
    offset = (entry.offset + contextId) % 4;
  const rotated = labels.slice(offset).concat(labels.slice(0, offset));
  return {
    id,
    version: 1,
    scope: 'generated',
    subject: '英语',
    knowledgePoint: `${entry.word} · ${senseId} · 语境${contextId + 1}`,
    prompt: `${entry.contexts[contextId]}\n这里的 ${entry.word} 是什么意思？`,
    answerType: 'choice',
    options: rotated.map((label, index) => `${'ABCD'[index]}. ${label}`),
    source: { kind: 'project_original', reference: VOCABULARY_CONTRACT },
    validation: {
      type: 'choice',
      answer: 'ABCD'[rotated.indexOf(entry.meaning)],
      authority: 'executable',
      evidenceId: VOCABULARY_CONTRACT
    },
    vocabularyExercise: {
      contract: VOCABULARY_CONTRACT,
      senseId,
      senseVersion: entry.version,
      contextId,
      conversationId,
      writingQuestionKey
    },
    parentQuestionKey: writingQuestionKey,
    publishable: false
  };
}
function canonical(question) {
  const e = question?.vocabularyExercise;
  requireVocabulary(e?.contract === VOCABULARY_CONTRACT, '认词版本不支持');
  const expected = createVocabularyQuestion(
    question.id,
    e.conversationId,
    e.writingQuestionKey,
    e.senseId,
    e.contextId
  );
  requireVocabulary(
    same(e, expected.vocabularyExercise) &&
      same(question.source, expected.source) &&
      same(question.options, expected.options) &&
      same(question.validation, expected.validation) &&
      question.prompt === expected.prompt &&
      question.knowledgePoint === expected.knowledgePoint &&
      question.subject === expected.subject &&
      question.parentQuestionKey === expected.parentQuestionKey &&
      question.scope === expected.scope &&
      question.version === 1 &&
      question.answerType === 'choice' &&
      !question.rubric &&
      !question.materialExercise &&
      !question.writingExercise &&
      !question.scienceExercise &&
      !question.vocabularyReview &&
      !question.prerequisite &&
      !question.uncertainties?.length &&
      !question.expectedAnswer,
    '认词条件或来源已变化'
  );
  return expected;
}
export function normalizeVocabularyQuestion(question, state) {
  canonical(question);
  const e = question.vocabularyExercise,
    entry = sense(e.senseId);
  const parent = state.questions.find((q) => `${q.id}@${q.version}` === e.writingQuestionKey);
  requireVocabulary(
    state.conversations.some((c) => c.id === e.conversationId) &&
      parent?.writingExercise?.conversationId === e.conversationId &&
      writingVocabularySense(parent, entry.word) === e.senseId,
    '认词与原写作不匹配',
    'FORBIDDEN'
  );
  return question;
}
export function gradeVocabularyAnswer(question, answer) {
  try {
    const q = canonical(question);
    const match =
      typeof answer === 'string' && /^(?:我(?:选|选择)|选择|答案[是为：:]?)?\s*([A-D])[。.]?$/i.exec(answer.trim());
    if (!match) return { status: 'pending', outcome: null, basis: 'ambiguous_answer' };
    return {
      status: 'reliable',
      outcome: match[1].toUpperCase() === q.validation.answer ? 'correct' : 'wrong',
      basis: VOCABULARY_CONTRACT,
      evaluator: 'deterministic-context-choice-v1',
      authority: 'executable'
    };
  } catch {
    return { status: 'pending', outcome: null, basis: 'no_independent_reference' };
  }
}
export function vocabularyFeedback(question, attempt) {
  canonical(question);
  const entry = sense(question.vocabularyExercise.senseId);
  const correct = gradeVocabularyAnswer(question, attempt.answer).outcome === 'correct';
  return {
    message: `${correct ? '本句选对' : '再看这句'}${attempt.hints.length ? ' · 有提示' : ''}。${entry.word}：${entry.meaning}。`,
    reference: entry.reference
  };
}
export function vocabularyKnowledgeLabel(question) {
  try {
    canonical(question);
    const entry = sense(question.vocabularyExercise.senseId);
    return `${entry.word} · ${entry.meaning} · 语境${question.vocabularyExercise.contextId + 1}`;
  } catch {
    return '词义语境待核对';
  }
}
// 只使用有原始明确提交事件的规范语境作答；更正、提示和重复语境不会补成独立证据。
export function vocabularyEvidence(state, senseId) {
  sense(senseId);
  const latest = new Map();
  const questions = new Map(
    state.questions.filter((q) => q.vocabularyExercise?.senseId === senseId).map((q) => [`${q.id}@${q.version}`, q])
  );
  const events = new Map(state.events.filter((e) => e.type === 'vocabulary.submit').map((e) => [e.id, e]));
  for (const attempt of state.attempts) {
    const q = questions.get(attempt.questionKey),
      event = events.get(attempt.id);
    if (
      !q ||
      !event ||
      event.data?.explicit !== true ||
      event.data?.questionKey !== attempt.questionKey ||
      event.data?.answer?.trim() !== attempt.answer ||
      event.data?.conversationId !== attempt.conversationId
    )
      continue;
    if (
      !Array.isArray(attempt.hints) ||
      !Array.isArray(attempt.corrections) ||
      attempt.at !== event.at ||
      attempt.kind !== 'variant'
    )
      continue;
    try {
      normalizeVocabularyQuestion(q, state);
    } catch {
      continue;
    }
    if (q.vocabularyExercise.conversationId !== attempt.conversationId) continue;
    const grade = gradeVocabularyAnswer(q, attempt.answer);
    latest.set(q.vocabularyExercise.contextId, {
      id: attempt.id,
      questionKey: attempt.questionKey,
      at: attempt.at,
      independentCorrect:
        grade.status === 'reliable' &&
        grade.outcome === 'correct' &&
        !attempt.hints?.length &&
        !attempt.corrections?.length,
      outcome: grade.outcome
    });
  }
  const evidence = [...latest.values()];
  return {
    senseId,
    contexts: evidence.length,
    independentCorrect: evidence.filter((e) => e.independentCorrect).length,
    needsPractice: evidence.some((e) => !e.independentCorrect),
    evidence
  };
}
export function nextVocabularyContext(state, senseId) {
  const entry = sense(senseId),
    evidence = vocabularyEvidence(state, senseId);
  const tested = new Set(
    evidence.evidence.map(
      (item) => state.questions.find((q) => `${q.id}@${q.version}` === item.questionKey).vocabularyExercise.contextId
    )
  );
  return entry.contexts.findIndex((_, index) => !tested.has(index)) >= 0
    ? entry.contexts.findIndex((_, index) => !tested.has(index))
    : (state.questions.find((q) => `${q.id}@${q.version}` === evidence.evidence.at(-1).questionKey).vocabularyExercise
        .contextId +
        1) %
        entry.contexts.length;
}
export function adaptiveWritingWords(state, question, words) {
  const cards = words.map((word, index) => {
    const senseId = writingVocabularySense(question, word),
      evidence = senseId && vocabularyEvidence(state, senseId);
    return {
      word,
      senseId,
      index,
      priority: evidence?.needsPractice ? 0 : evidence?.independentCorrect >= 2 ? 2 : 1,
      folded: !!evidence && !evidence.needsPractice && evidence.independentCorrect >= 2
    };
  });
  return cards.sort((a, b) => a.priority - b.priority || a.index - b.index);
}

// 新原句不改写已保存的v1语境；跨天选择仍只检验本句词义。
const reviewContexts = {
  'recycle-material': ['This plant can recycle broken glass into jars.', 'We recycle cardboard to make new boxes.'],
  'paper-material': ['Cut the paper into three strips for the model.', 'There is no paper left in the printer tray.'],
  'reduce-amount': [
    'Smaller portions can reduce the food left on plates.',
    'The new lamps reduce our electricity use.'
  ],
  'waste-unwanted': ['The truck takes garden waste to the compost centre.', 'Keep chemical waste out of the river.'],
  'collect-gather': ['Volunteers collect the fallen branches in a pile.', 'Collect the pencils from each table.'],
  'bring-toward': [
    'I am in the art room. Bring the brushes to me.',
    'We are meeting at the park. Bring your kite there.'
  ],
  'save-resource': ['Using both sides of a sheet can save paper.', 'A shorter shower can save water.'],
  'exchange-swap': ['We exchange our seats, and I sit where you sat.', 'I exchange my red marble for her blue one.'],
  'save-file': ['Save your notes before the battery runs out.', 'Use this menu to save the drawing on your tablet.'],
  'waste-misuse': ['Do not waste electricity by heating an empty room.', 'Unused tickets waste the money we paid.']
};
// 3/7天另用原创语境；v1正文、字段和旧日历事实保持。
const spacedReviewContexts = {
  'recycle-material': [
    'The mill will recycle worn cotton clothes into insulation.',
    'We recycle cracked plastic buckets into new garden pots.'
  ],
  'paper-material': ['Write each seed’s name on a strip of paper.', 'Cover the desk with paper before you paint.'],
  'reduce-amount': [
    'The clinic will reduce waiting time by adding a second desk.',
    'Better insulation can reduce the heat lost through the roof.'
  ],
  'waste-unwanted': [
    'The sorting centre separates metal from household waste.',
    'The laboratory keeps toxic waste in sealed containers.'
  ],
  'collect-gather': [
    'Each team will collect leaves from the playground in one bag.',
    'Collect all the borrowed rulers in the tray at the end of class.'
  ],
  'bring-toward': [
    'I am waiting beside the bus. Bring your suitcase to me here.',
    'We will be at the stadium entrance. Bring the tickets to us there.'
  ],
  'save-resource': [
    'The new watering system can save water during dry months.',
    'Share one printed handout to save paper.'
  ],
  'exchange-swap': [
    'I exchange my spare pencil for your ruler.',
    'At the market, we exchange a basket of apples for a jar of honey.'
  ],
  'save-file': [
    'Select Save to store the edited report on your laptop.',
    'Save the photo to your hard drive before closing the editor.'
  ],
  'waste-misuse': [
    'Waiting with the engine running will waste fuel.',
    'Booking rooms that nobody uses will waste money.'
  ]
};
export function vocabularyReviewDay(day, delayDays = 1) {
  requireVocabulary([1, 3, 7].includes(delayDays), '词义复测间隔不支持');
  let dueDay = day;
  for (let i = 0; i < delayDays; i++) dueDay = nextNoticeDay(dueDay);
  return dueDay;
}
function vocabularyDay(at, timezone) {
  requireVocabulary(typeof timezone === 'string' && timezone.length <= 80, '词义复测时区不合法');
  try {
    return dayKey(at, timezone);
  } catch {
    requireVocabulary(false, '词义复测时区不合法');
  }
}
export function createVocabularyReviewQuestion(
  id,
  origin,
  attemptId,
  phase,
  planning = null,
  contextId = 0,
  delayDays = 1
) {
  canonical(origin);
  requireVocabulary(['retest', 'usage'].includes(phase), '词语任务类型不支持');
  requireVocabulary([1, 3, 7].includes(delayDays) && (phase === 'retest' || delayDays === 1), '词义复测间隔不支持');
  requireVocabulary(typeof attemptId === 'string' && attemptId && attemptId.length <= 120, '词语任务需绑定原答');
  requireVocabulary(Number.isInteger(contextId) && contextId >= 0 && contextId < 2, '词义复测语境不支持');
  const spaced = delayDays !== 1;
  requireVocabulary(!spaced || contextId === (delayDays === 3 ? 0 : 1), '跨周词义语境不匹配');
  const contract = spaced ? VOCABULARY_SPACED_REVIEW_CONTRACT : VOCABULARY_REVIEW_CONTRACT;
  const e = origin.vocabularyExercise,
    entry = sense(e.senseId);
  const q = createVocabularyQuestion(id, e.conversationId, e.writingQuestionKey, e.senseId, contextId);
  delete q.vocabularyExercise;
  q.parentQuestionKey = `${origin.id}@${origin.version}`;
  q.source.reference = contract;
  q.knowledgePoint = `${entry.word} · ${entry.meaning} · ${phase === 'retest' ? (spaced ? `${delayDays}天词义` : '隔天词义') : '自由写句'}`;
  q.vocabularyReview = {
    contract,
    phase,
    senseId: e.senseId,
    senseVersion: entry.version,
    contextId,
    conversationId: e.conversationId,
    writingQuestionKey: e.writingQuestionKey,
    originQuestionKey: q.parentQuestionKey,
    originAttemptId: attemptId,
    plannedDay: planning?.day ?? null,
    plannedTimezone: planning?.timezone ?? null,
    dueDay: planning ? vocabularyReviewDay(planning.day, delayDays) : null
  };
  if (spaced) q.vocabularyReview.delayDays = delayDays;
  if (phase === 'retest') {
    requireVocabulary(planning && /^\d{4}-\d{2}-\d{2}$/.test(planning.day), '词义复测需要安排日期');
    q.prompt = `${(spaced ? spacedReviewContexts : reviewContexts)[e.senseId][contextId]}\n这里的 ${entry.word} 是什么意思？`;
    q.validation.evidenceId = contract;
  } else {
    requireVocabulary(!planning && contextId === 0, '自由写句不接受复测日期');
    q.prompt = `用 ${entry.word} 自己写一句英文，表达“${entry.meaning}”。写一个不同于原句的情境。`;
    q.answerType = 'subjective';
    q.options = [];
    q.validation = null;
  }
  return q;
}
function reviewCanonical(question, origin) {
  const e = question?.vocabularyReview;
  requireVocabulary(
    [VOCABULARY_REVIEW_CONTRACT, VOCABULARY_SPACED_REVIEW_CONTRACT].includes(e?.contract),
    '词语任务版本不支持'
  );
  const spaced = e.contract === VOCABULARY_SPACED_REVIEW_CONTRACT;
  requireVocabulary(!spaced || (e.phase === 'retest' && [3, 7].includes(e.delayDays)), '跨周词义间隔不支持');
  const expected = createVocabularyReviewQuestion(
    question.id,
    origin,
    e.originAttemptId,
    e.phase,
    e.phase === 'retest' ? { day: e.plannedDay, timezone: e.plannedTimezone } : null,
    e.contextId,
    spaced ? e.delayDays : 1
  );
  requireVocabulary(
    same(e, expected.vocabularyReview) &&
      same(question.source, expected.source) &&
      same(question.options, expected.options) &&
      question.prompt === expected.prompt &&
      question.knowledgePoint === expected.knowledgePoint &&
      question.parentQuestionKey === expected.parentQuestionKey &&
      question.subject === expected.subject &&
      question.scope === expected.scope &&
      question.version === 1 &&
      question.answerType === expected.answerType &&
      !question.rubric &&
      !question.vocabularyExercise &&
      !question.writingExercise &&
      !question.scienceExercise &&
      !question.materialExercise &&
      !question.prerequisite &&
      !question.uncertainties?.length &&
      question.expectedAnswer == null,
    '词语任务条件或来源已变化'
  );
  return expected;
}
export function normalizeVocabularyReviewQuestion(question, state, at) {
  const e = question?.vocabularyReview;
  const origin = state.questions.find((q) => `${q.id}@${q.version}` === e?.originQuestionKey);
  normalizeVocabularyQuestion(origin, state);
  const expected = reviewCanonical(question, origin);
  const attempt = state.attempts.find(
    (a) => a.id === e.originAttemptId && a.questionKey === e.originQuestionKey && a.conversationId === e.conversationId
  );
  const event = state.events.find((ev) => ev.id === e.originAttemptId && ev.type === 'vocabulary.submit');
  requireVocabulary(
    attempt &&
      event?.data.explicit === true &&
      event.data.questionKey === attempt.questionKey &&
      event.data.conversationId === attempt.conversationId &&
      event.data.answer?.trim() === attempt.answer &&
      event.at === attempt.at &&
      at >= attempt.at,
    '词语任务需要明确的原词义作答'
  );
  const session = state.conversations.find((c) => c.id === e.conversationId);
  requireVocabulary(session && !session.stopped, '当前任务已停止', 'STOPPED');
  requireVocabulary(session.activeQuestionKey === e.writingQuestionKey, '请回到原写作安排词语任务', 'CONTEXT_CHANGED');
  if (e.phase === 'retest')
    requireVocabulary(
      e.plannedTimezone === state.timezone && e.plannedDay === vocabularyDay(at, e.plannedTimezone),
      '词义复测需保留安排时的日期与时区'
    );
  requireVocabulary(
    !state.questions.some(
      (q) =>
        q.vocabularyReview?.originQuestionKey === e.originQuestionKey &&
        q.vocabularyReview.phase === e.phase &&
        q.vocabularyReview.dueDay === e.dueDay &&
        (q.vocabularyReview.delayDays ?? 1) === (e.delayDays ?? 1)
    ),
    '当前词语任务已存在',
    'CONFLICT'
  );
  question.validation = expected.validation;
  return question;
}
export function vocabularyRetestReady(question, at = Date.now()) {
  const e = question?.vocabularyReview;
  return !e || e.phase !== 'retest' || vocabularyDay(at, e.plannedTimezone) >= e.dueDay;
}
export function gradeVocabularyReviewAnswer(question, answer, state) {
  try {
    const origin = state.questions.find((q) => `${q.id}@${q.version}` === question.vocabularyReview?.originQuestionKey);
    normalizeVocabularyQuestion(origin, state);
    const expected = reviewCanonical(question, origin);
    if (expected.answerType !== 'choice')
      return { status: 'pending', outcome: null, basis: 'vocabulary_usage_needs_semantic_review' };
    const match =
      typeof answer === 'string' && /^(?:我(?:选|选择)|选择|答案[是为：:]?)?\s*([A-D])[。.]?$/i.exec(answer.trim());
    if (!match) return { status: 'pending', outcome: null, basis: 'ambiguous_answer' };
    return {
      status: 'reliable',
      outcome: match[1].toUpperCase() === expected.validation.answer ? 'correct' : 'wrong',
      basis: expected.vocabularyReview.contract,
      evaluator:
        expected.vocabularyReview.contract === VOCABULARY_SPACED_REVIEW_CONTRACT
          ? 'deterministic-context-review-v2'
          : 'deterministic-context-review-v1',
      authority: 'executable'
    };
  } catch {
    return { status: 'pending', outcome: null, basis: 'no_independent_reference' };
  }
}

// 只为反馈派生维度，不给历史自由写句加量表或客观判分权限。
export function vocabularyUseFeedbackBasis(question, state) {
  const e = question?.vocabularyReview;
  requireVocabulary(e?.phase === 'usage', '反馈需要当前自由写句任务');
  const origin = state.questions.find((q) => `${q.id}@${q.version}` === e.originQuestionKey);
  normalizeVocabularyQuestion(origin, state);
  reviewCanonical(question, origin);
  requireVocabulary(question.validation == null, '自由写句不能声明客观判分权限');
  const attempt = state.attempts.find(
      (a) =>
        a.id === e.originAttemptId && a.questionKey === e.originQuestionKey && a.conversationId === e.conversationId
    ),
    event = state.events.find((ev) => ev.id === e.originAttemptId && ev.type === 'vocabulary.submit');
  requireVocabulary(
    attempt &&
      event?.data.explicit === true &&
      event.data.questionKey === attempt.questionKey &&
      event.data.conversationId === attempt.conversationId &&
      event.data.answer?.trim() === attempt.answer &&
      event.at === attempt.at,
    '自由写句反馈需要原词义作答依据'
  );
  const entry = sense(e.senseId);
  return {
    contract: VOCABULARY_USE_FEEDBACK_CONTRACT,
    senseId: e.senseId,
    senseVersion: entry.version,
    word: entry.word,
    meaning: entry.meaning,
    conversationId: e.conversationId,
    writingQuestionKey: e.writingQuestionKey,
    originQuestionKey: e.originQuestionKey,
    originAttemptId: e.originAttemptId,
    originPrompt: origin.prompt,
    rubric: {
      id: `${VOCABULARY_USE_FEEDBACK_CONTRACT}:${e.senseId}:${entry.version}`,
      version: 1,
      source: { kind: 'project_original', reference: VOCABULARY_USE_FEEDBACK_CONTRACT },
      criteria: [
        {
          id: 'sense',
          name: '词义',
          maxScore: 2,
          description: `使用${entry.word}或合理词形表达“${entry.meaning}”。核对本句情境，不按包含词语推断正确；无法判断留空。`
        },
        {
          id: 'form',
          name: '词形与搭配',
          maxScore: 2,
          description: '根据完整原句核对词形和搭配；给分引用对应原文，无法判断留空。'
        },
        {
          id: 'context',
          name: '情境表达',
          maxScore: 2,
          description: '原句表达清楚，使用不同于原词义题的情境；只评阅这句话，不推断整词掌握或考试等级。'
        }
      ]
    }
  };
}
