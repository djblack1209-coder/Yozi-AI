import { ENTRY_EVENTS, applyEntryOperation, normalizeEntrySchedule } from './learning-entries.js';
import { applyAdherenceOperation, ADHERENCE_EVENTS, reviewFacts } from './learning-adherence.js';
import { normalizeLearningProposal, assertLearningProposalAcceptance } from './learning-proposals.js';
import { normalizeContentBlocks, PRESENTATION_CONTRACT } from './learning-content-blocks.js';
import {
  normalizeIntakeContext,
  normalizeIntakeReply,
  normalizeStudyProfile,
  intakeFinished,
  MODEL_INTAKE_V2_CONTRACT
} from './learning-intake.js';
import { applyWritingCoachOperation } from './learning-writing-coach.js';
import { subjectCoachMethodByContract } from './learning-coach-methods.js';
import {
  normalizeRubric,
  assessWithRubric,
  RUBRIC_EVIDENCE_CONTRACT,
  WRITING_FEEDBACK_OUTPUT_CONTRACT
} from './learning-rubric.js';
import { hasMaterialLayout, validMaterialLayout } from './learning-material-layout.js';
export {
  MATERIAL_LAYOUT_CONTRACT,
  validMaterialLayout,
  validMaterialLayoutSegment
} from './learning-material-layout.js';
import { normalizeComputeReference, computeReferenceText } from './learning-compute-contract.js';
import { normalizeGrammarReference, grammarReferenceText } from './learning-grammar-contract.js';
import { applyJourneyOperation } from './learning-journey.js';
import {
  EXACT_ARITHMETIC_CONTRACT,
  normalizeExactArithmeticQuestion,
  gradeExactArithmeticAnswer
} from './learning-arithmetic.js';
import { applyReminderOperation } from './learning-reminders.js';
import { FRACTION_CONTRACT, normalizeFractionQuestion, gradeFractionAnswer } from './learning-fraction.js';
import { validateQuizOriginalQuestion } from './learning-quiz-original.js';
import { normalizeOatutorQuestion, applyOatutorOperation, oatutorHelpForQuestion } from './learning-oatutor.js';
import { HISTORY_LIMITS } from './learning-history.js';
import { matchesVisualSource, normalizeSavedVisualReading } from './learning-vision.js';
import { conversationStrategy, requestedTeachingMethod } from './learning-strategy.js';
import { validPrerequisiteQuestion } from './learning-prerequisite.js';
import {
  normalizeAlgebraQuestion,
  deriveAlgebraQuestionFor,
  gradeAlgebraAnswer,
  isAlgebraAnswer,
  parseExactNumberAnswer,
  exactMaterialNumber
} from './learning-algebra.js';
import {
  normalizeConditionQuestion,
  deriveConditionQuestion,
  gradeConditionAnswer,
  conditionAnswer
} from './learning-condition.js';
import {
  normalizeConditionProbe,
  deriveConditionProbe,
  gradeConditionProbe,
  conditionProbeAnswer
} from './learning-condition-probe.js';
import { normalizeFieldProbe, deriveFieldProbe, gradeFieldProbe, fieldProbeAnswer } from './learning-field-probe.js';
import {
  NOTICE_CONTRACT,
  GUIDED_WRITING_CONTRACT,
  EMAIL_WRITING_CONTRACT,
  CHINESE_MATERIAL_ARGUMENT_CONTRACT,
  EXTENDED_WRITING_CONTRACTS,
  writingAnswerLimit,
  normalizeWritingQuestion,
  writingRetestReady,
  publicWritingReference,
  writingReferenceNoteLocation
} from './learning-writing.js';
import {
  SCIENCE_TRANSFER_CONTRACT,
  MOTION_TRANSFER_CONTRACT,
  GRAPH_TRANSFER_CONTRACT,
  ENERGY_TRANSFER_CONTRACT,
  DENSITY_TRANSFER_CONTRACT,
  PRESSURE_TRANSFER_CONTRACT,
  normalizeScienceQuestion,
  gradeScienceAnswer,
  scienceRetestReady
} from './learning-science.js';
import {
  VOCABULARY_CONTRACT,
  VOCABULARY_REVIEW_CONTRACT,
  VOCABULARY_SPACED_REVIEW_CONTRACT,
  normalizeVocabularyReviewQuestion,
  gradeVocabularyReviewAnswer,
  vocabularyRetestReady,
  writingVocabularySense,
  createVocabularyQuestion,
  normalizeVocabularyQuestion,
  gradeVocabularyAnswer,
  nextVocabularyContext,
  vocabularyKnowledgeLabel,
  vocabularyFeedback,
  vocabularyUseFeedbackBasis
} from './learning-vocabulary.js';
import {
  SENTENCE_CONTRACT,
  normalizeSentenceQuestion,
  gradeSentenceAnswer,
  sentenceRetestReady
} from './learning-sentence.js';
export { normalizeRubric, RUBRIC_CONTRACT } from './learning-rubric.js';
// 所有入口共享的学习事实。纯函数，不访问网络，不执行模型给出的代码。
export const LEARNING_VERSION = 1;
export const METHODS = [
  'explain',
  'question',
  'hint',
  'example',
  'analogy',
  'diagram',
  'steps',
  'prerequisite',
  'variant',
  'challenge',
  'check',
  'review'
];
export class LearningError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
export function assert(condition, code, message) {
  if (!condition) throw new LearningError(code, message);
}
export const LEARNING_TRACKS = Object.freeze({
  general: '通用学习',
  primary: '小学',
  junior: '初中',
  senior: '高中',
  postgraduate: '考研',
  civil: '考公',
  ielts: '雅思',
  toefl: '托福'
});
export const LEARNING_START_TOPICS = Object.freeze([
  '函数运算带练',
  '路程与位移',
  '功与动能',
  '密度、质量与体积',
  '压强、压力与接触面积',
  '英文通知写作',
  '英文说明写作',
  '英文论证写作',
  '英文句子组织',
  '英文邮件写作',
  '英文学术讨论',
  '中文叙事写作',
  '中文材料论证',
  '12 + 8'
]);
// 方向与版本由用户明确填写；空白保留，不从目标或模型回复猜教材、考纲与官方等级。
export function normalizeLearningTask(input = {}) {
  assert(input && typeof input === 'object' && !Array.isArray(input), 'INVALID_INPUT', '学习任务格式不合法');
  assert(
    Object.keys(input).every((k) => ['contract', 'track', 'stage', 'edition'].includes(k)),
    'INVALID_INPUT',
    '学习任务包含未知字段'
  );
  assert(!input.contract || input.contract === 'learning-task-v1', 'SCHEMA_VERSION', '学习任务版本不支持');
  const track = input.track || 'general';
  assert(Object.prototype.hasOwnProperty.call(LEARNING_TRACKS, track), 'INVALID_INPUT', '学习方向不支持');
  const optional = (value) => {
    assert(
      value === undefined || value === null || (typeof value === 'string' && value.length <= 100),
      'INVALID_INPUT',
      '年级或考试版本过长'
    );
    return value?.trim() || null;
  };
  return { contract: 'learning-task-v1', track, stage: optional(input.stage), edition: optional(input.edition) };
}
export function learningTaskContext(state, conversationId) {
  const session = state.conversations.find((c) => c.id === conversationId);
  const task = normalizeLearningTask(session?.task);
  const question = state.questions.find((q) => questionKey(q) === session?.activeQuestionKey);
  const pending = !question || question.uncertainties?.some((u) => !u.resolved);
  const rule = question?.validation;
  const independent =
    !pending &&
    rule?.evidenceId &&
    ['executable', 'human_reviewed'].includes(rule.authority) &&
    [
      'choice',
      'number',
      'number_set',
      'algebra',
      'condition_relation',
      'condition_implication',
      'source_text',
      'field_key'
    ].includes(rule.type);
  return {
    ...task,
    label: LEARNING_TRACKS[task.track],
    questionKey: question ? questionKey(question) : null,
    material: question?.source?.materialId ? 'linked' : 'not_linked',
    evaluation: independent ? 'independent_rule' : question?.rubric ? 'ai_assisted_only' : 'pending_reference',
    rule: independent ? rule.type : null,
    source: question?.source || null,
    curriculumCoverage: 'unverified',
    officialScore: 'unverified'
  };
}
export function learningCapabilitiesData(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  return {
    ...([
      'learning-visual-v1',
      'learning-visual-v2',
      'learning-visual-v3',
      'learning-visual-v4',
      'learning-visual-v5'
    ].includes(input.visualization)
      ? { visualization: input.visualization }
      : {}),
    evaluation: ['independent_rule', 'ai_assisted_only', 'pending_reference'].includes(input.evaluation)
      ? input.evaluation
      : 'pending_reference',
    rule: [
      'choice',
      'number',
      'number_set',
      'algebra',
      'condition_relation',
      'condition_implication',
      'source_text',
      'field_key'
    ].includes(input.rule)
      ? input.rule
      : null,
    material: input.material === 'linked' ? 'linked' : 'not_linked',
    curriculumCoverage: 'unverified',
    officialScore: 'unverified'
  };
}
export function dayKey(time, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(time));
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function validateTimezone(time, timezone, message) {
  assert(typeof timezone === 'string' && timezone.length >= 1 && timezone.length <= 80, 'INVALID_INPUT', message);
  try {
    return dayKey(time, timezone);
  } catch {
    throw new LearningError('INVALID_INPUT', message);
  }
}
export function emptyLearningState(owner, timezone = 'Asia/Shanghai') {
  dayKey(Date.now(), timezone);
  return {
    version: LEARNING_VERSION,
    owner,
    revision: 0,
    timezone,
    conversations: [],
    questions: [],
    materials: [],
    attempts: [],
    plans: [],
    events: [],
    executions: [],
    profile: [],
    strategy: { method: 'question', difficulty: 'self_report', stopped: false },
    reviews: []
  };
}
const clone = (value) => JSON.parse(JSON.stringify(value));
// 序列化一次仍生成完整隔离副本。JSON.rawJSON 可保留非规范数字/转义；
// 检测到真实的规范化差额才重新计数，数字按完整词元扫描，避免长整数反复回溯。
function cloneBatchSnapshot(original) {
  const serialized = JSON.stringify(original);
  const state = JSON.parse(serialized);
  let needsCanonicalCount = /\\u|\\\/|[\uD800-\uDFFF]/.test(serialized);
  if (!needsCanonicalCount) {
    const numbers = /(?:^|[:,\[])(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)(?=[,\]}]|$)/g;
    let token;
    while ((token = numbers.exec(serialized))) {
      const literal = token[1];
      if (
        (literal === '-0' || literal.length >= 16 || /[.eE]/.test(literal)) &&
        JSON.stringify(Number(literal)) !== literal
      ) {
        needsCanonicalCount = true;
        break;
      }
    }
  }
  return { state, characters: needsCanonicalCount ? JSON.stringify(state).length : serialized.length };
}
export function operationFingerprint(value) {
  const canonical = (v) =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .filter((key) => v[key] !== undefined)
              .map((key) => [key, canonical(v[key])])
          )
        : v;
  return JSON.stringify(canonical(value));
}
export function samePrivacyRedaction(a, b) {
  return (
    a?.type === 'privacy.redacted' &&
    b?.type === 'privacy.redacted' &&
    a.data?.materialId === b.data?.materialId &&
    operationFingerprint(a.data?.seed || null) === operationFingerprint(b.data?.seed || null)
  );
}
export function normalizePrivateSyncOperation(raw) {
  const op = clone(raw);
  if (op.type === 'question.add') {
    const q = op.data.question;
    validateQuizOriginalQuestion(q);
    assert(q && ['generated', 'private', 'legacy'].includes(q.scope), 'FORBIDDEN', '私人同步不能发布公共题库');
    assert(!q.writingExercise || !q.validation, 'FORBIDDEN', '通知任务不能导入客观判分权限');
    const match = /^计算 ([+-]?\d{1,5}) ([+×*]) ([+-]?\d{1,5})。$/.exec(q.prompt || '');
    const combination = /^计算 \(([+-]?\d{1,5}) \+ ([+-]?\d{1,5})\) × (-2)。$/.exec(q.prompt || '');
    const inverse = /^已知一个数加 ([+-]?\d{1,5}) 得到 ([+-]?\d{1,10})，求这个数。$/.exec(q.prompt || '');
    const inverseMul = /^已知一个数乘 ([+-]?\d{1,5}) 得到 ([+-]?\d{1,10})，求这个数。$/.exec(q.prompt || '');
    const grouping =
      /^每组有 ([+-]?\d{1,5}) 个物品，共 ([+-]?\d{1,5}) 组。若重新分成 ([+-]?\d{1,5}) 组，每组有多少个？$/.exec(
        q.prompt || ''
      );
    const value = match
      ? match[2] === '+'
        ? Number(match[1]) + Number(match[3])
        : Number(match[1]) * Number(match[3])
      : combination
        ? (Number(combination[1]) + Number(combination[2])) * Number(combination[3])
        : inverse
          ? Number(inverse[2]) - Number(inverse[1])
          : inverseMul && Number(inverseMul[1]) !== 0 && Number(inverseMul[2]) % Number(inverseMul[1]) === 0
            ? Number(inverseMul[2]) / Number(inverseMul[1])
            : grouping && Number(grouping[2]) === Number(grouping[3]) && Number(grouping[2]) !== 0
              ? Number(grouping[1])
              : null;
    q.validation =
      value !== null && q.source?.kind === 'executable'
        ? {
            type: 'number',
            answer: String(value),
            authority: 'executable',
            evidenceId: combination ? 'integer-combination-v1' : 'integer-arithmetic-v1'
          }
        : null;
    q.publishable = false;
    if (q.source?.kind !== 'existing_bank') {
      normalizeAlgebraQuestion(q);
      normalizeConditionQuestion(q);
      normalizeConditionProbe(q);
      normalizeFieldProbe(q);
      normalizeExactArithmeticQuestion(q);
      normalizeFractionQuestion(q);
    }
  }
  if (op.type === 'assessment.review') op.type = 'assessment.correct';
  if (op.type === 'reminder.receipt') op.data.historyOnly = true;
  return op;
}
const text = (value, max = 8000) => {
  assert(typeof value === 'string' && value.trim() && value.length <= max, 'INVALID_INPUT', '内容为空或过长');
  return value.trim();
};
const questionKey = (q) => `${q.id}@${q.version}`;
const effectiveGrade = (a) => a.corrections?.at(-1)?.grade || a.grade;
export { effectiveGrade, questionKey };
export const ORIGINAL_ANSWER_OPERATION = 'attempt.submit-original-v1';
export function attemptSubmissionType(question, previousType) {
  if (['attempt.submit', ORIGINAL_ANSWER_OPERATION].includes(previousType)) return previousType;
  return question?.writingExercise || question?.vocabularyReview?.phase === 'usage'
    ? ORIGINAL_ANSWER_OPERATION
    : 'attempt.submit';
}

