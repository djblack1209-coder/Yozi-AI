// Model-authored onboarding; a proposed profile takes effect only on confirmation.
import { EXAM_SCOPE_CONTRACTS, explicitShenlunScope, normalizeExamScope } from './learning-exam-scope.js';
export const INTAKE_CHOICES = Object.freeze([
  { value: 'cet', label: '四六级' },
  { value: 'kaoyan', label: '考研' },
  { value: 'civil', label: '考公' },
  { value: 'ielts', label: '雅思' },
  { value: 'toefl', label: '托福' },
  { value: 'other', label: '其他' }
]);
export const MODEL_INTAKE_V2_CONTRACT = 'model-intake-v2';
export const SINGLE_QUESTION_CONTRACT = 'single-question-v1';
export const MODEL_INTAKE_CONTRACTS = Object.freeze(['model-intake-v1', MODEL_INTAKE_V2_CONTRACT]);
const choices = (items) => Object.freeze(items.map(([value, label]) => Object.freeze({ value, label })));
const V2_DIRECTIONS = choices([
  ['kaoyan', '考研'],
  ['civil', '考公'],
  ['other', '其他']
]);
const V2_KAOYAN = choices([
  ['english1', '英语一写作'],
  ['english2', '英语二写作'],
  ['other_subject', '其他科目'],
  ['skip', '尚未确定']
]);
const V2_CIVIL = choices([
  ['shenlun', '申论'],
  ['other_subject', '其他科目'],
  ['skip', '尚未确定']
]);
const V2_OTHER = choices([
  ['english', '英语写作'],
  ['shenlun', '申论'],
  ['skip', '尚未确定']
]);
const v2 = (context) => context?.contract === MODEL_INTAKE_V2_CONTRACT;
const skipped = (context) => /^(跳过|尚未确定|暂不确定|不确定)$/u.test(context?.turns?.at(-1)?.answer || '');
export const intakeTurnLimit = (context) => (v2(context) ? 2 : 4);
export const intakeFinished = (context) =>
  Boolean(
    context &&
    !context.reply?.intake?.profile &&
    (context.turns.length >= intakeTurnLimit(context) || (v2(context) && skipped(context)))
  );
