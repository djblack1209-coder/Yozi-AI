import {
  assert,
  emptyLearningState,
  applyLearningOperation,
  createLearningOperationBatch,
  normalizePrivateSyncOperation,
  operationFingerprint,
  effectiveGrade,
  samePrivacyRedaction
} from './learning-domain.js';
import {
  readHistoryPackage,
  createHistoryPackage,
  HISTORY_LIMITS
} from '../../../laf-backend/functions/_shared/learning-history.js';
import { ADHERENCE_EVENTS } from '../../../laf-backend/functions/_shared/learning-adherence.js';
import {
  intakeScopeReplaySnapshot,
  normalizeIntakeReply
} from '../../../laf-backend/functions/_shared/learning-intake.js';

const ROOT_FIELDS = new Set([
  'version',
  'owner',
  'revision',
  'timezone',
  'conversations',
  'questions',
  'materials',
  'attempts',
  'plans',
  'events',
  'executions',
  'profile',
  'strategy',
  'reviews',
  'legacy',
  'materialDeletions',
  'intake'
]);
const UNSAFE_KEYS =
  /^(?:__proto__|prototype|constructor|apiKey|api_key|accessToken|refreshToken|authorization|password|secret|vaultKey)$/i;
function checkKeys(value, depth = 0) {
  assert(depth <= 32, 'RESOURCE_LIMIT', '备份嵌套过深');
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    assert(!UNSAFE_KEYS.test(key), 'INVALID_BACKUP', '备份包含敏感配置或不安全字段');
    checkKeys(item, depth + 1);
  }
}

