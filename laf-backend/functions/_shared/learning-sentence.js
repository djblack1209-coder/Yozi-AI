import { dayKey } from './learning-date-time.js';
import { nextNoticeDay } from './learning-writing.js';

export const SENTENCE_CONTRACT = 'sentence-building-v1';
export const SENTENCE_BASIS = Object.freeze({
  publisher: 'ETS',
  title: 'TOEFL iBT · Build a Sentence',
  formatVersion: 'January 2026',
  verified: '2026-10-06',
  formatUrl: 'https://www.ets.org/toefl/test-takers/ibt/about/content.html?version=after-jan-2026',
  teachingUrl: 'https://www.ets.org/content/dam/ets-org/pdfs/toefl/toefl-ibt-lesson-plan-writing.pdf#page=4',
  scoringAuthority: false
});

function requireSentence(ok, message, code = 'INVALID_INPUT') {
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
const task = (id, label, context, prefix, pieces, extra, hint, suffix = '.', alternatives = []) =>
  Object.freeze({
    id,
    label,
    context,
    prefix,
    suffix,
    pieces: Object.freeze(pieces),
    extra,
    hint,
    alternatives: Object.freeze(alternatives.map((order) => Object.freeze(order)))
  });
// Yozi AI原创题目与审定组合；官方资料只说明任务形式，不提供本库答案或考试评分权限。
export const SENTENCE_TASKS = Object.freeze([
  task(
    'library-hours',
    '时间表达',
    'Do you know the library opening time?',
    'The library',
    ['opens', 'at eight', 'every morning'],
    'open',
    '先找主语后的谓语，再安排两个时间短语。',
    '.',
    [
      [0, 2, 1],
      [2, 0, 1]
    ]
  ),
  task(
    'meeting-room',
    '间接问句',
    'I cannot find the club meeting room.',
    'Could you tell me',
    ['where', 'the meeting room', 'is'],
    'do',
    'where引出的间接问句用陈述语序：主语在谓语之前。',
    '?'
  ),
  task(
    'camera-helper',
    '定语从句',
    'Who helped you with the equipment?',
    'The student',
    ['who', 'lent me', 'the camera', 'is', 'in our club'],
    'which',
    'who从句说明是哪位学生；从句和主句都要有谓语。',
    '.',
    [[0, 3, 4, 1, 2]]
  ),
  task(
    'delayed-bus',
    '原因从句',
    'Why did Maya walk to campus?',
    'Maya',
    ['walked to campus', 'because', 'the bus', 'was delayed'],
    'delay',
    'because后面需要完整的主语和谓语。'
  ),
  task(
    'closed-lab',
    '否定句',
    'Was the computer lab open on Sunday?',
    'The computer lab',
    ['was', 'not', 'open', 'on Sunday'],
    'were',
    '单数主语配was，not放在was之后。'
  ),
  task(
    'project-deadline',
    '间接问句',
    'What would you like to know about the project?',
    'I would like to know',
    ['when', 'our group', 'should submit', 'the report'],
    'does',
    'when后保持主语、情态动词、动词的顺序。'
  ),
  task(
    'club-plan',
    '不定式',
    'What did the club decide at the meeting?',
    'Our club',
    ['decided', 'to organise', 'a weekend', 'clean-up'],
    'organising',
    'decide后用to加动词原形，表示决定做什么。'
  ),
  task(
    'telescope-storage',
    '被动语态',
    'Where is the borrowed telescope kept?',
    'The telescope',
    ['is', 'stored', 'in', 'the science room'],
    'storing',
    '被存放用be加过去分词，再接地点。'
  ),
  task(
    'outdoor-activity',
    '条件从句',
    'Can we hold the activity outdoors?',
    'We can meet outdoors',
    ['if', 'the weather', 'stays', 'dry'],
    'staying',
    'if引出条件，后面的从句需要主语和谓语。'
  ),
  task(
    'notes-folder',
    '定语从句',
    'Which folder contains your notes?',
    'The folder',
    ['that', 'contains my notes', 'is', 'on the desk'],
    'contain',
    'that从句说明是哪一个文件夹，后面仍需主句谓语。'
  ),
  task(
    'faster-route',
    '比较结构',
    'Which route takes less time?',
    'The train',
    ['is', 'faster', 'than', 'the bus'],
    'fast',
    '比较两者时用比较级，再用than连接比较对象。'
  ),
  task(
    'read-report',
    '完成时问句',
    'Ask whether the tutor has read your report.',
    'Has',
    ['the tutor', 'read', 'your report', 'yet'],
    'reads',
    'Has已在句首，后面依次放主语、过去分词和宾语。',
    '?',
    [[0, 3, 1, 2]]
  )
]);
function sourceTask(id) {
  const value = SENTENCE_TASKS.find((item) => item.id === id);
  requireSentence(value, '句子任务不支持');
  return value;
}
function localDay(at, timezone) {
  requireSentence(typeof timezone === 'string' && timezone.length <= 80, '复测时区不合法');
  try {
    return dayKey(at, timezone);
  } catch {
    requireSentence(false, '复测时区不合法');
  }
}
function tiles(value) {
  const list = [...value.pieces, value.extra].map((text, index) => ({ id: `t${index + 1}`, text }));
  let seed = [...value.id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  for (let i = list.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
export function createSentenceQuestion(
  id,
  conversationId,
  taskId = SENTENCE_TASKS[0].id,
  parent = null,
  planning = null
) {
  requireSentence(
    typeof id === 'string' && id && id.length <= 120 && typeof conversationId === 'string' && conversationId,
    '句子任务需绑定当前学习'
  );
  const value = sourceTask(taskId);
  if (planning) {
    requireSentence(typeof planning.day === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(planning.day), '安排日期不合法');
    requireSentence(localDay(Date.parse(`${planning.day}T12:00:00Z`), 'UTC') === planning.day, '安排日期不合法');
    localDay(Date.now(), planning.timezone);
  }
  return {
    id,
    version: 1,
    scope: 'generated',
    subject: '英语',
    knowledgePoint: `句子组织：${value.label}`,
    prompt: `回应下面的情境，把词块排到空格中；有一个多余词块。\n${value.context}`,
    answerType: 'sentence_order',
    source: { kind: 'project_original', reference: SENTENCE_CONTRACT },
    validation: { type: 'sentence_order', authority: 'executable', evidenceId: SENTENCE_CONTRACT },
    sentenceExercise: {
      contract: SENTENCE_CONTRACT,
      conversationId,
      taskId,
      prefix: value.prefix,
      suffix: value.suffix,
      tiles: tiles(value),
      slots: value.pieces.length,
      phase: planning ? 'retest' : 'independent',
      dueDay: planning ? nextNoticeDay(planning.day) : null,
      plannedDay: planning?.day ?? null,
      plannedTimezone: planning?.timezone ?? null
    },
    parentQuestionKey: parent,
    publishable: false
  };
}
function canonicalSentence(question) {
  const exercise = question?.sentenceExercise;
  requireSentence(exercise?.contract === SENTENCE_CONTRACT, '句子任务版本不支持');
  const canonical = createSentenceQuestion(
    question.id,
    exercise.conversationId,
    exercise.taskId,
    question.parentQuestionKey || null,
    exercise.phase === 'retest' ? { day: exercise.plannedDay, timezone: exercise.plannedTimezone } : null
  );
  requireSentence(
    same(exercise, canonical.sentenceExercise) &&
      same(question.source, canonical.source) &&
      question.prompt === canonical.prompt &&
      question.subject === canonical.subject &&
      question.knowledgePoint === canonical.knowledgePoint &&
      question.scope === 'generated' &&
      question.version === 1 &&
      question.answerType === 'sentence_order' &&
      !question.options?.length &&
      !question.rubric &&
      !question.materialExercise &&
      !question.writingExercise &&
      !question.scienceExercise &&
      !question.vocabularyExercise &&
      !question.vocabularyReview &&
      !question.prerequisite &&
      !question.uncertainties?.length &&
      question.expectedAnswer == null,
    '句子条件已变化，请重新出题'
  );
  requireSentence(!question.validation || same(question.validation, canonical.validation), '句子校验规则不匹配');
  return canonical;
}
export function normalizeSentenceQuestion(question, state, at) {
  const canonical = canonicalSentence(question),
    e = canonical.sentenceExercise;
  const session = state.conversations.find((c) => c.id === e.conversationId);
  requireSentence(session && !session.stopped, '当前任务已停止', 'STOPPED');
  if (question.parentQuestionKey) {
    const parent = state.questions.find((q) => `${q.id}@${q.version}` === question.parentQuestionKey);
    requireSentence(
      parent?.sentenceExercise?.contract === SENTENCE_CONTRACT &&
        parent.sentenceExercise.conversationId === session.id &&
        parent.sentenceExercise.taskId !== e.taskId,
      '新句子需关联同一对话的不同原题'
    );
    requireSentence(
      state.attempts.some((a) => a.questionKey === question.parentQuestionKey && a.conversationId === session.id),
      '请先提交原题作答'
    );
  } else requireSentence(e.phase !== 'retest', '复测需要原题');
  if (e.phase === 'retest')
    requireSentence(e.plannedDay === localDay(at, e.plannedTimezone), '复测需保留安排时的日期与时区');
  requireSentence(
    !state.questions.some(
      (q) => q.sentenceExercise?.conversationId === session.id && q.sentenceExercise.taskId === e.taskId
    ),
    '本情境已使用，请换新句子',
    'CONFLICT'
  );
  question.validation = canonical.validation;
  return question;
}
export function nextSentenceTask(state, conversationId) {
  const used = new Set(
    state.questions
      .filter((q) => q.sentenceExercise?.conversationId === conversationId)
      .map((q) => q.sentenceExercise.taskId)
  );
  const value = SENTENCE_TASKS.find((item) => !used.has(item.id));
  requireSentence(value, '这些原创句子已练完，可开始新对话。', 'CAPABILITY_UNAVAILABLE');
  return value.id;
}
export function sentenceRetestReady(question, at = Date.now()) {
  const e = question?.sentenceExercise;
  return !e || e.phase !== 'retest' || localDay(at, e.plannedTimezone) >= e.dueDay;
}
export function sentenceHint(question) {
  return sourceTask(canonicalSentence(question).sentenceExercise.taskId).hint;
}
export function sentenceAnswer(question, order) {
  const e = canonicalSentence(question).sentenceExercise;
  requireSentence(
    Array.isArray(order) &&
      order.length === e.slots &&
      new Set(order).size === order.length &&
      order.every((id) => typeof id === 'string' && e.tiles.some((tile) => tile.id === id)),
    '请选择完整且不重复的词块'
  );
  return `${e.prefix} ${order.map((id) => e.tiles.find((tile) => tile.id === id).text).join(' ')}${e.suffix}`;
}
const plain = (text) => text.trim().replace(/\s+/gu, ' ');
function suppliedOrder(canonical, raw) {
  const e = canonical.sentenceExercise,
    value = plain(raw),
    prefix = `${e.prefix} `;
  if (!value.startsWith(prefix) || !value.endsWith(e.suffix)) return null;
  const body = value.slice(prefix.length, -e.suffix.length);
  const walk = (rest, used) => {
    if (!rest) return used.length === e.slots ? used : null;
    if (used.length >= e.slots) return null;
    for (const tile of e.tiles) {
      if (used.includes(tile.id)) continue;
      if (rest === tile.text || rest.startsWith(`${tile.text} `)) {
        const found = walk(rest.slice(tile.text.length).trimStart(), [...used, tile.id]);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(body, []);
}
export function gradeSentenceAnswer(question, answer) {
  try {
    const canonical = canonicalSentence(question);
    if (!same(question.validation, canonical.validation)) throw new Error('missing host rule');
    if (typeof answer !== 'string' || answer.length > 500)
      return { status: 'pending', outcome: null, basis: 'unsupported_sentence_order' };
    const order = suppliedOrder(canonical, answer);
    if (!order) return { status: 'pending', outcome: null, basis: 'unsupported_sentence_order' };
    const value = sourceTask(canonical.sentenceExercise.taskId);
    const valid = [value.pieces.map((_, i) => i), ...value.alternatives].map((indices) =>
      indices.map((i) => `t${i + 1}`)
    );
    const correct = valid.some((ids) => same(ids, order));
    // 只对已复核的替换组合认定不符；出现多余词块本身不证明所有排列都不成立。
    const rejected = [`t${value.pieces.length + 1}`, ...value.pieces.slice(1).map((_, i) => `t${i + 2}`)];
    if (!correct && !same(order, rejected))
      return { status: 'pending', outcome: null, basis: 'sentence_combination_review_required' };
    return {
      status: 'reliable',
      outcome: correct ? 'correct' : 'wrong',
      basis: SENTENCE_CONTRACT,
      evaluator: 'deterministic-sentence-v1',
      authority: 'executable'
    };
  } catch {
    return { status: 'pending', outcome: null, basis: 'no_independent_reference' };
  }
}