export function intakeChoicesFor(context) {
  if (!context?.turns.length) return v2(context) ? V2_DIRECTIONS : INTAKE_CHOICES;
  if (!v2(context) || intakeFinished(context)) return [];
  const raw = context.turns.map((turn) => turn.answer).join('\n');
  return /考研|英语一|英语二|408/u.test(raw) ? V2_KAOYAN : /考公|公务员|申论/u.test(raw) ? V2_CIVIL : V2_OTHER;
}
const fail = (path = 'intake') => {
  const e = new Error('模型建档回复未通过检查，请查询原请求');
  e.code = 'INTAKE_INVALID';
  e.path = path;
  throw e;
};
const short = (v, n) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= n;
export function normalizeIntakeContext(value) {
  if (!value || !Array.isArray(value.turns) || value.turns.length > 5) return fail('context.turns');
  if (value.contract !== undefined && !MODEL_INTAKE_CONTRACTS.includes(value.contract)) return fail('context.contract');
  if (value.scopeContract !== undefined && (!v2(value) || !EXAM_SCOPE_CONTRACTS.includes(value.scopeContract)))
    return fail('context.scopeContract');
  return {
    ...(v2(value) ? { contract: MODEL_INTAKE_V2_CONTRACT } : {}),
    ...(value.scopeContract ? { scopeContract: value.scopeContract } : {}),
    turns: value.turns.map((item) => {
      if (!item || !short(item.question, 180) || !short(item.answer, 500)) return fail('context.turns.item');
      return { question: item.question.trim(), answer: item.answer.trim() };
    })
  };
}
export function normalizeStudyProfile(value) {
  if (
    !value ||
    !short(value.goal, 300) ||
    !INTAKE_CHOICES.some((item) => item.value === value.category) ||
    !Array.isArray(value.subjects) ||
    value.subjects.length > 12 ||
    value.subjects.some((item) => !short(item, 40))
  )
    return fail('profile.goal-category-subjects');
  if (!['english1', 'english2', 'cs408', 'general'].includes(value.exam)) return fail('profile.exam');
  const exam = value.exam;
  if (
    exam !== 'general' &&
    (value.category !== 'kaoyan' || (value.minutes !== null && (value.minutes < 10 || value.minutes > 90)))
  )
    return fail('profile.exam-minutes');
  if (value.minutes !== null && (!Number.isInteger(value.minutes) || value.minutes < 5 || value.minutes > 120))
    return fail('profile.minutes');
  if (
    value.deadline !== null &&
    (typeof value.deadline !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value.deadline) ||
      !Number.isFinite(Date.parse(value.deadline + 'T12:00:00Z')) ||
      new Date(value.deadline + 'T12:00:00Z').toISOString().slice(0, 10) !== value.deadline)
  )
    return fail('profile.deadline');
  if (value.foundation !== null && !short(value.foundation, 300)) return fail('profile.foundation');
  let examScope;
  if (value.examScope !== undefined && value.examScope !== null) {
    if (value.category !== 'civil' || !value.subjects.some((subject) => subject.includes('申论')))
      return fail('profile.examScope');
    try {
      examScope = normalizeExamScope(value.examScope);
    } catch {
      return fail('profile.examScope');
    }
  }
  return {
    goal: value.goal.trim(),
    category: value.category,
    exam,
    subjects: [...new Set(value.subjects.map((s) => s.trim()))],
    minutes: value.minutes,
    deadline: value.deadline,
    foundation: value.foundation,
    ...(examScope ? { examScope } : {})
  };
}
// Draft facts use only literal, unambiguous statements; confirmation still owns persistence.
export function explicitIntakeFacts(raw = '') {
  const english1 = /英语一|english\s*1/i.test(raw),
    english2 = /英语二|english\s*2/i.test(raw);
  const facts = {};
  if (english1 !== english2) facts.exam = english1 ? 'english1' : 'english2';
  const minutes = [...raw.matchAll(/(?:每天|每日)\s*(?:能|可以|可|有)?\s*(?:学习|学)?\s*(\d{1,3})\s*分钟/g)];
  if (minutes.length === 1 && !/分钟\s*(?:或者?|还是)|(?:或者?|还是)\s*\d+\s*分钟/.test(raw)) {
    const value = Number(minutes[0][1]);
    if (value >= (facts.exam ? 10 : 5) && value <= (facts.exam ? 90 : 120)) facts.minutes = value;
  }
  const dates = [...raw.matchAll(/\b(20\d{2})[-年](\d{1,2})[-月](\d{1,2})(?:日|\b)/g)];
  if (dates.length === 1) {
    const date = `${dates[0][1]}-${dates[0][2].padStart(2, '0')}-${dates[0][3].padStart(2, '0')}`;
    const timestamp = Date.parse(`${date}T12:00:00Z`);
    if (Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date) facts.deadline = date;
  }
  return facts;
}
export function normalizeIntakeReply(value, first = false, context) {
  if (
    !value ||
    !short(value.message, 180) ||
    !value.intake ||
    value.question !== null ||
    !Array.isArray(value.tools) ||
    value.tools.length ||
    Object.keys(value).some((k) => !['message', 'intake', 'question', 'tools'].includes(k))
  )
    return fail('reply.root');
  const draft = value.intake,
    seen = new Set();
  if (!Array.isArray(draft.options) || draft.options.length > 6) return fail('reply.options');
  const options = draft.options.map((item) => {
    if (!item || !short(item.value, 40) || !short(item.label, 60) || seen.has(item.value)) return fail('reply.option');
    seen.add(item.value);
    return { value: item.value, label: item.label.trim() };
  });
  const raw = context?.turns.map((turn) => turn.answer).join('\n') || '';
  const facts = {
    ...explicitIntakeFacts(raw),
    ...(v2(context) ? explicitIntakeFacts(context.turns.at(-1)?.answer || '') : {})
  };
  const proposed =
    v2(context) && draft.profile
      ? {
          ...draft.profile,
          exam: facts.exam || (/\b(?:cs\s*)?408\b/iu.test(raw) ? 'cs408' : 'general'),
          minutes: facts.minutes ?? null,
          deadline: facts.deadline ?? null,
          foundation:
            short(draft.profile.foundation, 300) && raw.includes(draft.profile.foundation)
              ? draft.profile.foundation
              : null
        }
      : draft.profile;
  const profile =
    draft.profile === null
      ? null
      : normalizeStudyProfile({
          ...proposed,
          ...facts,
          // The model cannot invent scope facts or a syllabus source. Existing v1 is unchanged.
          examScope:
            EXAM_SCOPE_CONTRACTS.includes(context?.scopeContract) &&
            proposed?.category === 'civil' &&
            Array.isArray(proposed.subjects) &&
            proposed.subjects.some((subject) => typeof subject === 'string' && subject.includes('申论'))
              ? explicitShenlunScope(context.turns, context.scopeContract)
              : undefined
        });
  if (!first) {
    const finished = intakeFinished(context);
    if (!profile && !(finished && !options.length && draft.input === false)) {
      if (finished) return fail('reply.turn-limit');
      // Deployed model-intake-v1 receipts used “其他” for the open choice.
      // Keep those receipts readable; the UI offers an explicit skip separately.
      if (
        options.length < 2 ||
        options.length > 4 ||
        !options.some((item) => /尚未确定|不确定|跳过|^其他$/.test(item.label))
      )
        return fail('reply.options');
      if (
        v2(context) &&
        (draft.input !== false || JSON.stringify(options) !== JSON.stringify(intakeChoicesFor(context)))
      )
        return fail('reply.enum-options');
    }
    // Only explicit subject evidence can unlock a proposal; category/skip choices are not subjects.
    if (profile && context) {
      const subjects = profile.subjects.filter(
        (subject) =>
          !INTAKE_CHOICES.some((item) => [item.label, item.value].includes(subject)) &&
          !/^(尚未确定|不确定|跳过|其他)$/.test(subject) &&
          !(v2(context) && /^(其他科目|其他方向|科目|方向)$/u.test(subject))
      );
      if (
        !subjects.length ||
        subjects.length !== profile.subjects.length ||
        !subjects.every((subject) => context.turns.some((turn) => turn.answer.includes(subject)))
      )
        return fail('reply.profile-evidence');
    }
  }
  if (
    first &&
    (value.message !== '你在准备什么？' ||
      draft.input !== true ||
      profile ||
      JSON.stringify(options) !== JSON.stringify(intakeChoicesFor(context)))
  )
    return fail('reply.first');
  return {
    message: value.message.trim(),
    intake: {
      options: profile ? [] : options,
      input: !profile && (intakeFinished(context) ? false : draft.input === true || !options.length),
      profile
    },
    question: null,
    tools: []
  };
}
export function parseIntakeOutput(raw, context) {
  let value;
  try {
    value = JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return fail('reply.json');
  }
  const checked = normalizeIntakeContext(context);
  return normalizeIntakeReply(value, !checked.turns.length, checked);
}
export const MODEL_INTAKE_CONTRACT = 'model-intake-v1';
export function intakeSystemPrompt(context) {
  if (!context.turns.length)
    return `${v2(context) ? '你是学习教练，现在发出学习建档的第一条消息。' : '你是刚连接成功的学习教练。现在做真实连接测试并发出第一条消息。'}只返回这个JSON结构，文字和顺序逐字一致：${JSON.stringify({ message: '你在准备什么？', intake: { options: intakeChoicesFor(context), input: true, profile: null }, question: null, tools: [] })}。不教学、不调用工具、不声称已建档。`;
  const profile = {
    message: '请确认学习目标',
    intake: {
      options: [],
      input: false,
      profile: {
        goal: '用户实际目标',
        category: 'kaoyan',
        exam: 'general',
        subjects: ['用户明确准备的学科'],
        minutes: null,
        deadline: null,
        foundation: null
      }
    },
    question: null,
    tools: []
  };
  return `你是学习教练，正在通过真实一问一答了解用户。综合全部已回答轮次生成待确认学习档案，首条消息中的考试、日期和每日时间持续有效，不能重复追问已知事实。
当用户已经说出具体学科或技能，必须立即返回格式A：${JSON.stringify(profile)}。
将格式A的示例文字替换成用户实际表达的内容。category只能是cet/kaoyan/civil/ielts/toefl/other；exam仅在明确考研英语一时用english1，英语二用english2，计算机408用cs408，其余general。subjects只写用户明确说出的学科或技能原词，须逐字出现在用户回答中，不能预设整个考试目录或替用户补全。用户已说每天几分钟时minutes为那个整数，未说则null；用户已说基础时foundation为其原话，未说则null；deadline只在用户提供明确完整日期时填写YYYY-MM-DD，否则null。禁止推算考试日期。考研英语/408的minutes为10至90，其他5至120。所有数字不加引号。
只有用户尚未明确具体方向（例如仅回答“考研”）时，才返回格式B：{"message":"一个明确科目的短问题","intake":{"options":[{"value":"english","label":"英语"},{"value":"major","label":"专业课"},{"value":"skip","label":"尚未确定"}],"input":false,"profile":null},"question":null,"tools":[]}。格式B一次只问一个必要问题，2–4个选项，必须含“尚未确定/跳过”类选项；能点选就不要input:true，不出阅读题、写作题或长文本框。选项按真实语境调整，不能把考研都当成英语写作。不要问基础、每天分钟、考试日期、动机等非必要信息。只回答“考研”不允许生成档案或推断科目。跳过不写事实，不再追问已跳过或已确认的项。
${v2(context) ? `最多2轮提问（含首问），用户主动修改待确认档案不增加提问；明确更正以后一次表达为准，未更正的事实保留。当前已回答${context.turns.length}轮。关键选项只能用宿主枚举，不生成新value或label。${intakeFinished(context) ? '本轮不再提问；有明确学科才用格式A，否则返回message为“方向尚未确定，可稍后重新选择。”、intake为{options:[],input:false,profile:null}，question:null，tools:[]。未答保持未知，不强制产档案。' : `尚未明确科目时格式B必须逐字使用这些选项：${JSON.stringify(intakeChoicesFor(context))}，input:false。已经明确学科时立即用格式A，不追加可跳过的问题。`}` : `最多4轮（含首问），当前已回答${context.turns.length}轮。${context.turns.length >= 4 ? '本轮不再提问；有明确学科才用格式A，否则返回message为“方向尚未确定，可稍后重新选择。”、intake为{options:[],input:false,profile:null}，question:null，tools:[]。未答保持未知，不强制产档案。' : '已经明确学科时只允许格式A；仍不明确时仅问影响出题的必要方向。'}`}
只返回一个有效JSON对象，不教学，不出题，不调用工具。这是待确认档案，禁止声称已保存或已掌握。`;
}