// JSON 是不可信输入。考试范围快照另按原回答校验；不接纳统计、判分结果或工具成功声明。
export function prepareLearningRestore(
  current,
  content,
  { now = Date.now(), deadlineMs = 2000, protectedCurrent = current } = {}
) {
  assert(typeof content === 'string' && content.length <= 1500000, 'RESOURCE_LIMIT', '备份不能超过 150 万字符');
  let backup;
  try {
    backup = JSON.parse(content);
  } catch {
    assert(false, 'INVALID_BACKUP', '备份不是有效的 JSON');
  }
  assert(backup && !Array.isArray(backup) && backup.version === 1, 'SCHEMA_VERSION', '仅支持版本 1 的学习记录备份');
  assert(backup.owner === current.owner, 'OWNER_MISMATCH', '请在导出记录的同一账户恢复；访客记录不能自动归入其他账户');
  assert(
    Object.keys(backup).every((key) => ROOT_FIELDS.has(key)),
    'INVALID_BACKUP',
    '备份含未知顶层字段'
  );
  assert(Array.isArray(backup.events) && backup.events.length <= 500, 'RESOURCE_LIMIT', '单次恢复最多 500 个学习操作');
  checkKeys(backup);
  // 校验时区，但不能通过导入文件改变当前账户的日期边界。
  emptyLearningState(current.owner, backup.timezone);
  const began = Date.now();
  let state = current;
  let imported = 0;
  let reused = 0;
  let pendingReferences = 0;
  let pendingReviews = 0;
  const seen = new Set();
  const batch = createLearningOperationBatch(current, Math.max(1, backup.events.length));
  for (const event of backup.events) {
    assert(event && typeof event === 'object' && !Array.isArray(event), 'INVALID_BACKUP', '学习操作结构不合法');
    assert(!seen.has(event.id), 'IDEMPOTENCY_CONFLICT', '备份内操作标识重复');
    seen.add(event.id);
    assert(
      typeof event.id === 'string' &&
        event.id.length <= 160 &&
        event.data &&
        typeof event.data === 'object' &&
        !Array.isArray(event.data) &&
        Number.isFinite(event.at) &&
        event.at >= 0 &&
        event.at <= now + 300000,
      'INVALID_BACKUP',
      '学习操作的标识、内容或时间不合法'
    );
    const raw = { id: event.id, type: event.type, at: event.at, data: event.data };
    // 旧公共题的私人学习副本保持来源，但不从备份取得公共发布或答案权威。
    if (raw.type === 'question.add' && raw.data.question?.scope === 'official') {
      raw.data = { ...raw.data, question: { ...raw.data.question, scope: 'legacy' } };
    }
    let operation;
    try {
      operation = normalizePrivateSyncOperation(raw);
      const intakeScope = intakeScopeReplaySnapshot(event);
      if (intakeScope) operation.intakeScope = intakeScope;
      else if (operation.type === 'intake.result' && operation.data.reply?.intake?.profile?.examScope) {
        const derived = normalizeIntakeReply(operation.data.reply, !state.intake?.turns.length, state.intake).intake
          .profile?.examScope;
        assert(
          operationFingerprint(derived || null) === operationFingerprint(operation.data.reply.intake.profile.examScope),
          'MISSING_INTAKE_SCOPE',
          '这份旧备份缺少当时确认的考试范围，请使用完整记录或重新导出；当前记录保留'
        );
      }
    } catch (error) {
      if (error.code) throw error;
      assert(false, 'INVALID_BACKUP', '备份操作不完整或不受支持');
    }
    const pendingReference =
      raw.type === 'question.add' && raw.data.question?.validation && !operation.data.question.validation;
    let pendingReview = false;
    // 执行收据不能由备份提升为当前已执行的动作。
    if (operation.type === 'execution.record') {
      operation.data =
        operation.data.decision !== undefined
          ? { ...operation.data, decision: 'denied' }
          : { ...operation.data, status: 'cancelled', errorCode: 'BACKUP_HISTORY_ONLY' };
    }
    if (operation.type === 'model.request') operation.data = { ...operation.data, historyOnly: true };
    if (operation.type === 'teaching.deliver') operation.data = { ...operation.data, historyOnly: true };
    if (operation.type === 'material.original-deleted') operation.data = { ...operation.data, historyOnly: true };
    if (operation.type === 'material.delete' && !state.events.some((e) => e.id === event.id)) {
      assert(
        !protectedCurrent.materials.some(
          (m) => m.id === operation.data.materialId || operation.data.materialIds?.includes(m.id)
        ) &&
          !protectedCurrent.questions.some(
            (q) =>
              q.source?.materialId === operation.data.materialId ||
              operation.data.materialIds?.includes(q.source?.materialId) ||
              operation.data.questionKeys?.includes(`${q.id}@${q.version}`)
          ),
        'PRECONDITION',
        '备份中的删除不能隐式清理当前资料；请先独立预览并确认资料删除'
      );
    }
    if (
      ['review.schedule', 'review.rebuild'].includes(operation.type) &&
      effectiveGrade(state.attempts.find((attempt) => attempt.id === operation.data.attemptId) || {})?.status !==
        'reliable'
    ) {
      operation.type = 'execution.record';
      operation.data = {
        tool: 'review.schedule',
        version: 1,
        status: 'cancelled',
        errorCode: 'BACKUP_REFERENCE_PENDING'
      };
      pendingReview = true;
    }
    const previous = state.events.find((item) => item.id === event.id);
    if (previous) {
      assert(
        previous.type !== 'privacy.redacted' || event.type === 'privacy.redacted',
        'DELETED_DATA',
        '备份含已删除资料的旧操作，未恢复其正文'
      );
      const exact =
        previous.type === event.type && operationFingerprint(previous.data) === operationFingerprint(event.data);
      const normalized =
        previous.type === operation.type &&
        operationFingerprint(previous.data) === operationFingerprint(operation.data);
      assert(
        exact || normalized || samePrivacyRedaction(previous, operation),
        'IDEMPOTENCY_CONFLICT',
        '同一操作标识对应不同内容；当前记录未被覆盖'
      );
      reused++;
      continue;
    }
    if (pendingReference) pendingReferences++;
    if (pendingReview) pendingReviews++;
    try {
      state = batch.apply(operation).state;
    } catch (error) {
      if (error.code) throw error;
      assert(false, 'INVALID_BACKUP', '备份操作不完整或不受支持');
    }
    imported++;
    assert(Date.now() - began <= deadlineMs, 'TIMEOUT', '恢复校验超时，当前数据未修改；请使用较小的备份');
  }
  state = batch.finish();
  // 旧数据快照不参与重放或统计；其原始导出仍可独立保存和复核。
  return {
    state,
    imported,
    reused,
    pendingReferences,
    pendingReviews,
    owner: current.owner,
    expectedRevision: current.revision
  };
}