// 隐私删除保留无正文的墓碑和计划分母。原始操作也要脱敏，否则导出、同步或恢复会重新带回资料。
export function inspectMaterialDeletion(state, materialId) {
  const deletion = (state.materialDeletions || []).find((d) => d.materialId === materialId);
  const material = state.materials.find((m) => m.id === materialId || m.aliases?.includes(materialId));
  const materialIds = new Set([materialId, ...(material?.aliases || []), ...(deletion?.materialIds || [])]);
  if (material) materialIds.add(material.id);
  // 旧快照没有 aliases；从同原件/同解析器的实际导入事件补齐，不推测其他资料归属。
  if (material)
    for (const event of state.events) {
      const source = event.type === 'material.add' && event.data?.material;
      if (
        source &&
        source.fingerprint === material.fingerprint &&
        source.original?.connectorOrigin === material.original?.connectorOrigin
      )
        materialIds.add(source.id);
    }
  const keys = new Set(deletion?.questionKeys || []);
  let changed = true;
  while (changed) {
    changed = false;
    for (const q of state.questions)
      if (
        (materialIds.has(q.source?.materialId) ||
          keys.has(q.parentQuestionKey) ||
          keys.has(q.prerequisite?.originalQuestionKey)) &&
        !keys.has(questionKey(q))
      ) {
        keys.add(questionKey(q));
        changed = true;
      }
  }
  const conversations = new Set(
    state.conversations
      .filter(
        (c) =>
          keys.has(c.activeQuestionKey) ||
          c.messages.some((m) => keys.has(m.questionKey)) ||
          c.coach?.materialIds.some((id) => materialIds.has(id))
      )
      .map((c) => c.id)
  );
  for (const a of state.attempts) if (keys.has(a.questionKey)) conversations.add(a.conversationId);
  for (const e of state.events)
    if (keys.has(e.data?.questionKey) && e.data.conversationId) conversations.add(e.data.conversationId);
  const attempts = state.attempts.filter((a) => keys.has(a.questionKey) || conversations.has(a.conversationId));
  const attemptIds = new Set(attempts.map((a) => a.id));
  return {
    materialId,
    materialIds: [...materialIds].sort(),
    questionKeys: [...keys].sort(),
    conversationIds: [...conversations].sort(),
    attemptIds: [...attemptIds].sort(),
    questions: state.questions.filter((q) => keys.has(questionKey(q))).length,
    attempts: attempts.length,
    conversations: conversations.size,
    coachingDays: state.conversations
      .filter((c) => conversations.has(c.id))
      .reduce((n, c) => n + (c.coach?.days.length || 0), 0),
    messages: state.conversations.filter((c) => conversations.has(c.id)).reduce((n, c) => n + c.messages.length, 0),
    tasks: state.plans.flatMap((p) => p.tasks).filter((t) => keys.has(t.questionKey) || attemptIds.has(t.completedBy))
      .length
  };
}
function redactMaterial(state, data, deletionId, at) {
  const preview = inspectMaterialDeletion(state, data.materialId);
  const materialIds = new Set([...preview.materialIds, ...(data.materialIds || [])]);
  const keys = new Set([...preview.questionKeys, ...(data.questionKeys || [])]);
  const conversations = new Set(preview.conversationIds);
  const attempts = new Set(preview.attemptIds);
  const affectedTasks = new Set();
  const sanitizeTask = (task) => {
    if (!keys.has(task.questionKey) && !attempts.has(task.completedBy) && !affectedTasks.has(task.id)) return task;
    affectedTasks.add(task.id);
    return { ...task, title: '关联资料或作答已删除', questionKey: null, completedBy: null, privacyRemoved: true };
  };
  state.plans.forEach((plan) => (plan.tasks = plan.tasks.map(sanitizeTask)));
  const affected = (event) => {
    const d = event.data || {};
    return (
      (event.type === 'material.add' && materialIds.has(d.material?.id)) ||
      (event.type === 'question.add' && keys.has(d.question && questionKey(d.question))) ||
      keys.has(d.questionKey) ||
      attempts.has(event.id) ||
      attempts.has(d.attemptId) ||
      affectedTasks.has(d.taskId) ||
      (d.evidenceIds || []).some((id) => attempts.has(id)) ||
      conversations.has(d.conversationId) ||
      conversations.has(event.id)
    );
  };
  state.events = state.events.map((event) => {
    if (event.type === 'material.delete') return event;
    if (event.type === 'privacy.redacted') {
      if (event.data.seed?.kind === 'plan')
        event.data.seed.tasks = event.data.seed.tasks.map((task) => {
          const sanitized = sanitizeTask(task);
          const { completedBy: _removed, ...safe } = sanitized;
          return safe;
        });
      return event;
    }
    const plan = ['plan.set', 'plan.merge'].includes(event.type) && state.plans.find((p) => p.id === event.id);
    const planChanged = plan && plan.tasks.some((task) => affectedTasks.has(task.id));
    if (!affected(event) && !planChanged) {
      if (event.type === 'plan.merge') {
        const stored = state.plans.find((p) => p.id === event.id);
        if (stored) event.result = clone(stored);
      }
      return event;
    }
    const seed =
      event.type === 'conversation.start'
        ? { kind: 'conversation' }
        : planChanged
          ? {
              kind: 'plan',
              ...(plan.conversationId ? { conversationId: plan.conversationId } : {}),
              day: event.data.day || plan.day,
              tasks: (event.data.tasks || plan.tasks).map((task, index) => {
                const sanitized = sanitizeTask({ ...task, id: task.id || `${event.id}_${index}` });
                return {
                  id: sanitized.id,
                  title: sanitized.title,
                  questionKey: sanitized.questionKey || null,
                  condition: sanitized.condition,
                  ...(sanitized.privacyRemoved ? { privacyRemoved: true } : {})
                };
              })
            }
          : null;
    return {
      id: event.id,
      at: event.at,
      type: 'privacy.redacted',
      data: { materialId: data.materialId, deletionId, ...(seed ? { seed } : {}) },
      result: { redacted: true }
    };
  });
  state.materials = state.materials.filter((m) => !materialIds.has(m.id));
  state.questions = state.questions.filter((q) => !keys.has(questionKey(q)));
  state.attempts = state.attempts.filter((a) => !attempts.has(a.id));
  state.reviews = state.reviews.filter((r) => !keys.has(r.questionKey) && !attempts.has(r.attemptId));
  state.profile = state.profile.filter(
    (p) =>
      !(p.evidenceIds || []).some((id) => attempts.has(id)) &&
      !state.events.some((e) => e.id === p.id && e.type === 'privacy.redacted')
  );
  const redactedIds = new Set(state.events.filter((e) => e.type === 'privacy.redacted').map((e) => e.id));
  state.executions = state.executions.filter(
    (e) => !keys.has(e.questionKey) && !redactedIds.has(e.id) && !redactedIds.has(e.id.replace(/:execution$/, ''))
  );
  for (const c of state.conversations)
    if (conversations.has(c.id)) {
      c.goal = '关联资料已删除的对话';
      delete c.task;
      delete c.coach;
      c.messages = [];
      c.activeQuestionKey = null;
      c.pendingHints = [];
      c.helpQueues = [];
      c.nextAttemptKind = null;
      c.stopped = true;
    }
  if ((state.strategy.evidenceIds || []).some((id) => attempts.has(id)) || conversations.size)
    state.strategy = { method: 'question', difficulty: 'self_report', stopped: true, reason: '关联资料已删除' };
  state.materialDeletions ||= [];
  const prior = state.materialDeletions.find((d) => d.materialId === data.materialId);
  if (prior) {
    prior.questionKeys = [...new Set([...prior.questionKeys, ...keys])].sort();
    prior.materialIds = [...new Set([...(prior.materialIds || [prior.materialId]), ...materialIds])].sort();
  } else
    state.materialDeletions.push({
      materialId: data.materialId,
      materialIds: [...materialIds].sort(),
      deletionId,
      at,
      questionKeys: [...keys].sort(),
      original: data.original || null,
      originalStatus: data.original ? 'pending' : 'not_applicable'
    });
  return preview;
}

export function enforceMaterialDeletions(state, source) {
  let result = clone(state);
  for (const event of source.events.filter((e) => e.type === 'material.delete')) {
    result = applyLearningOperation(result, { id: event.id, type: event.type, data: event.data, at: event.at }).state;
    redactMaterial(result, event.data, event.id, event.at);
  }
  return result;
}

export function knowledgeScope(question) {
  if (question?.vocabularyExercise) return `${question.subject || '英语'} / ${vocabularyKnowledgeLabel(question)}`;
  // 缺知识点时只描述当前题目，不能把无标签的所有学科合成一种能力。
  return `${question?.subject || '综合'} / ${question?.knowledgePoint || `当前题目 ${question ? questionKey(question) : '未知'}`}`;
}
function pendingHelp(state, key) {
  const hints = state.conversations.flatMap((session) => [
    ...(session.activeQuestionKey === key ? session.pendingHints : []),
    ...(session.helpQueues || []).filter((entry) => entry.questionKey === key).flatMap((entry) => entry.hints)
  ]);
  return [...new Map(hints.map((hint) => [hint.id, hint])).values()];
}
function writingHelp(state, session, hint) {
  session.pendingHints.push(hint);
  // 已打开的认词题也接收期间实际展示的帮助，不能通过关卡切换抹去提示。
  session.helpQueues ||= [];
  for (const q of state.questions.filter(
    (q) =>
      q.vocabularyExercise?.conversationId === session.id &&
      q.vocabularyExercise.writingQuestionKey === session.activeQuestionKey &&
      !state.attempts.some((a) => a.questionKey === questionKey(q))
  )) {
    const entry = session.helpQueues.find((item) => item.questionKey === questionKey(q));
    if (entry && !entry.hints.some((item) => item.id === hint.id)) entry.hints.push(clone(hint));
  }
}
function rubricOrigins(state, question) {
  const keys = [];
  let key = question.rubricRevisionOf;
  if (!key) return keys;
  const questions = new Map(state.questions.map((q) => [questionKey(q), q]));
  const visited = new Set();
  while (key && !visited.has(key)) {
    visited.add(key);
    keys.push(key);
    key = questions.get(key)?.rubricRevisionOf;
  }
  return keys;
}

