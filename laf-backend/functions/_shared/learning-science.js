import { dayKey } from './learning-date-time.js';
import {
  visualRecipe,
  MOTION_TEMPLATES,
  motionInput,
  motionResult,
  exactMotionText,
  VELOCITY_GRAPH_TEMPLATE,
  velocityGraphInput,
  velocityGraphResult,
  ENERGY_TEMPLATE,
  energyInput,
  energyResult
} from './learning-visual.js';
import { nextNoticeDay } from './learning-writing.js';
import {
  DENSITY_TEMPLATE,
  densityInput,
  nextDensityInput,
  densityChoices,
  densityHelpContent
} from './learning-density.js';

import {
  PRESSURE_TEMPLATE,
  pressureInput,
  nextPressureInput,
  pressureChoices,
  pressureHelpContent
} from './learning-pressure.js';

export const SCIENCE_TRANSFER_CONTRACT = 'science-transfer-v1';
export const MOTION_TRANSFER_CONTRACT = 'science-transfer-v2';
export const GRAPH_TRANSFER_CONTRACT = 'science-transfer-v3';
export const ENERGY_TRANSFER_CONTRACT = 'science-transfer-v4';
export const DENSITY_TRANSFER_CONTRACT = 'science-transfer-v5';
export const PRESSURE_TRANSFER_CONTRACT = 'science-transfer-v6';
function requireScience(ok, message, code = 'INVALID_INPUT') {
  if (!ok) throw Object.assign(new Error(message), { code });
}
function same(a, b) {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  return Object.keys(a).length === Object.keys(b).length && Object.keys(b).every((k) => same(a[k], b[k]));
}
export function scienceInput(input) {
  if (input?.template === PRESSURE_TEMPLATE) return pressureInput(input);
  if (input?.template === DENSITY_TEMPLATE) return densityInput(input);
  const recipe = visualRecipe(input);
  if (recipe.template === ENERGY_TEMPLATE) return energyInput(recipe);
  if (recipe.template === VELOCITY_GRAPH_TEMPLATE) return velocityGraphInput(recipe);
  if (MOTION_TEMPLATES.includes(recipe.template)) return motionInput(recipe);
  return recipe.template === 'constant_net_force'
    ? { template: recipe.template, massKg: recipe.massKg, netForceN: recipe.netForceN, direction: recipe.direction }
    : {
        template: recipe.template,
        outward: recipe.outward,
        backward: recipe.backward,
        direction: recipe.direction || 'right'
      };
}
export function nextScienceInput(input) {
  const value = scienceInput(input);
  if (value.template === PRESSURE_TEMPLATE) return nextPressureInput(value);
  if (value.template === DENSITY_TEMPLATE) return nextDensityInput(value);
  if (value.template === VELOCITY_GRAPH_TEMPLATE)
    return scienceInput({
      ...value,
      points: value.points.map((p) => ({
        ...p,
        velocity: p.velocity > 19.5 ? -19.5 : (Math.round(p.velocity * 100) + 50) / 100
      }))
    });
  if (MOTION_TEMPLATES.includes(value.template) || value.template === ENERGY_TEMPLATE) {
    const next = {
      ...value,
      massKg: value.massKg > 19.5 ? 0.5 : (Math.round(value.massKg * 100) + 50) / 100,
      initialVelocityMps: value.initialVelocityMps ? -value.initialVelocityMps : 1.5
    };
    const changedForce = (s) => ({
      ...s,
      netForceN: s.netForceN > 11.5 ? 0.5 : (Math.round(s.netForceN * 100) + 50) / 100,
      direction: s.direction === 'left' ? 'right' : 'left'
    });
    if (value.template === 'accelerated_motion' || value.template === ENERGY_TEMPLATE)
      Object.assign(next, changedForce(value), {
        massKg: next.massKg,
        initialVelocityMps: next.initialVelocityMps
      });
    else next.segments = value.segments.map((s, i) => (i === 0 ? changedForce(s) : { ...s }));
    return scienceInput(next);
  }
  if (value.template === 'constant_net_force') {
    return {
      ...value,
      massKg: value.massKg === 20 ? 1 : value.massKg + 1,
      netForceN: value.netForceN === 12 ? 11 : value.netForceN + 1,
      direction: value.direction === 'left' ? 'right' : 'left'
    };
  }
  const outward = value.outward === 20 ? 19 : value.outward + 1;
  return {
    ...value,
    outward,
    backward: Math.min(outward, value.backward + 1),
    direction: value.direction === 'left' ? 'right' : 'left'
  };
}
export function scienceVisualHelpContent(input) {
  if (input?.template === PRESSURE_TEMPLATE) return pressureHelpContent(input);
  if (input?.template === DENSITY_TEMPLATE) return densityHelpContent(input);
  const value = scienceInput(input),
    side = value.direction === 'left' ? '左' : '右';
  if (value.template === ENERGY_TEMPLATE)
    return `示例观察帮助：惯性参考系中的质点，直线运动，质量不变${value.massKg}kg，初速度${value.initialVelocityMps}m/s（向右为正），恒定合力${value.netForceN}N${value.netForceN ? `向${side}` : '无方向'}，观察${value.physicalSeconds}s；比较合力总功与动能变化。`;
  if (value.template === VELOCITY_GRAPH_TEMPLATE)
    return `示例观察帮助：速度—时间图，向右为正，相邻折点间为直线；${value.points.map((p) => `${p.time}s时${p.velocity}m/s`).join('；')}。观察正负面积、路程与位移。`;
  if (value.template === 'distance_displacement')
    return `示例观察帮助：先向${side}${value.outward}m，再反向${value.backward}m；显示路程与位移。`;
  if (value.template === 'constant_net_force')
    return `示例观察帮助：初始静止，质量${value.massKg}kg，恒定合力${value.netForceN}N${value.netForceN ? `向${side}` : '无方向'}；观察2s，并比较质量加倍。`;
  const segments = value.segments || [
    { seconds: value.physicalSeconds, netForceN: value.netForceN, direction: value.direction }
  ];
  return `示例观察帮助：向右为正，质量${value.massKg}kg，初速度${value.initialVelocityMps}m/s；${segments.map((s, i) => `第${i + 1}段${s.seconds}s，合力${s.netForceN}N${s.netForceN ? `向${s.direction === 'left' ? '左' : '右'}` : '无方向'}`).join('；')}。显示速度、加速度、路程、位移，并比较质量加倍。`;
}
function choices(input) {
  if (input.template === PRESSURE_TEMPLATE) return pressureChoices(input);
  if (input.template === DENSITY_TEMPLATE) return densityChoices(input);
  let labels, prompt;
  if (input.template === ENERGY_TEMPLATE) {
    const result = energyResult(input),
      work = result.work,
      kinetic = result.finalKinetic,
      pair = (w, k) => `合力总功${exactMotionText(w)}J，末动能${exactMotionText(k)}J`;
    prompt = `在选定惯性参考系中，规定向右为正、起点为0m。质点沿直线运动，质量保持${input.massKg}kg，初速度${input.initialVelocityMps}m/s，恒定合力${input.netForceN}N${input.netForceN ? `向${input.direction === 'left' ? '左' : '右'}` : '（无方向）'}。经过${input.physicalSeconds}s，合力总功与末动能分别是多少？`;
    labels = [
      ...new Set([
        pair(work, kinetic),
        pair([Math.abs(work[0]), work[1]], kinetic),
        pair(work, result.initialKinetic),
        pair(work, [kinetic[0] + kinetic[1], kinetic[1]]),
        pair([work[0] + work[1], work[1]], kinetic),
        pair([work[0] + work[1], work[1]], [kinetic[0] + kinetic[1], kinetic[1]])
      ])
    ].slice(0, 4);
  } else if (MOTION_TEMPLATES.includes(input.template) || input.template === VELOCITY_GRAPH_TEMPLATE) {
    const graph = input.template === VELOCITY_GRAPH_TEMPLATE,
      result = graph ? velocityGraphResult(input) : motionResult(input),
      d = result.distance,
      x = result.displacement;
    const schedule = graph
      ? []
      : input.template === 'accelerated_motion'
        ? [{ seconds: input.physicalSeconds, netForceN: input.netForceN, direction: input.direction }]
        : input.segments;
    const conditions = schedule
      .map(
        (s, i) =>
          `第${i + 1}段${s.seconds}s：合力${s.netForceN}N${s.netForceN ? `向${s.direction === 'left' ? '左' : '右'}` : '（无方向）'}`
      )
      .join('；');
    prompt = graph
      ? `速度—时间图规定向右为正，相邻折点间为直线，折点依次为${input.points.map((p) => `（${p.time}s，${p.velocity}m/s）`).join('、')}。全程路程与位移分别是多少？`
      : `规定向右为正，起点为0m。质量${input.massKg}kg，初速度${input.initialVelocityMps}m/s。${conditions}。各段内合力恒定，不另加其他力。总路程与最终位移分别是多少？`;
    const pair = (distance, displacement) => `路程${exactMotionText(distance)}m，位移${exactMotionText(displacement)}m`;
    labels = [
      ...new Set([
        pair(d, x),
        pair([Math.abs(x[0]), x[1]], d),
        pair(d, [-x[0], x[1]]),
        pair(d, [x[0] + x[1], x[1]]),
        pair([d[0] + d[1], d[1]], x),
        pair([d[0] + 2 * d[1], d[1]], x)
      ])
    ].slice(0, 4);
  } else if (input.template === 'constant_net_force') {
    prompt = `两个物体初始静止，质量分别为${input.massKg}kg和${input.massKg * 2}kg，受到相同的恒定合力${input.netForceN}N${input.netForceN ? `（向${input.direction === 'left' ? '左' : '右'}）` : ''}。较重物体的加速度与较轻物体相比怎样？`;
    labels = input.netForceN
      ? ['大小减半，方向相同', '大小加倍，方向相同', '大小相同，方向相同', '大小减半，方向相反']
      : ['两者加速度均为0', '较重物体加速度更大', '较轻物体加速度更大', '两者加速度方向相反'];
  } else {
    const distance = input.outward + input.backward,
      displacement = (input.direction === 'left' ? -1 : 1) * (input.outward - input.backward);
    prompt = `规定向右为正。物体先向${input.direction === 'left' ? '左' : '右'}走${input.outward}m，再反向走${input.backward}m。总路程与最终位移分别是多少？`;
    const pair = (d, x) => `路程${d}m，位移${x}m`;
    labels = [
      ...new Set([
        pair(distance, displacement),
        pair(Math.abs(displacement), distance),
        pair(distance, -displacement),
        pair(distance, displacement + 1),
        pair(distance + 1, displacement)
      ])
    ].slice(0, 4);
  }
  const correct = labels[0],
    offset =
      input.template === VELOCITY_GRAPH_TEMPLATE
        ? (Math.round(Math.abs(input.points[0].velocity) * 100) + Math.round(input.points.at(-1).time * 100)) % 4
        : MOTION_TEMPLATES.includes(input.template) || input.template === ENERGY_TEMPLATE
          ? Math.round(input.massKg * 100) % 4
          : input.template === 'constant_net_force'
            ? (input.massKg + input.netForceN) % 4
            : (input.outward + input.backward) % 4;
  const rotated = labels.slice(offset).concat(labels.slice(0, offset));
  return {
    prompt,
    options: rotated.map((label, index) => `${'ABCD'[index]}. ${label}`),
    answer: 'ABCD'[rotated.indexOf(correct)]
  };
}
export function createScienceQuestion(id, conversationId, raw, parent = null, planning = null) {
  requireScience(
    typeof id === 'string' && id && id.length <= 120 && typeof conversationId === 'string' && conversationId,
    '检验需绑定当前学习'
  );
  const input = scienceInput(raw),
    task = choices(input),
    contract =
      input.template === PRESSURE_TEMPLATE
        ? PRESSURE_TRANSFER_CONTRACT
        : input.template === DENSITY_TEMPLATE
          ? DENSITY_TRANSFER_CONTRACT
          : input.template === ENERGY_TEMPLATE
            ? ENERGY_TRANSFER_CONTRACT
            : input.template === VELOCITY_GRAPH_TEMPLATE
              ? GRAPH_TRANSFER_CONTRACT
              : MOTION_TEMPLATES.includes(input.template)
                ? MOTION_TRANSFER_CONTRACT
                : SCIENCE_TRANSFER_CONTRACT;
  return {
    id,
    version: 1,
    scope: 'generated',
    subject: '物理',
    knowledgePoint:
      input.template === PRESSURE_TEMPLATE
        ? '压强、压力与接触面积'
        : input.template === DENSITY_TEMPLATE
          ? '密度、质量与体积'
          : input.template === ENERGY_TEMPLATE
            ? '功与动能'
            : input.template === VELOCITY_GRAPH_TEMPLATE
              ? '速度图与路程位移'
              : input.template === 'accelerated_motion'
                ? '初速度与运动'
                : input.template === 'changing_net_force'
                  ? '分段合力与运动'
                  : input.template === 'constant_net_force'
                    ? '合力与加速度'
                    : '路程与位移',
    prompt: task.prompt,
    answerType: 'choice',
    options: task.options,
    source: { kind: 'project_original', reference: contract },
    validation: { type: 'choice', answer: task.answer, authority: 'executable', evidenceId: contract },
    scienceExercise: {
      contract,
      conversationId,
      input,
      phase: planning ? 'retest' : 'independent',
      dueDay: planning ? nextNoticeDay(planning.day) : null,
      plannedDay: planning?.day ?? null,
      plannedTimezone: planning?.timezone ?? null
    },
    ...(parent ? { parentQuestionKey: parent } : {})
  };
}
function localDay(at, timezone) {
  requireScience(typeof timezone === 'string' && timezone.length <= 80, '复测时区不合法');
  try {
    return dayKey(at, timezone);
  } catch {
    requireScience(false, '复测时区不合法');
  }
}
export function scienceRetestReady(question, at = Date.now()) {
  const exercise = question?.scienceExercise;
  return !exercise || exercise.phase !== 'retest' || localDay(at, exercise.plannedTimezone) >= exercise.dueDay;
}
export function gradeScienceAnswer(question, answer) {
  try {
    const exercise = question.scienceExercise;
    const canonical = createScienceQuestion(
      question.id,
      exercise.conversationId,
      exercise.input,
      question.parentQuestionKey || null,
      exercise.phase === 'retest' ? { day: exercise.plannedDay, timezone: exercise.plannedTimezone } : null
    );
    requireScience(
      same(exercise, canonical.scienceExercise) &&
        same(question.source, canonical.source) &&
        same(question.options, canonical.options) &&
        question.prompt === canonical.prompt &&
        question.answerType === 'choice' &&
        !question.rubric &&
        !question.uncertainties?.length,
      '检验条件已变化'
    );
    const match = /^(?:我(?:选|选择)|选择|答案[是为：:]?)?\s*([A-D])[。.]?$/i.exec(answer.trim());
    if (!match) return { status: 'pending', outcome: null, basis: 'ambiguous_answer' };
    return {
      status: 'reliable',
      outcome: match[1].toUpperCase() === canonical.validation.answer ? 'correct' : 'wrong',
      basis: canonical.scienceExercise.contract,
      evaluator:
        canonical.scienceExercise.contract === PRESSURE_TRANSFER_CONTRACT
          ? 'deterministic-science-v6'
          : canonical.scienceExercise.contract === DENSITY_TRANSFER_CONTRACT
            ? 'deterministic-science-v5'
            : canonical.scienceExercise.contract === ENERGY_TRANSFER_CONTRACT
              ? 'deterministic-science-v4'
              : canonical.scienceExercise.contract === GRAPH_TRANSFER_CONTRACT
                ? 'deterministic-science-v3'
                : canonical.scienceExercise.contract === MOTION_TRANSFER_CONTRACT
                  ? 'deterministic-science-v2'
                  : 'deterministic-science-v1',
      authority: 'executable'
    };
  } catch {
    return { status: 'pending', outcome: null, basis: 'no_independent_reference' };
  }
}
export function normalizeScienceQuestion(question, state, at) {
  const exercise = question.scienceExercise;
  requireScience(
    [
      SCIENCE_TRANSFER_CONTRACT,
      MOTION_TRANSFER_CONTRACT,
      GRAPH_TRANSFER_CONTRACT,
      ENERGY_TRANSFER_CONTRACT,
      DENSITY_TRANSFER_CONTRACT,
      PRESSURE_TRANSFER_CONTRACT
    ].includes(exercise?.contract),
    '科学检验版本不支持'
  );
  const canonical = createScienceQuestion(
    question.id,
    exercise.conversationId,
    exercise.input,
    question.parentQuestionKey || null,
    exercise.phase === 'retest' ? { day: exercise.plannedDay, timezone: exercise.plannedTimezone } : null
  );
  requireScience(
    same(exercise, canonical.scienceExercise) &&
      same(question.source, canonical.source) &&
      same(question.options, canonical.options) &&
      question.prompt === canonical.prompt &&
      question.subject === canonical.subject &&
      question.knowledgePoint === canonical.knowledgePoint &&
      question.scope === 'generated' &&
      question.version === 1 &&
      question.answerType === 'choice' &&
      !question.rubric &&
      !question.materialExercise &&
      !question.writingExercise &&
      !question.prerequisite &&
      !question.uncertainties?.length &&
      question.expectedAnswer == null,
    '检验条件已变化，请重新出题'
  );
  const session = state.conversations.find((c) => c.id === exercise.conversationId);
  requireScience(session && !session.stopped, '当前任务已停止', 'STOPPED');
  if (exercise.phase === 'retest')
    requireScience(exercise.plannedDay === localDay(at, exercise.plannedTimezone), '复测需保留安排时的日期与时区');
  if (question.parentQuestionKey) {
    const parent = state.questions.find((q) => `${q.id}@${q.version}` === question.parentQuestionKey);
    requireScience(parent, '检验原题已不可用');
    if (parent.scienceExercise)
      requireScience(
        parent.scienceExercise.conversationId === session.id &&
          same(exercise.input, nextScienceInput(parent.scienceExercise.input)),
        '换题需保留当前对话并改变条件'
      );
    else
      requireScience(
        exercise.phase === 'independent' && session.activeQuestionKey === question.parentQuestionKey,
        '检验需关联当前原题'
      );
    if (exercise.phase === 'retest')
      requireScience(
        parent.scienceExercise &&
          state.attempts.some((a) => a.questionKey === question.parentQuestionKey && a.conversationId === session.id),
        '请先提交当前题目的作答'
      );
  } else requireScience(exercise.phase !== 'retest', '复测需要原题');
  requireScience(
    !state.questions.some(
      (q) =>
        q.scienceExercise?.conversationId === session.id &&
        q.parentQuestionKey === question.parentQuestionKey &&
        same(q.scienceExercise.input, exercise.input) &&
        q.scienceExercise.phase === exercise.phase &&
        q.scienceExercise.dueDay === exercise.dueDay
    ),
    '当前检验已存在',
    'CONFLICT'
  );
  question.validation = canonical.validation;
  return question;
}