// 每批验证旧恢复合同，异步让出主线程；完成预览前不修改持久数据。
export async function prepareLearningHistoryRestore(
  current,
  content,
  { signal, onProgress, now = Date.now(), maxDurationMs = 120000 } = {}
) {
  assert(
    typeof content === 'string' && content.length <= HISTORY_LIMITS.stateCharacters * 2,
    'RESOURCE_LIMIT',
    '历史备份超过配置上限'
  );
  let value;
  try {
    value = JSON.parse(content);
  } catch {
    assert(false, 'INVALID_BACKUP', '历史备份不是有效 JSON');
  }
  let backup;
  if (value?.version === 1 && value.format === undefined) {
    assert(value.owner === current.owner, 'OWNER_MISMATCH', '请在导出记录的同一账户恢复');
    assert(
      Object.keys(value).every((key) => ROOT_FIELDS.has(key)) &&
        Array.isArray(value.events) &&
        value.events.length <= HISTORY_LIMITS.operations,
      'INVALID_BACKUP',
      '旧历史备份字段或操作数不合法'
    );
    checkKeys(value);
    assert(
      JSON.stringify(value.events).length <= HISTORY_LIMITS.stateCharacters,
      'RESOURCE_LIMIT',
      '旧历史操作超过配置上限'
    );
    backup = value;
  } else backup = readHistoryPackage(content, current.owner);
  const began = Date.now();
  emptyLearningState(current.owner, backup.timezone);
  let state = current,
    imported = 0,
    reused = 0,
    pendingReferences = 0,
    pendingReviews = 0;
  const seen = new Set();
  for (const event of backup.events) {
    assert(
      event && typeof event.id === 'string' && !seen.has(event.id),
      'IDEMPOTENCY_CONFLICT',
      '历史备份操作标识重复或不合法'
    );
    seen.add(event.id);
  }
  const check = () => {
    assert(!signal?.aborted, 'CANCELLED', '历史校验已取消，当前记录未修改');
    assert(Date.now() - began <= maxDurationMs, 'TIMEOUT', '历史校验达到时间上限，当前记录未修改');
  };
  for (let offset = 0; offset < backup.events.length;) {
    check();
    let end = offset,
      characters = 200;
    while (end < backup.events.length && end - offset < HISTORY_LIMITS.restoreBatch) {
      const length = JSON.stringify(backup.events[end]).length + 1;
      assert(length <= 1400000, 'RESOURCE_LIMIT', '单个历史操作超过恢复分段上限');
      if (end > offset && characters + length > 1400000) break;
      characters += length;
      end++;
    }
    const next = prepareLearningRestore(
      state,
      JSON.stringify({
        version: 1,
        owner: backup.owner,
        timezone: backup.timezone,
        events: backup.events.slice(offset, end)
      }),
      { now, protectedCurrent: current }
    );
    state = next.state;
    imported += next.imported;
    reused += next.reused;
    pendingReferences += next.pendingReferences;
    pendingReviews += next.pendingReviews;
    onProgress?.({
      completed: end,
      total: backup.events.length
    });
    offset = end;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  check();
  return {
    state,
    imported,
    reused,
    pendingReferences,
    pendingReviews,
    owner: current.owner,
    expectedRevision: current.revision,
    history: true
  };
}

// 访客归属变更是独立、明确授权的入口；普通备份恢复继续严格校验同一账户。
function rebindGuestBehaviors(guest, owner) {
  return {
    ...guest,
    owner,
    events: guest.events.map((e) =>
      ADHERENCE_EVENTS.includes(e.type) ? { ...e, owner, data: { ...e.data, owner } } : e
    )
  };
}
export function prepareGuestMigration(current, guest, { now = Date.now() } = {}) {
  assert(current.owner !== 'guest', 'AUTH_REQUIRED', '请先登录，再确认本设备访客记录归属');
  assert(guest?.owner === 'guest' && guest.version === 1, 'PRECONDITION', '没有可迁移的本设备访客记录');
  const result = prepareLearningRestore(current, JSON.stringify(rebindGuestBehaviors(guest, current.owner)), { now });
  return mergeGuestPlans(current, guest, result, now);
}
export async function prepareGuestHistoryMigration(current, guest, options = {}) {
  assert(current.owner !== 'guest', 'AUTH_REQUIRED', '请先登录，再确认本设备访客记录归属');
  assert(guest?.owner === 'guest' && guest.version === 1, 'PRECONDITION', '没有可迁移的本设备访客记录');
  const result = await prepareLearningHistoryRestore(
    current,
    JSON.stringify(createHistoryPackage(rebindGuestBehaviors(guest, current.owner))),
    options
  );
  return mergeGuestPlans(current, guest, result, options.now || Date.now());
}
function mergeGuestPlans(current, guest, result, now) {
  let mergedPlans = 0;
  if (result.imported) {
    const guestPlans = result.state.plans.filter((plan) => guest.events.some((e) => e.id === plan.id));
    const latest = new Map(guestPlans.map((plan) => [plan.day, plan]));
    for (const [day, plan] of latest) {
      const prior = current.plans.filter((p) => p.day === day).at(-1);
      if (!prior || prior.id === plan.id) continue;
      const id = `guest-merge:${plan.id}`;
      assert(id.length <= 160, 'RESOURCE_LIMIT', '访客计划标识过长，请导出后复核');
      // 已合并的同一计划由后续作答更新；重复迁移不产生新计划版本。
      if (result.state.events.some((e) => e.id === id)) continue;
      result.state = applyLearningOperation(result.state, {
        id,
        type: 'plan.merge',
        at: now,
        data: { planIds: [prior.id, plan.id], reason: '用户确认访客归属；保留两份计划的全部任务与完成证据' }
      }).state;
      mergedPlans++;
    }
  }
  return { ...result, mergedPlans, guestFingerprint: operationFingerprint(guest) };
}