const UNITS = Object.freeze({
  m: ['length', 1],
  米: ['length', 1],
  cm: ['length', 0.01],
  厘米: ['length', 0.01],
  mm: ['length', 0.001],
  毫米: ['length', 0.001],
  km: ['length', 1000],
  千米: ['length', 1000],
  kg: ['mass', 1],
  千克: ['mass', 1],
  g: ['mass', 0.001],
  克: ['mass', 0.001],
  s: ['time', 1],
  秒: ['time', 1],
  min: ['time', 60],
  分钟: ['time', 60],
  h: ['time', 3600],
  小时: ['time', 3600]
});
// 受限常数/分数/十进制及公开单位白名单，不执行表达式；未知单位保留待复核。
export function parseNumberAnswer(raw, unit = '') {
  let input = String(raw)
    .trim()
    .replace(/^答案[是为：: ]*/, '')
    .replace(/^x\s*=\s*/i, '');
  if (unit) {
    const declared = UNITS[unit];
    const suffix = Object.keys(UNITS)
      .sort((a, b) => b.length - a.length)
      .find((u) => input.endsWith(u));
    if (declared && suffix) {
      if (declared[0] !== UNITS[suffix][0]) return null;
      const value = parseNumberAnswer(input.slice(0, -suffix.length));
      const converted = value === null ? null : (value * UNITS[suffix][1]) / declared[1];
      return converted !== null && Number.isFinite(converted) ? converted : null;
    }
    if (!input.endsWith(unit)) return null;
    input = input.slice(0, -unit.length).trim();
  }
  const match = /^([+-]?\d+(?:\.\d+)?)(?:\s*\/\s*([+-]?\d+(?:\.\d+)?))?$/.exec(input);
  if (!match || match[2] === '0') return null;
  const result = Number(match[1]) / (match[2] ? Number(match[2]) : 1);
  return Number.isFinite(result) ? result : null;
}
export function parseNumberSet(raw) {
  const input = String(raw)
    .trim()
    .replace(/^答案[是为：: ]*/, '')
    .replace(/^x\s*=\s*/i, '');
  const plusMinus = /^±\s*([+]?(?:\d+(?:\.\d+)?)(?:\s*\/\s*\d+(?:\.\d+)?)?)$/.exec(input);
  if (plusMinus) {
    const value = parseNumberAnswer(plusMinus[1]);
    return value === null ? null : value === 0 ? [0] : [-value, value];
  }
  const stripped = input.startsWith('{') && input.endsWith('}') ? input.slice(1, -1) : input;
  const parts = stripped.split(/[,，、;；]/);
  if (!parts.length || parts.length > 20) return null;
  const values = parts.map((part) => parseNumberAnswer(part));
  return values.some((v) => v === null) ? null : [...new Set(values)].sort((a, b) => a - b);
}
// 只验所给文本中的字面字段与有界数值关系，不把资料内容或考试评分语义认定为真实。
export function materialObjectiveFields(segment, contract = 'material-objective-v3') {
  assert(
    ['material-objective-v1', 'material-objective-v2', 'material-objective-v3'].includes(contract),
    'SCHEMA_VERSION',
    '资料练习版本不支持'
  );
  assert(
    segment && typeof segment.content === 'string' && segment.content.length <= 2000,
    'CAPABILITY_UNAVAILABLE',
    '此练习需要不超过2000字的文字片段'
  );
  assert(
    !segment.reviewRequired &&
      segment.status !== 'failed' &&
      !segment.uncertainties?.some((u) => !u.resolved) &&
      (!segment.role || segment.role === 'source_text'),
    'CAPABILITY_UNAVAILABLE',
    '资料区域或提取仍有疑义，请先核对原件'
  );
  const parsed = segment.content
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      const match = /^([^：:\n]{1,80})[：:]\s*(.{1,300})$/u.exec(line.trim());
      return match ? { key: match[1].trim(), value: match[2].trim() } : null;
    });
  if (contract === 'material-objective-v3')
    assert(
      parsed.every((field) => field?.key && field.value),
      'CAPABILITY_UNAVAILABLE',
      '每个非空行都须是完整的“字段：值”；请先核对标题、说明或缺失内容，不会忽略原文行'
    );
  const fields = parsed.filter(Boolean);
  assert(
    fields.length > 0 && fields.length <= 20 && new Set(fields.map((f) => f.key)).size === fields.length,
    'CAPABILITY_UNAVAILABLE',
    '需要一行一个“字段：值”，字段不可重复，最多20项'
  );
  assert(
    !fields.some((f) => {
      if (contract !== 'material-objective-v3')
        return /答案|解析|批注|作答|\b(?:answer|solution|annotation)\b/iu.test(f.key);
      const label = f.key.normalize('NFKC').replace(/[_-]/g, ' ');
      return /答案|解析|批注|作答|\b(?:answers?(?:\s*keys?)?|solutions?|annotations?|(?:student|user|written)\s*(?:answers?|responses?))\b/iu.test(
        label
      );
    }),
    'CAPABILITY_UNAVAILABLE',
    '答案、作答或批注区域不能自动用作独立校验资料'
  );
  return fields;
}
export function createMaterialObjectiveQuestion(id, material, input, parent = null) {
  const segment = material?.segments.find((s) => s.id === input?.segmentId);
  const kind = input.kind;
  const contract = input.contract || 'material-objective-v3';
  const fields = materialObjectiveFields(segment, contract);
  assert(
    (contract === 'material-objective-v1'
      ? ['literal', 'difference', 'growth_percent']
      : contract === 'material-objective-v2'
        ? ['difference', 'growth_percent', 'share_percent']
        : ['literal', 'difference', 'growth_percent', 'share_percent']
    ).includes(kind),
    'INVALID_INPUT',
    '资料练习类型不支持'
  );
  const from = fields.find((f) => f.key === input.from);
  const to = fields.find((f) => f.key === input.to);
  assert(from && (kind === 'literal' || (to && to.key !== from.key)), 'INVALID_INPUT', '请指定资料中存在的不同字段');
  const numeric = (field) => {
    assert(
      /^[+-]?\d{1,9}$/.test(field.value),
      'CAPABILITY_UNAVAILABLE',
      '当前资料分析仅支持九位以内整数，不猜单位或舍入'
    );
    return Number(field.value);
  };
  let instruction, validation;
  if (kind === 'literal') {
    instruction = `字段“${from.key}”的值是什么？直接引用所给文本，不作推断。`;
    validation = { type: 'source_text', answer: from.value, inputs: { from } };
  } else if (contract === 'material-objective-v1') {
    const a = numeric(from),
      b = numeric(to);
    if (kind === 'growth_percent') assert(a > 0 && b >= 0, 'CAPABILITY_UNAVAILABLE', '增长率需要正基期和非负现期');
    instruction =
      kind === 'difference'
        ? `“${to.key}”相对“${from.key}”增加多少？允许负数，直接填写数值。`
        : `“${to.key}”相对“${from.key}”的增长率是多少？填写百分数，保留精确分数也可以，须带%。`;
    validation = {
      type: 'number',
      answer: kind === 'difference' ? String(b - a) : `${(b - a) * 100}/${a}`,
      inputs: { from, to },
      ...(kind === 'growth_percent' ? { unit: '%' } : {})
    };
  } else {
    let answer;
    try {
      answer = exactMaterialNumber(kind, from.value, to.value);
    } catch (error) {
      const message =
        {
          unsupported_material_number: '请选择九位以内整数或最多六位小数的纯数值字段，不猜单位、分组符号或舍入',
          invalid_growth_base: '增长率需要正基期和非负现期',
          invalid_share_total: '占比需要正的整体和非负的部分，部分不能大于整体',
          resource_limit: '精确运算超出范围，请选较小的纯数值字段；不会改用近似判分'
        }[error.code] || '这些字段无法进行精确运算，请检查原文数值';
      assert(false, 'CAPABILITY_UNAVAILABLE', message);
    }
    instruction =
      kind === 'difference'
        ? `“${to.key}”相对“${from.key}”增加多少？允许负数，填写精确数值，有限小数或分数均可，不四舍五入。`
        : kind === 'growth_percent'
          ? `“${to.key}”相对“${from.key}”的增长率是多少？填写精确百分数，循环小数请用分数，须带%，不四舍五入。`
          : `“${from.key}”占“${to.key}”的百分比是多少？前者为部分，后者为整体。填写精确百分数，循环小数请用分数，须带%，不四舍五入。`;
    validation = { type: 'number', answer, inputs: { from, to }, ...(kind !== 'difference' ? { unit: '%' } : {}) };
  }
  const exercise = { contract, kind, from: from.key, to: kind === 'literal' ? null : to.key };
  const excerpt = (kind === 'literal' ? [from] : [from, to]).map((field) => `${field.key}: ${field.value}`).join('\n');
  return {
    id,
    version: 1,
    scope: 'private',
    prompt: `${contract === 'material-objective-v3' ? '根据所给原文完成练习：' : '根据所给资料完成练习：'}\n${excerpt}\n\n${instruction}`,
    answerType: validation.type,
    subject: kind === 'literal' ? '阅读' : '数量与资料分析',
    knowledgePoint:
      kind === 'literal'
        ? '字面信息定位'
        : kind === 'difference'
          ? '增量计算'
          : kind === 'share_percent'
            ? '占比计算'
            : '增长率计算',
    source: {
      kind: 'private_material',
      materialId: material.id,
      segmentId: segment.id,
      page: segment.page,
      location: segment.location,
      extractionVersion: segment.extractionVersion || material.extractionVersion,
      extractionEventId: segment.extractionEventId || null
    },
    materialExercise: exercise,
    validation: { ...validation, authority: 'executable', evidenceId: contract },
    uncertainties: [],
    publishable: false,
    ...(parent ? { parentQuestionKey: questionKey(parent), variantChange: '使用原资料中的不同字段独立复测' } : {})
  };
}
function normalizeMaterialObjective(question, state) {
  const exercise = question.materialExercise;
  assert(
    ['material-objective-v1', 'material-objective-v2', 'material-objective-v3'].includes(exercise?.contract) &&
      Object.keys(exercise).every((k) => ['contract', 'kind', 'from', 'to'].includes(k)),
    'INVALID_INPUT',
    '资料练习合同不合法'
  );
  const material = state.materials.find((m) => m.id === question.source?.materialId);
  const derived = createMaterialObjectiveQuestion(question.id, material, {
    ...exercise,
    segmentId: question.source?.segmentId
  });
  assert(
    question.prompt === derived.prompt &&
      operationFingerprint(question.source) === operationFingerprint(derived.source),
    'SOURCE_MISMATCH',
    '题目与资料原文或提取版本不一致，未采纳模型或客户端答案'
  );
  assert(
    question.scope === 'private' && !question.rubric && !question.options?.length,
    'INVALID_INPUT',
    '资料规则不能替代其他题型或发布公共题库'
  );
  for (const key of ['validation', 'answerType', 'subject', 'knowledgePoint']) question[key] = derived[key];
}
export function createMaterialObjectiveVariant(id, parent, state) {
  if (!parent?.materialExercise) return null;
  normalizeMaterialObjective((parent = clone(parent)), state);
  const material = state.materials.find((m) => m.id === parent.source.materialId);
  const exercise = parent.materialExercise;
  const fields = materialObjectiveFields(
    material.segments.find((s) => s.id === parent.source.segmentId),
    exercise.contract
  );
  for (const next of fields) {
    if (
      [exercise.from, exercise.to].includes(next.key) ||
      (exercise.kind === 'literal' && next.value === parent.validation.answer)
    )
      continue;
    try {
      return createMaterialObjectiveQuestion(
        id,
        material,
        {
          contract: exercise.contract,
          segmentId: parent.source.segmentId,
          kind: exercise.kind,
          from:
            exercise.kind === 'literal' ? next.key : exercise.kind === 'share_percent' ? exercise.from : exercise.to,
          to: exercise.kind === 'literal' ? null : next.key
        },
        parent
      );
    } catch (error) {
      if (error.code !== 'CAPABILITY_UNAVAILABLE') throw error;
    }
  }
  assert(false, 'CAPABILITY_UNAVAILABLE', '资料中没有适用的不同字段可作独立复测；不会重复原题冒充新检验');
}
export function gradeAnswer(question, answer, state = null) {
  if (question.source?.kind === 'existing_bank')
    return { status: 'pending', outcome: null, basis: 'no_independent_reference' };
  if (question.oatutorExercise) {
    if (state) normalizeOatutorQuestion(question, state);
    return { status: 'pending', outcome: null, reason: 'no_independent_reference' };
  }
  if (question.sentenceExercise) return gradeSentenceAnswer(question, answer);
  if (question.vocabularyReview) return gradeVocabularyReviewAnswer(question, answer, state);
  if (question.vocabularyExercise) return gradeVocabularyAnswer(question, answer);
  if (question.scienceExercise) return gradeScienceAnswer(question, answer);
  if (question.uncertainties?.some((item) => !item.resolved)) {
    return { status: 'pending', outcome: null, basis: 'critical_input_uncertain' };
  }
  if (
    question.source?.evidenceId === EXACT_ARITHMETIC_CONTRACT ||
    question.validation?.evidenceId === EXACT_ARITHMETIC_CONTRACT
  )
    return gradeExactArithmeticAnswer(question, answer);
  if (question.source?.evidenceId === FRACTION_CONTRACT || question.validation?.evidenceId === FRACTION_CONTRACT)
    return gradeFractionAnswer(question, answer);
  if (deriveFieldProbe(question.prompt) && !question.rubric && !question.options?.length)
    return gradeFieldProbe(question, answer);
  if (deriveConditionProbe(question.prompt) && !question.rubric && !question.options?.length)
    return gradeConditionProbe(question, answer);
  if (deriveConditionQuestion(question.prompt) && !question.rubric && !question.options?.length)
    return gradeConditionAnswer(question, answer);
  if (deriveAlgebraQuestionFor(question) && !question.rubric && !question.options?.length)
    return gradeAlgebraAnswer(question, answer);
  const rule = question.validation;
  // 来自模型的 reference 不能自行提升为独立判分依据。
  if (!rule || !['executable', 'human_reviewed'].includes(rule.authority) || !rule.evidenceId) {
    return { status: 'pending', outcome: null, basis: 'no_independent_reference' };
  }
  let correct;
  if (rule.type === 'source_text') {
    if (
      !['material-objective-v1', 'material-objective-v3'].includes(question.materialExercise?.contract) ||
      question.materialExercise.kind !== 'literal' ||
      (question.materialExercise.contract === 'material-objective-v3' && rule.evidenceId !== 'material-objective-v3')
    )
      return { status: 'pending', outcome: null, basis: 'no_independent_reference' };
    correct =
      answer.trim() === rule.answer ||
      answer.trim().replace(/^(?:我的答案是|我的答案[：:]|答案是)\s*/u, '') === rule.answer;
  } else if (rule.type === 'choice') {
    const match = /^(?:我(?:选|选择)|选择|答案[是为：:]?)?\s*([A-H](?:[、,\s]*[A-H])*)[。.]?$/i.exec(answer.trim());
    if (!match) return { status: 'pending', outcome: null, basis: 'ambiguous_answer' };
    const normalize = (value) => [...new Set(value.toUpperCase().match(/[A-H]/g) || [])].sort().join('');
    correct = normalize(match[1]) === normalize(rule.answer);
  } else if (rule.type === 'number') {
    if (['material-objective-v2', 'material-objective-v3'].includes(question.materialExercise?.contract)) {
      if (rule.evidenceId !== question.materialExercise.contract)
        return { status: 'pending', outcome: null, basis: 'no_independent_reference' };
      const actual = parseExactNumberAnswer(answer, rule.unit || '');
      const expected = parseExactNumberAnswer(String(rule.answer));
      if (!actual || !expected) return { status: 'pending', outcome: null, basis: 'unsupported_expression_or_unit' };
      return {
        status: 'reliable',
        outcome: actual[0] === expected[0] && actual[1] === expected[1] ? 'correct' : 'wrong',
        basis: rule.evidenceId,
        evaluator: 'deterministic-exact-v1',
        authority: rule.authority
      };
    }
    const actual = parseNumberAnswer(answer, rule.unit || '');
    const expected = parseNumberAnswer(String(rule.answer));
    if (actual === null || expected === null)
      return { status: 'pending', outcome: null, basis: 'unsupported_expression_or_unit' };
    correct = Math.abs(actual - expected) <= Math.max(1e-10, Math.abs(expected) * 1e-10);
  } else if (rule.type === 'number_set') {
    const actual = parseNumberSet(answer);
    const expected = Array.isArray(rule.answers) ? [...new Set(rule.answers)].sort((a, b) => a - b) : null;
    const domains = {
      real: (n) => Number.isFinite(n),
      integer: (n) => Number.isInteger(n),
      positive: (n) => n > 0 && Number.isFinite(n)
    };
    const domain = Object.prototype.hasOwnProperty.call(domains, rule.domain || 'real')
      ? domains[rule.domain || 'real']
      : null;
    if (
      !actual ||
      !expected?.length ||
      expected.length > 20 ||
      !domain ||
      expected.some((n) => typeof n !== 'number' || !domain(n))
    )
      return { status: 'pending', outcome: null, basis: 'unsupported_set_or_reference_domain' };
    const equal = (a, b) => Math.abs(a - b) <= Math.max(1e-10, Math.abs(b) * 1e-10);
    correct = actual.length === expected.length && actual.every((a, i) => domain(a) && equal(a, expected[i]));
    if (
      !correct &&
      actual.length < expected.length &&
      actual.every((a) => domain(a) && expected.some((b) => equal(a, b)))
    )
      return {
        status: 'reliable',
        outcome: 'partial',
        basis: rule.evidenceId,
        evaluator: 'deterministic-v2',
        authority: rule.authority
      };
  } else {
    return { status: 'pending', outcome: null, basis: 'rubric_review_required' };
  }
  return {
    status: 'reliable',
    outcome: correct ? 'correct' : 'wrong',
    basis: rule.evidenceId,
    evaluator: 'deterministic-v2',
    authority: rule.authority
  };
}
export function classifyResponse(raw, question) {
  const value = raw.trim();
  if (!question || /[?？]|是不是|可能|也许|我猜|例如|题干|为什么|不知道|不确定/.test(value)) return 'discussion';
  if (question.answerType === 'field_key' || deriveFieldProbe(question.prompt))
    return fieldProbeAnswer(question, value)
      ? 'answer'
      : /^(?:我的答案是|我的答案[：:]|答案是)/.test(value)
        ? 'answer'
        : 'clarify';
  if (question.answerType === 'condition_implication' || deriveConditionProbe(question.prompt))
    return conditionProbeAnswer(value)
      ? 'answer'
      : /^(?:我的答案是|我的答案[：:]|答案是)/.test(value)
        ? 'answer'
        : 'clarify';
  if (question.answerType === 'condition_relation' || deriveConditionQuestion(question.prompt))
    return conditionAnswer(value)
      ? 'answer'
      : /^(?:我的答案是|我的答案[：:]|答案是)/.test(value)
        ? 'answer'
        : 'clarify';
  if (question.answerType === 'algebra' || question.validation?.type === 'algebra')
    return isAlgebraAnswer(question, value)
      ? 'answer'
      : /^(?:我的答案是|我的答案[：:]|答案是)/.test(value)
        ? 'answer'
        : 'clarify';
  if ((question.validation?.type || question.answerType) === 'choice')
    return /^(?:我(?:选|选择)|选择|答案[是为：:]?)?\s*[A-H](?:[、,\s]*[A-H])*[。.]?$/i.test(value)
      ? 'answer'
      : 'clarify';
  if ((question.validation?.type || question.answerType) === 'number')
    return ([EXACT_ARITHMETIC_CONTRACT, FRACTION_CONTRACT].includes(question.source?.evidenceId) ||
    ['material-objective-v2', 'material-objective-v3'].includes(question.materialExercise?.contract)
      ? parseExactNumberAnswer(value, question.validation?.unit || '')
      : parseNumberAnswer(value, question.validation?.unit || '')) !== null
      ? 'answer'
      : 'clarify';
  if ((question.validation?.type || question.answerType) === 'number_set')
    return parseNumberSet(value) !== null ? 'answer' : 'clarify';
  if ((question.validation?.type || question.answerType) === 'source_text')
    return /^(?:我的答案是|我的答案[：:]|答案是)/u.test(value) ? 'answer' : 'clarify';
  if (/^(?:我的答案是|我的答案[：:]|答案是|我认为)/.test(value)) return 'answer';
  return 'clarify';
}
export function summarizeLearning(state, time = Date.now(), options = {}) {
  const timezone = options.timezone || state.timezone;
  const day = options.day || dayKey(time, timezone);
  assert(!options.range || ['day', 'history'].includes(options.range), 'INVALID_INPUT', '统计范围不支持');
  const session = options.conversationId ? state.conversations.find((c) => c.id === options.conversationId) : null;
  assert(!options.conversationId || session, 'NOT_FOUND', '统计目标不存在');
  const attempts = state.attempts.filter(
    (a) => (!session || a.conversationId === session.id) && (options.range !== 'day' || dayKey(a.at, timezone) === day)
  );
  const scopedKeys = session
    ? new Set([
        session.activeQuestionKey,
        ...session.messages.map((m) => m.questionKey),
        ...state.attempts.filter((a) => a.conversationId === session.id).map((a) => a.questionKey),
        ...(session.trainingGroups || []).flatMap((g) => g.questionKeys)
      ])
    : null;
  const firstByQuestion = new Map();
  for (const attempt of attempts) {
    // 首次正式作答的口径不会因重做或更正新增分母。
    if (attempt.kind === 'first' && !firstByQuestion.has(attempt.questionKey))
      firstByQuestion.set(attempt.questionKey, attempt);
  }
  const first = [...firstByQuestion.values()].filter((attempt) => effectiveGrade(attempt).status === 'reliable');
  const wrong = first.filter((attempt) => effectiveGrade(attempt).outcome === 'wrong');
  const partial = first.filter((attempt) => effectiveGrade(attempt).outcome === 'partial');
  const plans = state.plans.filter(
    (plan) => plan.day === day && (!session || !plan.conversationId || plan.conversationId === session.id)
  );
  const plan = options.planId
    ? plans.find((item) => item.id === options.planId)
    : (session ? plans.filter((p) => p.conversationId === session.id).at(-1) : null) || plans.at(-1);
  const tasks = (plan?.tasks || []).filter(
    (task) => !scopedKeys || plan.conversationId === session?.id || scopedKeys.has(task.questionKey)
  );
  const completed = tasks.filter((task) => task.completedBy).length;
  const denominator = tasks.length;
  const mistakes = attempts.filter(
    (attempt) => effectiveGrade(attempt).status === 'reliable' && effectiveGrade(attempt).outcome === 'wrong'
  );
  const knowledge = {};
  for (const attempt of attempts) {
    const question = state.questions.find((item) => questionKey(item) === attempt.questionKey);
    const key = knowledgeScope(question);
    if (effectiveGrade(attempt).status !== 'reliable') continue;
    const previous = knowledge[key];
    const outcome = effectiveGrade(attempt).outcome;
    const status =
      outcome !== 'correct'
        ? '待复测'
        : attempt.hints.length
          ? '需提示'
          : ['review', 'variant', 'redo'].includes(attempt.kind)
            ? '待复测'
            : '可独立完成';
    knowledge[key] = { status, evidenceIds: [...(previous?.evidenceIds || []), attempt.id] };
  }
  return {
    day,
    timezone,
    first: {
      numerator: wrong.length,
      denominator: first.length,
      partial: partial.length,
      rate: first.length ? wrong.length / first.length : null,
      evidenceIds: first.map((a) => a.id),
      smallSample: first.length < 20
    },
    tasks: {
      planId: plan?.id || null,
      version: plan?.version || 0,
      numerator: completed,
      denominator,
      rate: denominator ? completed / denominator : null
    },
    mistakes,
    pending: attempts.filter((a) => effectiveGrade(a).status !== 'reliable').length,
    validAnswers: attempts.filter((a) => effectiveGrade(a).status === 'reliable' && dayKey(a.at, timezone) === day)
      .length,
    totalReliableAnswers: attempts.filter((a) => effectiveGrade(a).status === 'reliable').length,
    reliableCorrectAnswers: attempts.filter(
      (a) => effectiveGrade(a).status === 'reliable' && effectiveGrade(a).outcome === 'correct'
    ).length,
    knowledge,
    due: reviewFacts(state, time)
      .filter(
        (r) =>
          r.kind !== 'coach' &&
          r.kind !== 'coach_error' &&
          r.availableAt <= time &&
          !r.cancelled &&
          !r.completedBy &&
          (!scopedKeys || scopedKeys.has(r.questionKey))
      )
      .map((r) => state.reviews.find((original) => original.id === r.id))
  };
}

// 每个修改具有稳定 opId。所有修改先在副本中完成，再由 repository 原子保存。
function reduceLearningOperation(original, operation, owned = false, budget = null) {
  assert(original.version === LEARNING_VERSION, 'SCHEMA_VERSION', '学习数据版本不支持');
  // 字段题操作不保存可伪造的答案；每次新重放从之前已导入的资料重建，重复操作沿原收据返回。
  if (operation.type === 'question.add' && operation.data?.question?.materialExercise)
    operation = {
      ...operation,
      data: { ...operation.data, question: { ...operation.data.question, validation: null } }
    };
  const opId = text(operation.id, 160);
  const previousEvent = budget?.eventIndex
    ? budget.eventIndex.get(opId)
    : original.events.find((event) => event.id === opId);
  if (previousEvent) {
    assert(
      previousEvent.type !== 'privacy.redacted' || operation.type === 'privacy.redacted',
      'DELETED_DATA',
      '该操作的关联资料已删除，旧请求不会恢复内容'
    );
    assert(
      previousEvent.type === operation.type &&
        (samePrivacyRedaction(previousEvent, operation) ||
          !previousEvent.data ||
          operationFingerprint(previousEvent.data) === operationFingerprint(operation.data || {})),
      'IDEMPOTENCY_CONFLICT',
      '同一操作标识对应不同内容'
    );
    return { state: original, reused: true, result: previousEvent.result };
  }
  const state = owned ? original : clone(original);
  const previousRevision = state.revision;
  const now = operation.at ?? Date.now();
  assert(Number.isFinite(now), 'INVALID_INPUT', '时间不合法');
  const data = operation.data || {};
  let result = {},
    attemptBudget = null;
  const current = () => {
    const session = state.conversations.find((item) => item.id === data.conversationId);
    assert(session, 'NOT_FOUND', '对话不存在');
    return session;
  };
  if (data.proposalId !== undefined) {
    assert(
      ['profile.set', 'plan.set', 'reminder.set', ...ENTRY_EVENTS].includes(operation.type),
      'FORBIDDEN',
      '建议不能执行其他操作'
    );
    assert(opId === `${data.proposalId}:accept`, 'FORBIDDEN', '确认必须使用原候选标识');
    assertLearningProposalAcceptance(state, operation.type, data, { assert, fingerprint: operationFingerprint, now });
  }
  switch (operation.type) {
    case 'review.batch.start':
    case 'review.open':
    case 'review.skip':
    case 'review.reschedule':
    case 'learning.leave':
    case 'review.idea.suggest': {
      result = applyAdherenceOperation(state, { id: opId, type: operation.type, at: now, data }, { assert });
      break;
    }
    case 'goal.revise':
    case 'goal.close':
    case 'goal.reopen':
    case 'goal.pause':
    case 'goal.resume':
    case 'idea.keep':
    case 'idea.update':
    case 'profile.retract': {
      result = applyEntryOperation(state, { ...operation, id: opId, at: now, data }, { assert });
      break;
    }
    case 'intake.request': {
      assert(data.explicit === true, 'EXPLICIT_REQUIRED', '请明确开始模型建档');
      const previous = state.intake;
      const turns =
        data.answer !== undefined
          ? [...(previous?.turns || []), { question: previous?.reply?.message, answer: data.answer }]
          : data.reset === true || previous?.acceptedConversationId
            ? []
            : previous?.turns || [];
      if (data.answer !== undefined)
        assert(
          previous?.status === 'ready' && !previous.acceptedConversationId,
          'INVALID_STATE',
          '当前没有待回答的问题'
        );
      if (data.answer !== undefined && previous?.contract === MODEL_INTAKE_V2_CONTRACT)
        assert(!intakeFinished(previous), 'INVALID_STATE', '方向尚未确定，请重新选择；未追加第三轮问题');
      if (data.answer !== undefined && data.contract !== undefined)
        assert(
          data.contract === (previous?.contract || 'model-intake-v1'),
          'CONTEXT_CHANGED',
          '请沿原建档合同回答或明确重新开始'
        );
      if (data.answer !== undefined && data.scopeContract !== undefined)
        assert(data.scopeContract === previous?.scopeContract, 'CONTEXT_CHANGED', '考试范围合同已变化，请重新开始');
      const context = normalizeIntakeContext({
        turns,
        ...(data.scopeContract !== undefined
          ? { scopeContract: data.scopeContract }
          : !data.reset && !previous?.acceptedConversationId && previous?.scopeContract
            ? { scopeContract: previous.scopeContract }
            : {}),
        ...(data.contract !== undefined
          ? { contract: data.contract }
          : !data.reset && previous?.contract
            ? { contract: previous.contract }
            : {})
      });
      if (data.binding !== undefined)
        assert(context.contract === MODEL_INTAKE_V2_CONTRACT, 'INVALID_INPUT', '建档关联需要新版合同');
      state.intake = {
        requestId: text(data.requestId, 160),
        modelId: text(data.modelId, 160),
        ...context,
        ...(data.binding !== undefined ? { binding: text(data.binding, 100) } : {}),
        status: 'pending',
        reply: null,
        at: now
      };
      result = state.intake;
      break;
    }
    case 'intake.result': {
      assert(
        state.intake?.requestId === data.requestId &&
          state.intake.modelId === data.modelId &&
          (state.intake.binding === undefined || state.intake.binding === data.binding) &&
          ['pending', 'failed'].includes(state.intake.status),
        'CONTEXT_CHANGED',
        '旧模型建档回复不再适用'
      );
      state.intake.reply = normalizeIntakeReply(data.reply, !state.intake.turns.length, state.intake);
      state.intake.status = 'ready';
      state.intake.finalFailure = false;
      result = state.intake.reply;
      break;
    }
    case 'intake.failed': {
      assert(state.intake?.requestId === data.requestId, 'CONTEXT_CHANGED', '建档请求已变化');
      state.intake.status = 'failed';
      state.intake.finalFailure = data.final === true;
      break;
    }
    case 'intake.accept': {
      assert(
        data.explicit === true && state.intake?.status === 'ready' && state.intake.reply?.intake?.profile,
        'EXPLICIT_REQUIRED',
        '请先确认模型提出的学习档案'
      );
      const profile = normalizeStudyProfile(state.intake.reply.intake.profile);
      const subjectMethod = subjectCoachMethodByContract(data.coachMethod);
      assert(
        data.coachMethod === undefined || subjectMethod?.intakeEligible(state.intake),
        'INVALID_INPUT',
        '教学方法与本次明确回答不符'
      );
      assert(!state.intake.acceptedConversationId, 'ALREADY_ACCEPTED', '此学习档案已经确认');
      const messages = state.intake.turns.flatMap((turn, index) => [
        { id: `${opId}:intake:${index}:q`, role: 'assistant', content: turn.question, at: now },
        { id: `${opId}:intake:${index}:a`, role: 'user', content: turn.answer, at: now }
      ]);
      const conversation = {
        id: opId,
        goal: profile.goal,
        at: now,
        messages,
        studyProfile: profile,
        activeQuestionKey: null,
        pendingHints: [],
        stopped: false
      };
      state.conversations.push(conversation);
      if (subjectMethod || ['english1', 'english2', 'cs408'].includes(profile.exam)) {
        applyWritingCoachOperation(
          state,
          { id: `${opId}:coach`, type: 'coach.begin', at: now, data: { conversationId: opId, explicit: true } },
          { assert, dayKey }
        );
        applyWritingCoachOperation(
          state,
          {
            id: `${opId}:profile`,
            type: 'coach.profile',
            at: now,
            data: {
              conversationId: opId,
              explicit: true,
              profile: {
                ...profile,
                ...(subjectMethod ? { exam: subjectMethod.exam, methodContract: subjectMethod.contract } : {}),
                subjects: [subjectMethod?.subjectId || (profile.exam === 'cs408' ? 'kaoyan_major' : 'kaoyan_english')],
                minutes: profile.minutes,
                track:
                  subjectMethod?.track || (profile.exam === 'cs408' ? 'kaoyan-cs-material' : 'kaoyan-english-writing')
              }
            }
          },
          { assert, dayKey }
        );
      }
      state.intake.acceptedConversationId = opId;
      result = conversation;
      break;
    }
    case 'coach.begin':
    case 'coach.profile':
    case 'coach.material':
    case 'coach.request':
    case 'coach.closeRequest':
    case 'coach.reassess':
    case 'coach.result':
    case 'coach.answer':
    case 'coach.errorAnswer':
    case 'coach.review':
    case 'coach.analysis':
    case 'coach.paragraph':
    case 'coach.essaySubmit':
    case 'coach.rewriteAnswer':
    case 'coach.adopt':
    case 'coach.finish':
    case 'coach.survey': {
      result = applyWritingCoachOperation(state, { ...operation, id: opId, at: now, data }, { assert, dayKey });
      break;
    }
    case 'reminder.set':
    case 'reminder.complete':
    case 'reminder.cancel':
    case 'reminder.receipt': {
      result = applyReminderOperation(
        state,
        { ...operation, id: opId, at: now, data },
        { assert, dayKey, normalizeSchedule: normalizeEntrySchedule }
      );
      break;
    }
    case 'journey.configure':
    case 'training.open':
    case 'training.complete':
    case 'recap.confirm': {
      result = applyJourneyOperation(
        state,
        { ...operation, id: opId, at: now, data },
        { assert, dayKey, questionKey, effectiveGrade }
      );
      break;
    }
    case 'conversation.start': {
      const goal = text(data.goal, 1000);
      const conversation = {
        id: opId,
        goal,
        at: now,
        messages: [],
        activeQuestionKey: null,
        pendingHints: [],
        stopped: false
      };
      if (data.task !== undefined) conversation.task = normalizeLearningTask(data.task);
      state.conversations.push(conversation);
      result = conversation;
      break;
    }
    case 'message.add': {
      const session = current();
      assert(['user', 'assistant', 'tool', 'notice'].includes(data.role), 'INVALID_INPUT', '消息角色不合法');
      session.messages.push({
        id: opId,
        role: data.role,
        content: text(data.content),
        ...(data.proposal
          ? {
              proposal: normalizeLearningProposal(state, data.proposal, session.id, now, {
                assert,
                dayKey,
                preview: (type, proposalData) =>
                  reduceLearningOperation(state, { id: `${opId}:preview`, type, data: proposalData, at: now })
              })
            }
          : {}),
        ...(data.contentBlocks ? { contentBlocks: normalizeContentBlocks(data.contentBlocks) } : {}),
        at: now,
        questionKey: data.questionKey || session.activeQuestionKey,
        attemptId: data.attemptId || null,
        executionId: data.executionId || null
      });
      result = { messageId: opId };
      break;
    }
    case 'model.request': {
      const session = current();
      assert(
        session.messages.filter((m) => m.role === 'user').at(-1)?.id === data.messageId,
        'PRECONDITION',
        '模型请求必须绑定明确的最近用户消息'
      );
      assert(
        (session.activeQuestionKey || null) === data.questionKey &&
          typeof data.modelId === 'string' &&
          /^[a-zA-Z0-9_-]{1,60}$/.test(data.modelId) &&
          typeof data.model === 'string' &&
          data.model.length > 0 &&
          data.model.length <= 120 &&
          typeof data.requestId === 'string' &&
          /^[a-zA-Z0-9_:-]{1,150}$/.test(data.requestId) &&
          typeof data.binding === 'string' &&
          /^[a-zA-Z0-9_-]{8,100}$/.test(data.binding),
        'INVALID_INPUT',
        '模型请求关联不合法'
      );
      assert(
        Object.keys(data).every((k) =>
          [
            'conversationId',
            'messageId',
            'questionKey',
            'modelId',
            'model',
            'requestId',
            'binding',
            'historyOnly',
            'lockedMethod',
            'feedbackAttemptId',
            'feedbackOutputContract',
            'presentationContract',
            'visualSource'
          ].includes(k)
        ),
        'INVALID_INPUT',
        '模型请求不保存消息正文或密钥'
      );
      if (data.feedbackAttemptId) {
        const q = state.questions.find((q) => questionKey(q) === data.questionKey);
        const attempt = state.attempts
          .filter((a) => a.conversationId === session.id && a.questionKey === data.questionKey)
          .at(-1);
        assert(
          (q?.writingExercise ||
            (q?.vocabularyReview?.phase === 'usage' &&
              vocabularyUseFeedbackBasis(q, state) &&
              !attempt?.corrections?.length)) &&
            !session.stopped &&
            (!EXTENDED_WRITING_CONTRACTS.includes(q?.writingExercise?.contract) || !attempt?.corrections?.length) &&
            attempt?.id === data.feedbackAttemptId,
          'PRECONDITION',
          '反馈请求需绑定当前已保存原答'
        );
      }
      assert(
        data.presentationContract === undefined ||
          (data.presentationContract === PRESENTATION_CONTRACT && !data.feedbackAttemptId && !data.visualSource),
        'INVALID_INPUT',
        '展示合同不能混入评分或图片请求'
      );
      assert(
        data.feedbackOutputContract === undefined ||
          (data.feedbackOutputContract === WRITING_FEEDBACK_OUTPUT_CONTRACT && data.feedbackAttemptId),
        'INVALID_INPUT',
        '写作反馈输出版本需绑定当前已保存原答'
      );
      if (data.visualSource) {
        const q = state.questions.find((q) => questionKey(q) === data.questionKey);
        assert(
          matchesVisualSource(data.visualSource, q?.source),
          'IMAGE_SOURCE_MISMATCH',
          '图片请求必须关联当前题目的资料版本'
        );
      }
      result = { requestId: data.requestId, recorded: true, modelExecuted: false };
      break;
    }
    case 'question.add': {
      const q = clone(data.question);
      assert(q && q.id && Number.isInteger(q.version) && q.version > 0, 'INVALID_INPUT', '题目版本不合法');
      validateQuizOriginalQuestion(q);
      assert(!q.writingExercise || !q.validation, 'FORBIDDEN', '通知任务不能声明客观判分权限');
      text(q.prompt);
      assert(
        !(state.materialDeletions || []).some(
          (d) =>
            (d.materialIds || [d.materialId]).includes(q.source?.materialId) ||
            d.questionKeys.includes(q.parentQuestionKey) ||
            d.questionKeys.includes(q.prerequisite?.originalQuestionKey) ||
            d.questionKeys.includes(questionKey(q))
        ),
        'DELETED_DATA',
        '题目关联资料已删除，旧结果不会写入'
      );
      assert(['private', 'generated', 'official', 'legacy'].includes(q.scope), 'INVALID_INPUT', '题目范围不合法');
      assert(!state.questions.some((item) => questionKey(item) === questionKey(q)), 'CONFLICT', '题目版本已存在');
      q.publishable = false; // 私人学习入口永远不能发布旧公共库。
      if (q.scope === 'generated' && q.validation?.authority !== 'executable') q.validation = null;
      if (q.source?.kind !== 'existing_bank') {
        normalizeAlgebraQuestion(q);
        normalizeConditionQuestion(q);
        normalizeConditionProbe(q);
        normalizeFieldProbe(q);
        normalizeExactArithmeticQuestion(q);
        normalizeFractionQuestion(q);
      } else q.validation = null;
      if (q.materialExercise) normalizeMaterialObjective(q, state);
      assert(
        validPrerequisiteQuestion(q, state),
        'INVALID_INPUT',
        '先修诊断必须关联真实错答或未完整作答和受支持的基础小题'
      );
      if (q.rubric) {
        assert(q.answerType === 'subjective' && !q.validation, 'INVALID_INPUT', '主观评分维度不能替代客观校验规则');
        q.rubric = normalizeRubric(q.rubric);
      }
      if (
        q.writingExercise ||
        (q.source?.kind === 'project_original' &&
          [NOTICE_CONTRACT, GUIDED_WRITING_CONTRACT, ...EXTENDED_WRITING_CONTRACTS].includes(q.source.reference))
      )
        normalizeWritingQuestion(q, state, now);
      if (
        q.scienceExercise ||
        (q.source?.kind === 'project_original' &&
          [
            SCIENCE_TRANSFER_CONTRACT,
            MOTION_TRANSFER_CONTRACT,
            GRAPH_TRANSFER_CONTRACT,
            ENERGY_TRANSFER_CONTRACT,
            DENSITY_TRANSFER_CONTRACT,
            PRESSURE_TRANSFER_CONTRACT
          ].includes(q.source.reference))
      )
        normalizeScienceQuestion(q, state, now);
      if (q.sentenceExercise || q.source?.reference === SENTENCE_CONTRACT) normalizeSentenceQuestion(q, state, now);
      normalizeOatutorQuestion(q, state);
      if (q.vocabularyExercise || (q.source?.kind === 'project_original' && q.source.reference === VOCABULARY_CONTRACT))
        normalizeVocabularyQuestion(q, state);
      if (
        q.vocabularyReview ||
        [VOCABULARY_REVIEW_CONTRACT, VOCABULARY_SPACED_REVIEW_CONTRACT].includes(q.source?.reference)
      )
        normalizeVocabularyReviewQuestion(q, state, now);
      if (q.rubricRevisionOf) {
        const previous = state.questions.find((item) => questionKey(item) === q.rubricRevisionOf);
        assert(
          q.rubric &&
            previous?.id === q.id &&
            previous.version < q.version &&
            previous.prompt === q.prompt &&
            previous.answerType === 'subjective',
          'PRECONDITION',
          '维度修订必须关联同一道主观题的原版本'
        );
      }
      state.questions.push(q);
      result = { questionKey: questionKey(q) };
      break;
    }
    case 'question.focus': {
      const session = current();
      assert(
        state.questions.some((q) => questionKey(q) === data.questionKey),
        'NOT_FOUND',
        '题目不存在'
      );
      const noticeQuestion = state.questions.find((q) => questionKey(q) === data.questionKey);
      assert(
        !noticeQuestion.oatutorExercise || noticeQuestion.oatutorExercise.conversationId === session.id,
        'FORBIDDEN',
        '带练属于另一对话'
      );
      assert(
        !noticeQuestion.writingExercise || noticeQuestion.writingExercise.conversationId === session.id,
        'FORBIDDEN',
        '通知任务属于另一对话'
      );
      assert(
        !noticeQuestion.scienceExercise || noticeQuestion.scienceExercise.conversationId === session.id,
        'FORBIDDEN',
        '检验属于另一对话'
      );
      assert(
        !noticeQuestion.vocabularyExercise || noticeQuestion.vocabularyExercise.conversationId === session.id,
        'FORBIDDEN',
        '认词属于另一对话'
      );
      assert(
        !noticeQuestion.vocabularyReview || noticeQuestion.vocabularyReview.conversationId === session.id,
        'FORBIDDEN',
        '词语任务属于另一对话'
      );
      assert(
        !noticeQuestion.sentenceExercise || noticeQuestion.sentenceExercise.conversationId === session.id,
        'FORBIDDEN',
        '句子任务属于另一对话'
      );
      // 导航不结束一次尝试。按题目暂存帮助，跨页面/对话返回仍参与下一次作答。
      session.helpQueues ||= [];
      if (session.activeQuestionKey) {
        session.helpQueues = session.helpQueues.filter((entry) => entry.questionKey !== session.activeQuestionKey);
        if (session.pendingHints.length)
          session.helpQueues.push({ questionKey: session.activeQuestionKey, hints: session.pendingHints });
      }
      session.pendingHints = [];
      session.activeQuestionKey = data.questionKey;
      session.pendingHints = pendingHelp(state, data.questionKey);
      const focused = state.questions.find((q) => questionKey(q) === data.questionKey);
      if (focused.oatutorExercise) {
        session.pendingHints = [
          ...new Map(
            [...session.pendingHints, ...oatutorHelpForQuestion(state, focused)].map((h) => [h.id, h])
          ).values()
        ];
      }
      if (focused.rubricRevisionOf) {
        const origins = rubricOrigins(state, focused);
        const inherited = [
          ...origins.flatMap((key) => pendingHelp(state, key)),
          ...state.attempts.filter((a) => origins.includes(a.questionKey)).flatMap((a) => a.hints)
        ];
        session.pendingHints = [...new Map([...session.pendingHints, ...inherited].map((h) => [h.id, h])).values()];
      }
      session.helpQueues = session.helpQueues.filter((entry) => entry.questionKey !== data.questionKey);
      assert(!data.kind || ['review', 'redo'].includes(data.kind), 'INVALID_INPUT', '继续作答类型不合法');
      session.nextAttemptKind = data.kind || null;
      result = { questionKey: data.questionKey };
      break;
    }
    case 'oatutor.node.open':
    case 'oatutor.scaffold.submit':
    case 'oatutor.reference.read':
    case 'oatutor.final.read': {
      result = applyOatutorOperation(state, { ...operation, at: now, data });
      if (result.reused) return { state: original, reused: true, result };
      break;
    }
    case 'hint.add': {
      const session = current();
      assert(session.activeQuestionKey && !session.stopped, 'PRECONDITION', '没有进行中的题目');
      if (Object.prototype.hasOwnProperty.call(data, 'referenceId')) {
        assert(
          Object.keys(data).every((key) =>
            ['conversationId', 'questionKey', 'referenceId', 'referenceVersion'].includes(key)
          ),
          'INVALID_INPUT',
          '参考阅读只接收当前题目与固定版本'
        );
        assert(session.activeQuestionKey === data.questionKey, 'CONTEXT_CHANGED', '请回到原写作后阅读参考');
        const reference = publicWritingReference(data.referenceId, data.referenceVersion);
        const q = state.questions.find((item) => questionKey(item) === data.questionKey);
        assert(
          q?.writingExercise?.conversationId === session.id &&
            q.writingExercise.contract ===
              (reference.genreId === 'email' ? EMAIL_WRITING_CONTRACT : GUIDED_WRITING_CONTRACT) &&
            q.writingExercise.genreId === reference.genreId,
          'CAPABILITY_UNAVAILABLE',
          `这段参考用于当前${reference.genreId === 'email' ? '英文邮件' : reference.genreId === 'narrative' ? '中文叙事' : '英文说明'}写作`
        );
        const created = state.events.find(
          (event) => event.type === 'question.add' && questionKey(event.data?.question || {}) === data.questionKey
        );
        normalizeWritingQuestion(
          q,
          { ...state, questions: state.questions.filter((item) => questionKey(item) !== data.questionKey) },
          created?.at ?? now
        );
        const previous = pendingHelp(state, data.questionKey).find(
          (hint) => hint.reference?.id === reference.id && hint.reference.version === reference.version
        );
        if (previous) return { state: original, reused: true, result: { hintId: previous.id } };
        writingHelp(state, session, {
          id: opId,
          level: 1,
          content:
            `${reference.title}\n${reference.author} · ${reference.publisher} · ${reference.license}\n${reference.excerpt}\n${reference.noteAuthor}写法批注：${reference.notes.map((note) => `${writingReferenceNoteLocation(note)} · ${note.label}：${note.text}`).join('\n')}` +
            (reference.teachingBasis
              ? `\n学习目标：${reference.teachingBasis.summary}\n${reference.teachingBasis.title} · 第${reference.teachingBasis.printedPage}页 · ${reference.teachingBasis.interpretationAuthor}转述`
              : ''),
          reference,
          questionKey: data.questionKey,
          at: now
        });
        result = { hintId: opId };
        break;
      }
      assert(
        !data.level || (Number.isInteger(data.level) && data.level >= 1 && data.level <= 3),
        'INVALID_INPUT',
        '提示层级须为1至3'
      );
      writingHelp(state, session, {
        id: opId,
        level: data.level || 1,
        content: text(data.content),
        questionKey: session.activeQuestionKey,
        at: now
      });
      result = { hintId: opId };
      break;
    }
    case 'vocabulary.open': {
      const session = current();
      assert(
        !session.stopped && session.activeQuestionKey === data.writingQuestionKey,
        'CONTEXT_CHANGED',
        '请回到原写作后认词'
      );
      assert(
        Object.keys(data).every((key) => ['conversationId', 'writingQuestionKey', 'word'].includes(key)),
        'INVALID_INPUT',
        '认词包含未知字段'
      );
      const parent = state.questions.find((q) => questionKey(q) === data.writingQuestionKey);
      const senseId = writingVocabularySense(parent, data.word);
      assert(senseId, 'CAPABILITY_UNAVAILABLE', '这个词尚未提供检验');
      const existing = state.questions.find(
        (q) =>
          q.vocabularyExercise?.writingQuestionKey === data.writingQuestionKey &&
          q.vocabularyExercise.senseId === senseId &&
          !state.attempts.some((a) => a.questionKey === questionKey(q))
      );
      if (existing) {
        normalizeVocabularyQuestion(existing, state);
        result = { questionKey: questionKey(existing) };
        break;
      }
      const q = createVocabularyQuestion(
        `${opId}_vocab`,
        session.id,
        data.writingQuestionKey,
        senseId,
        nextVocabularyContext(state, senseId)
      );
      normalizeVocabularyQuestion(q, state);
      const hints = clone(pendingHelp(state, data.writingQuestionKey));
      // 先快照认词之前的帮助，再记录选项作为写作支架。打开不增加作答或掌握。
      const hint = {
        id: opId,
        level: 1,
        content: `${q.prompt}\n${q.options.join('\n')}`,
        questionKey: data.writingQuestionKey,
        at: now
      };
      writingHelp(state, session, hint);
      state.questions.push(q);
      session.helpQueues ||= [];
      session.helpQueues.push({ questionKey: questionKey(q), hints });
      result = { questionKey: questionKey(q) };
      break;
    }
    case 'vocabulary.submit': {
      const session = current();
      assert(!session.stopped, 'STOPPED', '当前任务已停止');
      assert(
        Object.keys(data).every((key) => ['conversationId', 'questionKey', 'answer', 'explicit'].includes(key)) &&
          data.explicit === true,
        'INVALID_INPUT',
        '请选择并确认词义'
      );
      const q = state.questions.find((q) => questionKey(q) === data.questionKey);
      assert(q?.vocabularyExercise, 'NOT_FOUND', '认词题不存在');
      normalizeVocabularyQuestion(q, state);
      assert(
        q.vocabularyExercise.conversationId === session.id &&
          q.vocabularyExercise.writingQuestionKey === session.activeQuestionKey,
        'CONTEXT_CHANGED',
        '写作已切换，旧认词选择未保存'
      );
      assert(
        state.events.some((e) => e.type === 'vocabulary.open' && e.result?.questionKey === data.questionKey),
        'PRECONDITION',
        '请先打开认词题'
      );
      assert(!state.attempts.some((a) => a.questionKey === data.questionKey), 'CONFLICT', '本句已有作答');
      const answer = text(data.answer, 30),
        grade = gradeVocabularyAnswer(q, answer);
      assert(grade.status === 'reliable', 'INVALID_INPUT', '请选择一个词义');
      const attempt = {
        id: opId,
        conversationId: session.id,
        questionKey: data.questionKey,
        answer,
        at: now,
        kind: 'variant',
        parentAttemptId: null,
        hints: clone(pendingHelp(state, data.questionKey)),
        grade,
        corrections: [],
        taskId: null
      };
      state.attempts.push(attempt);
      session.helpQueues = (session.helpQueues || []).filter((entry) => entry.questionKey !== data.questionKey);
      const feedback = vocabularyFeedback(q, attempt);
      writingHelp(state, session, {
        id: opId,
        level: 1,
        content: feedback.message,
        questionKey: session.activeQuestionKey,
        at: now
      });
      result = { attemptId: opId, questionKey: data.questionKey, feedback };
      break;
    }
    case 'teaching.deliver': {
      const session = current();
      assert(
        !session.stopped && session.activeQuestionKey === data.questionKey,
        'CONTEXT_CHANGED',
        '题目已切换，教学结果未写入'
      );
      assert(
        state.questions.some((q) => questionKey(q) === data.questionKey),
        'NOT_FOUND',
        '教学须绑定已有题目'
      );
      assert(
        METHODS.includes(data.method) && ['local_tool', 'model_reply', 'upstream_reference'].includes(data.origin),
        'INVALID_INPUT',
        '教学方法或来源不合法'
      );
      assert(
        typeof data.helped === 'boolean' &&
          (!data.helped || (Number.isInteger(data.level) && data.level >= 1 && data.level <= 3)),
        'INVALID_INPUT',
        '教学帮助标记不合法'
      );
      assert(data.origin !== 'model_reply' || data.helped, 'INVALID_INPUT', '模型回复不能自行证明没有帮助');
      assert(
        data.origin === 'upstream_reference'
          ? data.helped === true && data.method === 'explain' && Boolean(data.upstreamReference)
          : !data.upstreamReference,
        'INVALID_INPUT',
        '工具建议必须记为本题帮助'
      );
      const upstreamReference = data.upstreamReference
        ? (data.upstreamReference.contract === 'grammar-reference-v1'
            ? normalizeGrammarReference
            : normalizeComputeReference)(data.upstreamReference, state, session.id, data.questionKey)
        : null;
      const content = upstreamReference
        ? (upstreamReference.contract === 'grammar-reference-v1' ? grammarReferenceText : computeReferenceText)(
            upstreamReference
          )
        : text(data.content);
      assert(!upstreamReference || data.content === content, 'INVALID_INPUT', '工具建议正文与来源不一致');
      const visualReading = data.visualReading
        ? (() => {
            const q = state.questions.find((q) => questionKey(q) === data.questionKey);
            assert(
              data.origin === 'model_reply' && matchesVisualSource(data.visualReading.source, q?.source),
              'IMAGE_SOURCE_MISMATCH',
              '图片解读须关联本题资料来源'
            );
            return normalizeSavedVisualReading(data.visualReading, data.visualReading.source);
          })()
        : null;
      const executionId = `${opId}:execution`;
      session.messages.push({
        id: opId,
        role: data.origin === 'model_reply' ? 'assistant' : 'tool',
        content,
        ...(data.contentBlocks ? { contentBlocks: normalizeContentBlocks(data.contentBlocks) } : {}),
        at: now,
        questionKey: data.questionKey,
        method: data.method,
        executionId,
        ...(upstreamReference ? { upstreamReference } : {}),
        ...(visualReading ? { visualReading } : {})
      });
      if (data.helped)
        writingHelp(state, session, {
          id: opId,
          level: data.level,
          content,
          questionKey: data.questionKey,
          origin: data.origin,
          ...(upstreamReference ? { upstreamReference } : {}),
          at: now
        });
      state.executions.push({
        id: executionId,
        tool: 'teaching',
        version: '1.0',
        status: data.historyOnly ? 'cancelled' : 'success',
        ...(data.historyOnly ? { errorCode: 'BACKUP_HISTORY_ONLY' } : {}),
        method: data.method,
        questionKey: data.questionKey,
        at: now
      });
      result = { messageId: opId, executionId, helped: data.helped };
      break;
    }
    case 'attempt.submit':
    case ORIGINAL_ANSWER_OPERATION: {
      const session = current();
      const training = session.trainingGroups?.find((g) => g.questionKeys.includes(session.activeQuestionKey));
      assert(
        !training || training.submittedBy || training.mode === 'guided' || data.trainingGroupId === training.id,
        'BATCH_REQUIRED',
        '这组训练需要统一交卷，单题草稿未提交'
      );
      assert(!training || dayKey(now, training.timezone) >= training.day, 'NOT_DUE', '此题组尚未到安排日期');
      assert(!session.stopped, 'STOPPED', '当前任务已停止');
      const q = state.questions.find((item) => questionKey(item) === session.activeQuestionKey);
      assert(q, 'PRECONDITION', '作答需要绑定明确题目');
      assert(
        operation.type !== ORIGINAL_ANSWER_OPERATION || data.explicit === true,
        'SUBMISSION_CONFIRMATION_REQUIRED',
        '原文作答需要明确提交，当前记录保留'
      );
      assert(
        operation.type !== ORIGINAL_ANSWER_OPERATION || q.writingExercise || q.vocabularyReview?.phase === 'usage',
        'PRECONDITION',
        '原文提交仅用于写作或明确的词语造句'
      );
      assert(!q.vocabularyExercise, 'PRECONDITION', '请在原写作中确认认词选择');
      assert(
        !q.vocabularyReview || q.vocabularyReview.conversationId === session.id,
        'FORBIDDEN',
        '词语任务属于另一对话'
      );
      assert(vocabularyRetestReady(q, now), 'NOT_DUE', '尚未到词义复测日期');
      if (q.vocabularyReview?.phase === 'retest')
        assert(
          !state.attempts.some((a) => a.questionKey === questionKey(q)),
          'CONFLICT',
          '本句已有作答，请另安排新语境'
        );
      assert(sentenceRetestReady(q, now), 'NOT_DUE', '尚未到句子复测日期');
      assert(
        !q.sentenceExercise || (typeof data.answer === 'string' && data.answer.length <= 500),
        'RESOURCE_LIMIT',
        '句子作答限500字符'
      );
      assert(scienceRetestReady(q, now), 'NOT_DUE', '尚未到复测日期');
      assert(writingRetestReady(q, now), 'NOT_DUE', '尚未到复测日期');
      assert(
        !(q.writingExercise || q.vocabularyReview?.phase === 'usage') ||
          (typeof data.answer === 'string' && data.answer.length <= writingAnswerLimit(q)),
        'RESOURCE_LIMIT',
        `写作限${writingAnswerLimit(q)}字符`
      );
      const validatedAnswer = text(data.answer);
      const answer =
        operation.type === ORIGINAL_ANSWER_OPERATION ||
        q.oatutorExercise ||
        training ||
        EXTENDED_WRITING_CONTRACTS.includes(q.writingExercise?.contract)
          ? data.answer
          : validatedAnswer;
      if (
        ((q.writingExercise || q.scienceExercise || q.vocabularyReview || q.sentenceExercise || q.oatutorExercise) &&
          data.explicit !== true) ||
        (!data.explicit && classifyResponse(answer, q) !== 'answer')
      ) {
        result = { clarification: true, message: '这句话是你的正式作答吗？确认后保存；不会直接记错。' };
        break;
      }
      const prior = state.attempts.filter((a) => a.questionKey === questionKey(q));
      const origins = new Set(rubricOrigins(state, q));
      const previousRubricAttempt = state.attempts.some((a) => origins.has(a.questionKey));
      const hints = [
        ...new Map(
          [...pendingHelp(state, questionKey(q)), ...oatutorHelpForQuestion(state, q)].map((h) => [h.id, h])
        ).values()
      ];
      const kind =
        data.kind ||
        (q.vocabularyReview ? (q.vocabularyReview.phase === 'retest' ? 'review' : 'variant') : null) ||
        (q.writingExercise?.contract === CHINESE_MATERIAL_ARGUMENT_CONTRACT && q.writingExercise.phase === 'retest'
          ? 'review'
          : null) ||
        session.nextAttemptKind ||
        (q.parentQuestionKey
          ? 'variant'
          : prior.length
            ? hints.length
              ? 'revision'
              : 'redo'
            : previousRubricAttempt
              ? 'redo'
              : 'first');
      if (q.vocabularyReview)
        assert(
          kind === (q.vocabularyReview.phase === 'retest' ? 'review' : 'variant'),
          'INVALID_INPUT',
          '词语任务不能新增首次作答'
        );
      if (q.writingExercise?.contract === CHINESE_MATERIAL_ARGUMENT_CONTRACT && q.writingExercise.phase === 'retest')
        assert(kind === 'review', 'INVALID_INPUT', '材料复测只能记录为复测作答');
      const parentAttemptId = data.parentAttemptId || (kind === 'revision' ? prior.at(-1)?.id : null);
      assert(['first', 'redo', 'revision', 'variant', 'review'].includes(kind), 'INVALID_INPUT', '作答类型不合法');
      assert(
        kind !== 'first' || (!prior.length && !previousRubricAttempt),
        'CONFLICT',
        '已有首次作答，修改维度不新增首答'
      );
      if (kind === 'revision')
        assert(
          prior.some((a) => a.id === parentAttemptId),
          'PRECONDITION',
          '修正需要原始作答'
        );
      // 作答只追加一份原答，并可更新对话提示、计划完成标记和规范题目。
      // 同一隔离批次精确计这几处的变化，避免每份原答都重数全部既有历史。
      if (budget)
        attemptBudget = {
          count: state.attempts.length,
          sections: ['conversations', 'plans', 'questions'].reduce(
            (total, key) => total + JSON.stringify(state[key]).length,
            0
          )
        };
      const attempt = {
        id: opId,
        conversationId: session.id,
        questionKey: questionKey(q),
        answer,
        at: now,
        kind,
        parentAttemptId,
        hints: clone(hints),
        grade: gradeAnswer(q, answer, state),
        corrections: [],
        taskId: data.taskId || null
      };
      state.attempts.push(attempt);
      for (const conversation of state.conversations) {
        if (conversation.activeQuestionKey === attempt.questionKey) conversation.pendingHints = [];
        if (conversation.helpQueues)
          conversation.helpQueues = conversation.helpQueues.filter(
            (entry) => entry.questionKey !== attempt.questionKey
          );
      }
      session.nextAttemptKind = null;
      for (const plan of state.plans)
        for (const task of plan.tasks) {
          if (
            task.questionKey === attempt.questionKey &&
            !task.completedBy &&
            (task.condition === 'submitted' ||
              (task.condition === 'independent_correct' &&
                attempt.grade.status === 'reliable' &&
                attempt.grade.outcome === 'correct' &&
                !attempt.hints.length))
          ) {
            task.completedBy = attempt.id;
          }
        }
      result = attempt;
      break;
    }
    case 'assessment.correct': {
      const a = state.attempts.find((item) => item.id === data.attemptId);
      assert(a, 'NOT_FOUND', '作答不存在');
      assert(['correct', 'wrong', 'partial', null].includes(data.outcome), 'INVALID_INPUT', '评估结果不合法');
      const reason = text(data.reason, 1000);
      a.corrections.push({
        id: opId,
        at: now,
        reason,
        grade: {
          status: 'pending',
          outcome: data.outcome,
          basis: opId,
          evaluator: 'user_correction',
          reviewRequired: true
        }
      });
      // 用户争议立即撤销可靠错题结论和调度，等待有依据的复核。
      state.reviews
        .filter((r) => r.attemptId === a.id)
        .forEach((r) => {
          r.cancelled = true;
        });
      for (const plan of state.plans)
        for (const task of plan.tasks) {
          if (task.completedBy === a.id && task.condition === 'independent_correct') task.completedBy = null;
        }
      if (state.strategy.source === 'observed' && state.strategy.evidenceIds?.includes(a.id))
        state.strategy = {
          ...state.strategy,
          method: 'check',
          difficulty: 'calibrated',
          reason: '相关作答已提出纠正，撤销旧策略判断；等待重新检验',
          evidenceIds: [],
          at: now
        };
      result = { attemptId: a.id, reviewRequired: true };
      break;
    }
    case 'assessment.assist': {
      const session = current();
      const attempt = state.attempts.find((a) => a.id === data.attemptId);
      assert(
        attempt?.conversationId === session.id && attempt.questionKey === session.activeQuestionKey,
        'FORBIDDEN',
        '辅助评估必须绑定当前对话的明确作答'
      );
      assert(
        ['correct', 'wrong', 'partial', 'uncertain'].includes(data.outcome),
        'INVALID_INPUT',
        '辅助评估结果不合法'
      );
      assert(
        Array.isArray(data.dimensions) && data.dimensions.length > 0 && data.dimensions.length <= 6,
        'INVALID_INPUT',
        '辅助评估需要明确评分维度'
      );
      const question = state.questions.find((q) => questionKey(q) === attempt.questionKey);
      assert(!question.writingExercise || !session.stopped, 'STOPPED', '当前任务已停止，未保存新反馈');
      const useFeedback =
        question.vocabularyReview?.phase === 'usage' && data.rubricContract === RUBRIC_EVIDENCE_CONTRACT
          ? vocabularyUseFeedbackBasis(question, state)
          : null;
      if (useFeedback || EXTENDED_WRITING_CONTRACTS.includes(question.writingExercise?.contract)) {
        assert(!session.stopped, 'STOPPED', '当前任务已停止，未保存新反馈');
        assert(
          !attempt.corrections?.length &&
            state.attempts
              .filter((a) => a.conversationId === session.id && a.questionKey === attempt.questionKey)
              .at(-1)?.id === attempt.id,
          'CONTEXT_CHANGED',
          useFeedback ? '原句已变化，请提交新的原句再获取反馈' : '原答已变化或已校对，请提交新原答再获取反馈'
        );
      }
      const rubricAssessment =
        question.rubric || useFeedback
          ? assessWithRubric(useFeedback ? { ...question, rubric: useFeedback.rubric } : question, attempt, data)
          : null;
      if (useFeedback) {
        const binding = { ...useFeedback };
        delete binding.rubric;
        rubricAssessment.vocabularyUse = binding;
      }
      if (!rubricAssessment) {
        assert(!data.rubricContract, 'PRECONDITION', '当前题目没有可定位评分引用的维度');
        assert(!data.rubricId, 'PRECONDITION', '当前题目没有匹配的评分维度');
        assert(
          data.dimensions.every((d) => d && Object.keys(d).every((key) => ['name', 'feedback'].includes(key))),
          'PRECONDITION',
          '未定义评分维度时只能给文字反馈，不能自行给分'
        );
      }
      const dimensions =
        rubricAssessment?.dimensions ||
        data.dimensions.map((d) => ({
          name: text(d.name, 100),
          feedback: text(d.feedback, 500)
        }));
      const assessment = {
        id: opId,
        at: now,
        status: 'ai_assisted',
        outcome: data.outcome,
        dimensions,
        ...(rubricAssessment || { contract: 'unscored-feedback-v1' }),
        feedback: text(data.feedback, 2000),
        evaluator: text(data.model || 'model', 160),
        basis: 'model_judgment_only',
        reviewRequired: true
      };
      (attempt.assistance ||= []).push(assessment);
      // 模型评估不覆盖可靠判分、不升级掌握、不创建可靠错题。
      result = { attemptId: attempt.id, assessmentId: opId, status: 'ai_assisted' };
      break;
    }
    case 'assessment.review': {
      const a = state.attempts.find((item) => item.id === data.attemptId);
      assert(a, 'NOT_FOUND', '作答不存在');
      assert(
        ['correct', 'wrong', 'partial'].includes(data.outcome) && data.evidenceId && data.reason,
        'PRECONDITION',
        '复核需要结果、理由和独立证据'
      );
      a.corrections.push({
        id: opId,
        at: now,
        reason: text(data.reason, 1000),
        grade: {
          status: 'reliable',
          outcome: data.outcome,
          basis: text(data.evidenceId, 160),
          evaluator: 'human_review'
        }
      });
      if (state.strategy.source === 'observed' && state.strategy.evidenceIds?.includes(a.id))
        state.strategy = {
          ...state.strategy,
          method: 'check',
          difficulty: 'calibrated',
          reason: '相关判分依据已更正，撤销旧策略判断；等待重新检验',
          evidenceIds: [],
          at: now
        };
      for (const plan of state.plans)
        for (const task of plan.tasks) {
          if (task.questionKey === a.questionKey && task.condition === 'independent_correct') {
            const valid = state.attempts.find(
              (other) =>
                other.questionKey === task.questionKey &&
                effectiveGrade(other).status === 'reliable' &&
                effectiveGrade(other).outcome === 'correct' &&
                !other.hints.length
            );
            task.completedBy = valid?.id || null;
          }
        }
      result = { attemptId: a.id };
      break;
    }
    case 'plan.set': {
      assert(Array.isArray(data.tasks) && data.tasks.length <= 100, 'INVALID_INPUT', '计划最多 100 个任务');
      const timezone = data.timezone === undefined ? state.timezone : data.timezone;
      const defaultDay = validateTimezone(now, timezone, '计划时区不合法');
      const day = data.day || defaultDay;
      assert(/^\d{4}-\d{2}-\d{2}$/.test(day), 'INVALID_INPUT', '日期不合法');
      if (data.conversationId) current();
      const previous = state.plans
        .filter((p) => p.day === day && (p.conversationId || null) === (data.conversationId || null))
        .at(-1);
      const tasks = data.tasks.map((task, index) => {
        assert(
          ['submitted', 'independent_correct', 'manual'].includes(task.condition),
          'INVALID_INPUT',
          '任务完成条件不合法'
        );
        return {
          id: task.id || `${opId}_${index}`,
          title: text(task.title, 500),
          questionKey: task.questionKey || null,
          condition: task.condition,
          ...(task.privacyRemoved ? { privacyRemoved: true } : {}),
          completedBy:
            previous?.tasks.find(
              (t) => t.id === task.id && t.condition === task.condition && t.questionKey === (task.questionKey || null)
            )?.completedBy || null
        };
      });
      assert(new Set(tasks.map((t) => t.id)).size === tasks.length, 'INVALID_INPUT', '任务标识重复');
      result = {
        id: opId,
        ...(data.conversationId ? { conversationId: data.conversationId } : {}),
        day,
        timezone,
        version: (previous?.version || 0) + 1,
        replaces: previous?.id || null,
        reason: text(data.reason || '用户调整计划', 1000),
        tasks,
        at: now
      };
      state.plans.push(result);
      break;
    }
    case 'plan.merge': {
      assert(Array.isArray(data.planIds) && data.planIds.length === 2, 'INVALID_INPUT', '合并需要两份已有计划');
      const plans = data.planIds.map((id) => state.plans.find((p) => p.id === id));
      assert(
        plans.every(Boolean) &&
          plans[0].day === plans[1].day &&
          (plans[0].conversationId || null) === (plans[1].conversationId || null),
        'PRECONDITION',
        '只能合并同一天的已有计划'
      );
      const tasks = new Map();
      for (const plan of plans)
        for (const task of plan.tasks) {
          const prior = tasks.get(task.id);
          assert(
            !prior || (prior.condition === task.condition && prior.questionKey === task.questionKey),
            'CONFLICT',
            '同一任务标识对应不同条件，原计划保留'
          );
          tasks.set(task.id, prior ? { ...prior, completedBy: prior.completedBy || task.completedBy } : clone(task));
        }
      assert(tasks.size <= 100, 'RESOURCE_LIMIT', '合并后的计划不能超过 100 项任务');
      const previous = state.plans
        .filter((p) => p.day === plans[0].day && (p.conversationId || null) === (plans[0].conversationId || null))
        .at(-1);
      result = {
        id: opId,
        ...(plans[0].conversationId ? { conversationId: plans[0].conversationId } : {}),
        day: plans[0].day,
        timezone: state.timezone,
        version: previous.version + 1,
        replaces: previous.id,
        sourcePlanIds: [...data.planIds],
        reason: text(data.reason, 1000),
        tasks: [...tasks.values()],
        at: now
      };
      state.plans.push(result);
      break;
    }
    case 'task.complete': {
      const task = state.plans.find((p) => p.id === data.planId)?.tasks.find((t) => t.id === data.taskId);
      assert(!task?.privacyRemoved, 'DELETED_DATA', '关联资料已删除的任务不能标为完成');
      assert(task?.condition === 'manual', 'PRECONDITION', '此任务需要实际作答完成');
      task.completedBy = opId;
      result = { taskId: task.id };
      break;
    }
    case 'profile.set': {
      assert(['self_report', 'observed', 'inferred'].includes(data.source), 'INVALID_INPUT', '画像依据类型不合法');
      assert(
        ['goal', 'foundation', 'difficulty', 'minutes', 'preference', 'deadline'].includes(data.field),
        'INVALID_INPUT',
        '画像字段不合法'
      );
      if (data.field === 'deadline')
        assert(
          typeof data.value === 'string' &&
            /^\d{4}-\d{2}-\d{2}$/.test(data.value) &&
            Number.isFinite(Date.parse(data.value + 'T00:00:00Z')) &&
            new Date(data.value + 'T00:00:00Z').toISOString().slice(0, 10) === data.value,
          'INVALID_INPUT',
          '目标日期不合法'
        );
      const entry = {
        id: opId,
        field: data.field,
        value: text(String(data.value), 1000),
        scope: text(data.scope || '当前任务', 160),
        source: data.source,
        evidenceIds: data.evidenceIds || [],
        at: now
      };
      if (entry.source !== 'self_report')
        assert(
          entry.evidenceIds.every((id) => state.attempts.some((a) => a.id === id)) && entry.evidenceIds.length,
          'PRECONDITION',
          '观察和推测需要实际作答证据'
        );
      if (data.conversationId) {
        current();
        entry.conversationId = data.conversationId;
        for (const prior of state.profile)
          if (
            prior.conversationId === data.conversationId &&
            prior.field === entry.field &&
            !prior.retractedBy &&
            !prior.supersededBy
          ) {
            prior.supersededBy = opId;
            entry.supersedes = prior.id;
          }
      }
      state.profile.push(entry);
      if (data.field === 'goal' && data.conversationId) current().goal = entry.value;
      result = entry;
      break;
    }
    case 'strategy.set': {
      assert(METHODS.includes(data.method), 'INVALID_INPUT', '教学方法不支持');
      assert(
        !data.source || ['self_report', 'observed', 'model'].includes(data.source),
        'INVALID_INPUT',
        '策略依据类型不合法'
      );
      if (data.conversationId) current();
      const previous = conversationStrategy(state, data.conversationId);
      const locked = requestedTeachingMethod(state, data.conversationId);
      if (locked && data.source && data.source !== 'self_report') {
        assert(data.method === locked, 'USER_PREFERENCE', '本轮应遵循用户明确指定的方法');
        result = previous;
        break;
      }
      assert(
        ['self_report', 'easier', 'harder', 'calibrated'].includes(data.difficulty || 'self_report'),
        'INVALID_INPUT',
        '难度不合法'
      );
      const evidenceIds = data.evidenceIds || [];
      assert(
        Array.isArray(evidenceIds) &&
          (!data.source || evidenceIds.length <= 6) &&
          evidenceIds.every((id) => state.attempts.some((a) => a.id === id)),
        'INVALID_INPUT',
        '策略证据不存在'
      );
      state.strategy = {
        method: data.method,
        difficulty: data.difficulty || previous.difficulty,
        reason: text(data.reason, 1000),
        evidenceIds,
        ...(data.source ? { source: data.source } : {}),
        ...(data.conversationId ? { conversationId: data.conversationId } : {}),
        stopped: previous.stopped,
        at: now
      };
      result = state.strategy;
      // 兼容旧事件；新宿主只在教学实际交付时记录帮助，失败不制造成功事实。
      if (data.method === 'diagram' && data.conversationId && !data.deliveryManaged) {
        const session = current();
        const q = state.questions.find((q) => questionKey(q) === session.activeQuestionKey);
        if (q?.source?.kind === 'executable' && /^计算 [+-]?\d{1,5} \+ [+-]?\d{1,5}。$/.test(q.prompt))
          session.pendingHints.push({
            id: `${opId}:diagram`,
            level: 1,
            content: '有限整数数轴图形与结果提示',
            at: now
          });
      }
      break;
    }
    case 'strategy.auto': {
      const session = current();
      assert(data.source === 'self_report', 'FORBIDDEN', '恢复自动教法须由用户明确要求');
      state.strategy = {
        method: 'question',
        difficulty: 'self_report',
        reason: '用户明确恢复自动教法；后续按本对话的可靠作答调整',
        evidenceIds: [],
        conversationId: session.id,
        stopped: session.stopped,
        at: now
      };
      result = state.strategy;
      break;
    }
    case 'task.resume': {
      const session = current();
      assert(data.source === 'self_report', 'FORBIDDEN', '继续任务须由用户明确要求');
      assert(!session.goalLifecycle, 'STOPPED', '已结束目标需要明确重开');
      session.stopped = false;
      state.strategy = conversationStrategy(state, session.id);
      result = { stopped: false };
      break;
    }
    case 'task.stop': {
      current().stopped = true;
      state.strategy = conversationStrategy(state, data.conversationId);
      result = { stopped: true };
      break;
    }
    case 'material.add': {
      assert(
        !(state.materialDeletions || []).some((d) => (d.materialIds || [d.materialId]).includes(data.material?.id)),
        'DELETED_DATA',
        '资料已删除，旧解析结果不会恢复；重新导入需使用新资料标识'
      );
      assert(data.material?.id && Array.isArray(data.material.segments), 'INVALID_INPUT', '资料结构不合法');
      assert(
        typeof data.material.id === 'string' &&
          data.material.id.length <= 160 &&
          typeof data.material.fingerprint === 'string' &&
          data.material.fingerprint.length <= 160 &&
          data.material.segments.every(
            (segment) =>
              typeof segment.id === 'string' &&
              segment.id.length <= 160 &&
              typeof segment.content === 'string' &&
              segment.content.length <= 20000 &&
              (!segment.preview || /^data:image\/(?:png|jpeg|jpg);base64,[A-Za-z0-9+/=\s]+$/.test(segment.preview))
          ),
        'INVALID_INPUT',
        '资料标识、片段或页图结构不合法'
      );
      assert(data.material.segments.length <= 100, 'RESOURCE_LIMIT', '请分段导入资料');
      assert(
        !hasMaterialLayout(data.material) || validMaterialLayout(data.material),
        'INVALID_INPUT',
        '版面片段与原件、页码或待核对状态不符'
      );
      const material = clone(data.material);
      material.scope = 'private';
      material.publishable = false;
      material.segments = material.segments.map((segment) => ({ ...segment, extractionEventId: opId }));
      const extraction = {
        eventId: opId,
        at: now,
        version: material.extractionVersion,
        segmentIds: material.segments.map((segment) => segment.id)
      };
      material.extractions = [extraction];
      material.aliases = [];
      const duplicate = state.materials.find(
        (m) =>
          m.fingerprint === material.fingerprint &&
          m.original?.connectorOrigin === material.original?.connectorOrigin &&
          m.original?.storageId === material.original?.storageId
      );
      assert(
        !state.materials.some((m) => m.id === material.id && m !== duplicate),
        'CONFLICT',
        '同一资料标识对应不同原件或解析器，原记录保留'
      );
      if (duplicate) {
        if (duplicate.id !== material.id) duplicate.aliases = [...new Set([...(duplicate.aliases || []), material.id])];
        const segments = new Map(duplicate.segments.map((s) => [s.id, s]));
        material.segments.forEach((s) => segments.set(s.id, s));
        duplicate.segments = [...segments.values()];
        duplicate.status = material.status;
        duplicate.nextPage = material.nextPage;
        duplicate.recognitionAllowed = material.recognitionAllowed;
        duplicate.recognitionEngine = material.recognitionEngine;
        duplicate.extractionVersion = material.extractionVersion;
        (duplicate.extractions ||= []).push(extraction);
        result = duplicate;
        break;
      }
      state.materials.push(material);
      result = material;
      break;
    }
    case 'material.delete': {
      text(data.materialId, 160);
      assert(
        Object.keys(data).every((key) => ['materialId', 'materialIds', 'questionKeys', 'original'].includes(key)),
        'INVALID_INPUT',
        '删除操作只能包含关联标识和原件定位'
      );
      assert(
        !data.materialIds ||
          (Array.isArray(data.materialIds) &&
            data.materialIds.length <= 501 &&
            data.materialIds.every((id) => typeof id === 'string' && id.length <= 160)),
        'INVALID_INPUT',
        '资料别名结构不合法'
      );
      assert(
        Array.isArray(data.questionKeys) &&
          data.questionKeys.length <= 500 &&
          data.questionKeys.every((key) => typeof key === 'string' && key.length <= 160),
        'INVALID_INPUT',
        '删除关联标识不合法'
      );
      if (data.original) {
        assert(
          Object.keys(data.original).every((key) => ['fileId', 'connectorOrigin'].includes(key)),
          'INVALID_INPUT',
          '原件删除任务不能保存密钥或原始资料'
        );
        assert(
          /^[a-f0-9]{64}$/.test(data.original.fileId) &&
            (data.original.connectorOrigin === null || /^https?:\/\/[^/]+$/.test(data.original.connectorOrigin)),
          'INVALID_INPUT',
          '原件删除目标不合法'
        );
      }
      result = redactMaterial(state, data, opId, now);
      break;
    }
    case 'privacy.redacted': {
      assert(
        state.events.some(
          (e) => e.type === 'material.delete' && e.id === data.deletionId && e.data.materialId === data.materialId
        ),
        'PRECONDITION',
        '脱敏操作需要已记录的资料删除'
      );
      assert(
        Object.keys(data).every((key) => ['materialId', 'deletionId', 'seed'].includes(key)),
        'INVALID_INPUT',
        '脱敏操作不能包含原始资料'
      );
      if (data.seed) {
        const seed = data.seed;
        if (seed.kind === 'conversation') {
          assert(Object.keys(seed).length === 1, 'INVALID_INPUT', '删除对话只能保留空骨架');
          if (!state.conversations.some((c) => c.id === opId))
            state.conversations.push({
              id: opId,
              goal: '关联资料已删除的对话',
              at: now,
              messages: [],
              activeQuestionKey: null,
              pendingHints: [],
              stopped: true
            });
        } else {
          assert(
            seed.kind === 'plan' &&
              Object.keys(seed).every((k) => ['kind', 'day', 'tasks', 'conversationId'].includes(k)),
            'INVALID_INPUT',
            '脱敏计划结构不合法'
          );
          assert(
            Array.isArray(seed.tasks) &&
              seed.tasks.length <= 100 &&
              seed.tasks.every(
                (task) =>
                  task &&
                  Object.keys(task).every((k) =>
                    ['id', 'title', 'questionKey', 'condition', 'privacyRemoved'].includes(k)
                  ) &&
                  (!task.privacyRemoved || (task.title === '关联资料或作答已删除' && !task.questionKey))
              ),
            'INVALID_INPUT',
            '脱敏任务不能保存原始资料或多余字段'
          );
          if (!state.plans.some((p) => p.id === opId)) {
            const seeded = applyLearningOperation(state, {
              id: opId,
              type: 'plan.set',
              at: now,
              data: {
                ...(seed.conversationId ? { conversationId: seed.conversationId } : {}),
                day: seed.day,
                tasks: seed.tasks,
                reason: '关联资料已删除，保留计划分母'
              }
            }).state;
            state.plans = seeded.plans;
          }
        }
      }
      result = { redacted: true };
      break;
    }
    case 'material.original-deleted': {
      const deletionEvent = state.events.find((e) => e.type === 'material.delete' && e.id === data.deletionId);
      const deletion = (state.materialDeletions || []).find((d) => d.materialId === deletionEvent?.data.materialId);
      assert(deletion?.original && deletion.original.fileId === data.fileId, 'PRECONDITION', '原件删除任务不匹配');
      deletion.originalStatus = data.historyOnly ? 'pending' : 'deleted';
      result = { deleted: true, fileId: data.fileId };
      break;
    }
    case 'review.rebuild':
    case 'review.schedule': {
      const a = state.attempts.find((item) => item.id === data.attemptId);
      assert(
        a && effectiveGrade(a).status === 'reliable' && Number.isFinite(data.due) && data.due > now,
        'PRECONDITION',
        '只有可靠判分的作答可以调度复习'
      );
      assert(
        !state.questions.find((q) => questionKey(q) === a.questionKey)?.vocabularyReview,
        'PRECONDITION',
        '词义选择使用明确的日历计划，不自动调度整词复习'
      );
      const rebuilding = operation.type === 'review.rebuild';
      if (rebuilding)
        assert(
          state.events.some(
            (event) =>
              event.id === data.correctionId &&
              event.type === 'assessment.correct' &&
              state.attempts.find((attempt) => attempt.id === event.data.attemptId)?.questionKey === a.questionKey
          ),
          'PRECONDITION',
          '重建复习需要同题的实际更正事件'
        );
      if (!rebuilding && state.reviews.some((r) => r.attemptId === a.id)) {
        result = { reused: true };
        break;
      }
      if (data.policy) {
        assert(data.policy === 'reliable-due-v1', 'INVALID_INPUT', '复习调度规则版本不支持');
        const preceding = state.reviews
          .filter((review) => {
            const origin = state.attempts.find((attempt) => attempt.id === review.attemptId);
            return review.questionKey === a.questionKey && origin && effectiveGrade(origin).status === 'reliable';
          })
          .at(-1);
        assert(
          rebuilding || !preceding || (a.kind === 'review' && a.at >= preceding.due),
          'PRECONDITION',
          '即时重做或提前复测不能增长复习间隔'
        );
        assert(
          Array.isArray(data.evidenceIds) &&
            data.evidenceIds.includes(a.id) &&
            data.evidenceIds.every((id) =>
              state.attempts.some(
                (attempt) =>
                  attempt.id === id &&
                  attempt.questionKey === a.questionKey &&
                  effectiveGrade(attempt).status === 'reliable'
              )
            ),
          'INVALID_INPUT',
          '复习调度证据不合法'
        );
      }
      state.reviews
        .filter((r) => r.questionKey === a.questionKey)
        .forEach((r) => {
          r.cancelled = true;
        });
      result = {
        id: opId,
        questionKey: a.questionKey,
        attemptId: a.id,
        due: data.due,
        rating: data.rating,
        scheduler: 'ts-fsrs',
        ...(rebuilding ? { rebuiltFrom: data.correctionId } : {}),
        ...(data.policy ? { policy: data.policy, evidenceIds: data.evidenceIds || [] } : {}),
        notificationSent: false
      };
      state.reviews.push(result);
      break;
    }
    case 'execution.record': {
      if (data.decision !== undefined) {
        assert(
          Object.keys(data).every((key) =>
            ['tool', 'version', 'permission', 'decision', 'parameterHash', 'remainingBudget'].includes(key)
          ) &&
            ['allowed', 'denied'].includes(data.decision) &&
            /^[a-z][a-zA-Z0-9._-]{0,60}$/.test(data.tool) &&
            /^[a-zA-Z0-9._-]{1,30}$/.test(data.version) &&
            ['read', 'learn', 'none'].includes(data.permission) &&
            /^fnv1a32:[a-f0-9]{8}$/.test(data.parameterHash) &&
            Number.isSafeInteger(data.remainingBudget) &&
            data.remainingBudget >= 0,
          'INVALID_INPUT',
          '执行收据只接受有界元信息'
        );
        result = { id: opId, ...clone(data), status: data.decision === 'allowed' ? 'success' : 'failed', at: now };
        state.executions.push(result);
        break;
      }
      assert(['success', 'failed', 'cancelled'].includes(data.status), 'INVALID_INPUT', '执行状态不合法');
      result = {
        id: opId,
        tool: data.tool,
        version: data.version,
        status: data.status,
        errorCode: data.errorCode || null,
        at: now,
        durationMs: data.durationMs || 0
      };
      state.executions.push(result);
      break;
    }
    case 'timezone.set':
      validateTimezone(now, data.timezone, '学习时区不合法');
      state.timezone = data.timezone;
      result = { timezone: data.timezone };
      break;
    default:
      throw new LearningError('UNKNOWN_TOOL', '不支持的学习操作');
  }
  const receipt = operation.type === 'material.add' ? { id: result.id, fingerprint: result.fingerprint } : result;
  state.events.push({
    id: opId,
    type: operation.type,
    at: now,
    data: clone(data),
    result: clone(receipt),
    ...(ADHERENCE_EVENTS.includes(operation.type)
      ? {
          owner: state.owner,
          source: data.source,
          conversationId: data.conversationId,
          questionKey: data.questionKey,
          reason: data.reason
        }
      : {})
  });
  // 先重放删除墓碑，再重放脱敏骨架；即使首次同步/恢复也不需要已删除的正文。
  if (operation.type === 'material.delete')
    state.events = [
      ...state.events.filter((e) => e.type === 'material.delete'),
      ...state.events.filter((e) => e.type !== 'material.delete')
    ];
  state.revision += 1;
  if (budget) {
    if (operation.type === 'message.add') {
      const messages = current().messages;
      // message.add只追加两份明确对象和revision；精确JSON长度增量，仍逐操作守上限。
      budget.characters +=
        JSON.stringify(messages.at(-1)).length +
        JSON.stringify(state.events.at(-1)).length +
        (messages.length > 1 ? 1 : 0) +
        (state.events.length > 1 ? 1 : 0) +
        String(state.revision).length -
        String(previousRevision).length;
    } else if (attemptBudget && state.attempts.length === attemptBudget.count + 1) {
      budget.characters +=
        JSON.stringify(state.attempts.at(-1)).length +
        (attemptBudget.count ? 1 : 0) +
        JSON.stringify(state.events.at(-1)).length +
        (state.events.length > 1 ? 1 : 0) +
        String(state.revision).length -
        String(previousRevision).length +
        ['conversations', 'plans', 'questions'].reduce((total, key) => total + JSON.stringify(state[key]).length, 0) -
        attemptBudget.sections;
    } else budget.characters = JSON.stringify(state).length;
  }
  assert(
    state.events.length <= HISTORY_LIMITS.operations &&
      (budget ? budget.characters : JSON.stringify(state).length) <= HISTORY_LIMITS.stateCharacters,
    'RESOURCE_LIMIT',
    '学习历史达到配置上限，请导出记录；不会自动删除旧记录'
  );
  return { state, result, reused: false };
}

// 普通写入仍先复制；同一有界重放批次持有一个隔离副本，成功后才交给原子保存。
export function applyLearningOperation(original, operation) {
  return reduceLearningOperation(original, operation);
}
export function createLearningOperationBatch(original, maximum = 100) {
  assert(Number.isInteger(maximum) && maximum >= 1 && maximum <= 500, 'RESOURCE_LIMIT', '重放批次最多500操作');
  const snapshot = cloneBatchSnapshot(original);
  let state = snapshot.state,
    count = 0,
    closed = false;
  const budget = { characters: snapshot.characters };
  return {
    apply(operation) {
      try {
        assert(!closed && count < maximum, 'PRECONDITION', '重放批次已结束、失败或超过上限');
        count++;
        // 只在同一隔离副本的连续消息追加中复用索引；其他操作可能重排或隐私重写历史。
        if (operation.type === 'message.add') {
          if (budget.indexedEvents !== state.events || budget.indexedCount !== state.events.length)
            budget.eventIndex = null;
          if (!budget.eventIndex && Array.isArray(state.events) && state.events.length <= HISTORY_LIMITS.operations) {
            const index = new Map();
            for (const event of state.events) {
              if (!event || typeof event.id !== 'string') break;
              if (!index.has(event.id)) index.set(event.id, event);
            }
            if (state.events.every((event) => event && typeof event.id === 'string')) budget.eventIndex = index;
          }
        } else budget.eventIndex = budget.indexedEvents = null;
        const outcome = reduceLearningOperation(state, operation, true, budget);
        state = outcome.state;
        if (budget.eventIndex) {
          if (!outcome.reused) {
            const event = state.events.at(-1);
            if (!budget.eventIndex.has(event.id)) budget.eventIndex.set(event.id, event);
          }
          budget.indexedEvents = state.events;
          budget.indexedCount = state.events.length;
        }
        return outcome;
      } catch (error) {
        closed = true;
        budget.eventIndex = budget.indexedEvents = null;
        throw error;
      }
    },
    finish() {
      assert(!closed, 'PRECONDITION', '失败批次不能提交');
      closed = true;
      budget.eventIndex = budget.indexedEvents = null;
      return state;
    }
  };
}
