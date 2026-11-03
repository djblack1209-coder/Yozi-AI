import { LOCATION_KEY, restoredConversation } from '@/services/learning/shell-navigation.js';
import { EXAM_SCOPE_CONTRACTS } from '../../../laf-backend/functions/_shared/learning-exam-scope.js';
import {
  MODEL_TOOL_NAMES,
  compactLearningProgress,
  phraseReviewRating
} from '../../../laf-backend/functions/_shared/learning-runtime-policy.js';
import { modelErrorPresentation } from '../../../laf-backend/functions/_shared/model-errors.js';
import { DEV_TEST } from '@/config/build-channel.js';
import { activeEntryMemories } from '../../../laf-backend/functions/_shared/learning-entries.js';
import { extractConversationEntries } from '../../../laf-backend/functions/_shared/learning-entry-extractor.js';
import {
  mapContentBlocks,
  PRESENTATION_CONTRACT
} from '../../../laf-backend/functions/_shared/learning-content-blocks.js';
import {
  normalizeIntakeReply,
  explicitIntakeFacts,
  intakeFinished,
  MODEL_INTAKE_V2_CONTRACT,
  SINGLE_QUESTION_CONTRACT
} from '../../../laf-backend/functions/_shared/learning-intake.js';
import { coachMaterialContext } from '@/services/learning/coach-material-context.js';
import { WRITING_KNOWLEDGE_CONTRACT } from '../../../laf-backend/functions/_shared/learning-writing-knowledge.js';
import { WRITING_PREDICTION_CONTRACT } from '../../../laf-backend/functions/_shared/learning-writing-prediction.js';
import {
  subjectCoachMethod,
  subjectCoachMethodByContract,
  subjectCoachMethodForIntake
} from '../../../laf-backend/functions/_shared/learning-coach-methods.js';
import {
  WRITING_COACH_CONTRACT,
  COACH_FEEDBACK_VERSION,
  COACH_EXERCISE_CONTRACT,
  COACH_SUMMARY_CONTRACT,
  coachInputFor,
  coachWeaknesses,
  coachEssayType,
  coachWritingBandContext
} from '../../../laf-backend/functions/_shared/learning-writing-coach.js';
import { createNewCard, scheduleCard } from '@/services/fsrs-service.js';
import { captureSession } from '@/services/auth-storage.js';
import { learningWriteLease } from '@/services/learning/learning-write-lease.js';
import { publicError, currentLanguage, t } from '@/i18n/index.js';
import { defineStore } from 'pinia';
import {
  localChatOpening,
  localChatQuestion,
  localDensityQuestion,
  localPressureQuestion,
  localEnergyQuestion,
  localVelocityGraphQuestion,
  chatQuestionMessage
} from '@/services/learning/learning-chat.js';
import { WRITING_FEEDBACK_OUTPUT_CONTRACT } from '../../../laf-backend/functions/_shared/learning-rubric.js';
import { createOatutorQuestion } from '../../../laf-backend/functions/_shared/learning-oatutor.js';
import {
  createSentenceQuestion,
  nextSentenceTask,
  sentenceAnswer,
  sentenceHint,
  sentenceRetestReady
} from '../../../laf-backend/functions/_shared/learning-sentence.js';
import { rhythmOperations } from '@/services/learning/learning-rhythm.js';
import {
  describeJourney,
  trainingReport,
  journeyRecap,
  journeyDate,
  deriveJourneyInsights,
  conversationTimeline,
  dailyConversationContext,
  JOURNEY_MODULES
} from '../../../laf-backend/functions/_shared/learning-journey.js';
import { createJourneyQuestions } from '@/services/learning/journey-training.js';
import { reminderJobs } from '../../../laf-backend/functions/_shared/learning-reminders.js';
import { createLearningCalendar } from '@/services/learning/learning-calendar.js';
import { conversationStrategy } from '../../../laf-backend/functions/_shared/learning-strategy.js';
import { PRESSURE_TEMPLATE } from '../../../laf-backend/functions/_shared/learning-pressure.js';
import {
  createScienceQuestion,
  nextScienceInput,
  scienceInput,
  scienceVisualHelpContent,
  scienceRetestReady
} from '../../../laf-backend/functions/_shared/learning-science.js';
import {
  sourceDiagram,
  confirmedDiagramRecipe,
  diagramHelpContent
} from '../../../laf-backend/functions/_shared/learning-diagram.js';
import {
  createNoticeQuestion,
  createWritingQuestion,
  EMAIL_WRITING_CONTRACT,
  EXTENDED_WRITING_CONTRACTS,
  writingGenre,
  writingGenreInfo,
  nextWritingTask,
  writingRetestReady,
  nextNoticeDay,
  publicWritingReference,
  PUBLIC_WRITING_REFERENCES
} from '../../../laf-backend/functions/_shared/learning-writing.js';
import {
  VOCABULARY_REVIEW_CONTRACT,
  createVocabularyReviewQuestion,
  vocabularyReviewDay,
  vocabularyRetestReady,
  vocabularyUseFeedbackBasis
} from '../../../laf-backend/functions/_shared/learning-vocabulary.js';
import {
  createPrerequisiteQuestion,
  createPrerequisiteVariant,
  prerequisiteProgress
} from '../../../laf-backend/functions/_shared/learning-prerequisite.js';
import { computed, ref, shallowRef, onScopeDispose, watch } from 'vue';
import { pendingUploadJournal } from '@/services/learning/pending-upload-journal.js';
import { learningRepository, LEARNING_KEY } from '@/services/learning/learning-repository.js';
import {
  getUserId,
  getToken,
  checkSession,
  readSessionSnapshot,
  isSessionFormatMigration
} from '@/services/auth-storage.js';
import { storageService } from '@/services/storageService.js';
import {
  COMPUTE_CONTRACT,
  computeScopeFor,
  sameComputeSnapshot,
  normalizeComputeReference,
  computeReferenceText
} from '../../../laf-backend/functions/_shared/learning-compute-contract.js';
import {
  GRAMMAR_CONTRACT,
  grammarScopeFor,
  normalizeGrammarReference,
  grammarReferenceText
} from '../../../laf-backend/functions/_shared/learning-grammar-contract.js';
import { HISTORY_PACKAGE } from '../../../laf-backend/functions/_shared/learning-history.js';
import {
  createLearningRecordSearch,
  RECORD_SEARCH_FILTERS
} from '../../../laf-backend/functions/_shared/learning-record-search.js';
import {
  observeTeaching,
  requestedTeachingMethod
} from '../../../laf-backend/functions/_shared/learning-teaching-observation.js';
import {
  summarizeLearning,
  questionKey,
  attemptSubmissionType,
  knowledgeScope,
  effectiveGrade,
  assert,
  operationFingerprint,
  normalizeRubric,
  normalizeLearningTask,
  dayKey,
  learningTaskContext,
  createMaterialObjectiveQuestion,
  createMaterialObjectiveVariant,
  emptyLearningState
} from '@/services/learning/learning-domain.js';
import {
  userDirective,
  nextStrategy,
  createArithmeticQuestion,
  createExactArithmeticVariant,
  createFractionVariant,
  createConditionQuestion,
  createConditionVariant,
  createArithmeticChallenge,
  createAlgebraQuestion,
  createAlgebraVariant,
  localTeaching,
  executeLearningTool
} from '@/services/learning/learning-tools.js';
import {
  parsePastedMaterial,
  questionFromMaterial,
  correctMaterialQuestion
} from '@/services/learning/material-intake.js';
import {
  fetchLearningModels,
  fetchLearningUsage,
  fetchLearningModelDiscovery,
  learningModelDiscoveryEnabled,
  testLearningModel,
  generateLearningTurn,
  saveLearningModel,
  saveLearningModelPreferences,
  deleteLearningModel,
  cancelLearningTurn,
  fetchLearningResult,
  requestLearningComputation,
  requestLearningGrammar,
  learningRequest
} from '@/services/api/domains/learning.api.js';
import { callLocalConnector, testLocalConnector, learningClientPlatform } from '@/services/learning/local-connector.js';
import {
  parseConnectedMaterial,
  testMaterialConnector,
  deleteConnectedMaterial,
  requestUploadRecovery,
  requestUploadMaintenance
} from '@/services/learning/material-connector.js';
import { synchronizeLearning, adoptRemoteConflict, readLearningSnapshot } from '@/services/learning/learning-sync.js';
import { learningStreamPlatform } from '@/services/learning/learning-stream.js';
import { safeLearningMessage } from '../../../laf-backend/functions/_shared/learning-stream-codec.js';
import { deriveConversationReview } from '@/services/learning/conversation-review.js';
import { reviewFacts } from '../../../laf-backend/functions/_shared/learning-adherence.js';
import {
  validateVisualInput,
  normalizeSavedVisualReading,
  visualReadingText,
  VISION_ADAPTER
} from '../../../laf-backend/functions/_shared/learning-vision.js';

export function learningId(prefix = 'learn') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
// read: local reads/navigation; write: local facts/authorization; send: external requests (may also write).
// cancel first aborts locally; its optional remote cancellation has its own session check.
export const CONVERSATION_ACTION_EFFECTS = Object.freeze({
  startCoach: 'write',
  coachSave: 'write',
  attachMaterial: 'write',
  attachText: 'write',
  requestCoach: 'send',
  coachReview: 'write',
  coachPractice: 'write',
  ensureSessionCurrent: 'write',
  reloadRecords: 'read',
  searchRecords: 'read',
  openRecord: 'read',
  startFocusedStudy: 'write',
  openInsightReview: 'write',
  dismissLocatedRecord: 'read',
  locateConversation: 'read',
  scopedSummary: 'read',
  journeyContext: 'read',
  configureJourney: 'write',
  startTraining: 'write',
  submitTraining: 'write',
  selectTraining: 'read',
  openTrainingFeedback: 'write',
  startWeakness: 'write',
  confirmRecap: 'write',
  planNextTraining: 'write',
  configureReminder: 'write',
  configureStudyReminder: 'write',
  reminderQueue: 'read',
  reminderReceipt: 'write',
  openReminder: 'read',
  notificationContext: 'read',
  prepareNotificationConsent: 'write',
  attachNotifications: 'read',
  writingContext: 'read',
  startWriting: 'write',
  submitSentence: 'write',
  recordSentenceHelp: 'write',
  startSentenceTask: 'write',
  sentenceCanSubmit: 'read',
  scheduleSentenceRetest: 'write',
  recordWritingHelp: 'write',
  readWritingReference: 'write',
  openVocabulary: 'write',
  submitVocabulary: 'write',
  oatutorContext: 'read',
  startOatutor: 'write',
  oatutorAction: 'write',
  vocabularyTaskFor: 'read',
  startVocabularyTask: 'write',
  vocabularyCanSubmit: 'read',
  recordDiagramHelp: 'write',
  recordScienceHelp: 'write',
  startScience: 'write',
  scienceCanSubmit: 'read',
  writingCanSubmit: 'read',
  observeCalendar: 'read',
  confirmProfile: 'write',
  scheduleScienceRetest: 'write',
  scheduleWritingRetest: 'write',
  requestWritingFeedback: 'send',
  requestVocabularyFeedback: 'send',
  computeReferenceContext: 'read',
  requestComputeReference: 'send',
  requestGrammarHelp: 'send',
  diagnosePrerequisite: 'write',
  cancelModelReads: 'read',
  interpretQuestionImage: 'send',
  testModel: 'send',
  dispatchLearningAction: 'write',
  recoverConnectionTest: 'send',
  selectModel: 'send',
  setSharingAllowed: 'send',
  openModelConnector: 'read',
  modelErrorPresentation: 'read',
  beginModelIntake: 'send',
  restartModelIntake: 'send',
  cancelModelIntake: 'read',
  answerModelIntake: 'send',
  recoverModelIntake: 'send',
  acceptModelIntake: 'write',
  checkLocalConnection: 'send',
  checkMaterialConnection: 'send',
  recoverModelResult: 'send',
  retrySingleQuestion: 'send',
  recordContext: 'read',
  prepareMaterialAction: 'write',
  materialContext: 'read',
  refresh: 'read',
  start: 'write',
  startSingleQuestion: 'write',
  setRhythm: 'write',
  send: 'send',
  submit: 'send',
  cancel: 'send',
  commit: 'write',
  loadModels: 'send',
  suggestIdeas: 'send',
  loadUsage: 'send',
  loadModelDiscovery: 'read',
  saveModel: 'send',
  removeModel: 'send',
  importText: 'write',
  previewMaterialDeletion: 'write',
  deleteMaterial: 'send',
  retryOriginalDeletion: 'send',
  structureQuestion: 'write',
  structureObjective: 'write',
  correctQuestion: 'write',
  setRubric: 'write',
  correctAssessment: 'write',
  generateVariant: 'write',
  focus: 'write',
  exportData: 'read',
  previewRestore: 'write',
  cancelHistory: 'read',
  restoreData: 'write',
  rollbackRecords: 'write',
  deleteData: 'write',
  resetLocalData: 'write',
  migrateLegacy: 'write',
  migrateGuest: 'write',
  importFile: 'send',
  inspectUpload: 'send',
  recoverUpload: 'send',
  closeUpload: 'send',
  previewPendingRemoval: 'write',
  forgetPendingUpload: 'write',
  restorePendingLocator: 'write',
  previewUploadMaintenance: 'send',
  compactUploadReceipts: 'send',
  cancelMaterial: 'read',
  syncRecords: 'send',
  readAccountRecords: 'send',
  isSyncConflictCurrent: 'read',
  cancelSync: 'read',
  deleteCloudRecords: 'send',
  adoptCloudRecords: 'send',
  restoreConflictLocal: 'write',
  clearSyncConflict: 'write',
  exportSyncConflict: 'read',
  previewGuestMigration: 'write'
});

export const useConversationLearningStore = defineStore('conversation-learning', () => {
  const sessionUpgrade = storageService.getSessionEpoch();
  sessionUpgrade?.catch?.(() => undefined);
  const initialSnapshot = readSessionSnapshot();
  let boundSession = initialSnapshot.status === 'current' ? initialSnapshot.session : null;
  let sessionEpoch = boundSession?.epoch || null;
  let sessionRevision = 0;
  let sessionRevocation = new AbortController();
  const operationSessions = [];
  let sessionReady = false;
  let resettingSession = 0;
  let lastRecordContext = null;
  let observedIdentity = {
    owner: boundSession?.owner === 'guest' ? null : boundSession?.owner || null,
    token: initialSnapshot.token
  };
  let recordsInitialized = false;
  const state = ref(emptyLearningState(boundSession?.owner || 'guest'));
  let notificationObserver = null,
    notificationRefreshTimer = null;
  function attachNotifications(observer) {
    notificationObserver = observer;
  }
  watch(
    () => JSON.stringify([state.value.owner, recordContext(), state.value.revision]),
    () => {
      if (!notificationObserver) return;
      if (notificationRefreshTimer !== null) clearTimeout(notificationRefreshTimer);
      notificationRefreshTimer = setTimeout(() => {
        notificationRefreshTimer = null;
        notificationObserver.refresh().catch(() => undefined);
      }, 250);
    }
  );
  const selectedConversationId = ref(state.value.conversations.at(-1)?.id || null);
  watch(
    selectedConversationId,
    (conversationId) => {
      if (resettingSession || !boundSession || checkSession(boundSession) !== 'current') return;
      storageService.save(LOCATION_KEY, { version: 1, conversationId }, true, boundSession);
    },
    { flush: 'sync' }
  );
  const busy = ref(false);
  const error = ref('');
  const intakeBusy = ref(false),
    intakeError = ref('');
  let intakeController = null;
  let modelIntakeAvailable = false;
  let modelCoachMethods = [];
  let modelPresentationAvailable = false;
  const singleQuestionAvailable = ref(false);
  const modelIntakeContract = shallowRef(null);
  let modelIntakeScopeContract = null;
  const coachError = ref('');
  const coachProfileDraft = computed(() => explicitIntakeFacts(active.value?.goal || ''));
  const models = ref([]);
  const modelPresets = ref([]);
  const modelId = ref('');
  const usage = ref(null);
  const modelListState = ref({ phase: 'idle', message: '' });
  const modelUsageState = ref({ phase: 'idle', message: '' });
  const modelDiscovery = shallowRef(null);
  const modelDiscoveryState = ref({ phase: 'idle', message: '' });
  const modelReads = new Map();
  const modelActions = new Set();
  let localConnectionController = null;
  let modelResourceContext = null;
  const localConnection = ref(null);
  const materialConnection = ref(null);
  const sharingAllowed = ref(false);
  const retryState = ref({ phase: 'idle', errorCode: null, message: '' });
  const modelPreferenceState = ref({ phase: 'idle', errorCode: null });
  const needsConnection = computed(
    () => !models.value.some((model) => model.source === 'byok' && model.configured && !model.requiresModelSelection)
  );
  const connectionGuide = computed(() =>
    needsConnection.value ? modelErrorPresentation({ error: 'NEEDS_CONNECTION' }) : null
  );
  let hydratingPreferences = false;
  let preferencesOwner = null;
  let preferencesDirty = false;
  let preferenceWrite = Promise.resolve();
  const preferenceKey = 'learning_model_preferences_v1';
  function openModelConnector() {
    return modelErrorPresentation({ error: 'NEEDS_CONNECTION' }).action;
  }
  function persistModelPreferences() {
    if (
      resettingSession ||
      hydratingPreferences ||
      !boundSession ||
      boundSession.owner === 'guest' ||
      checkSession(boundSession) !== 'current'
    )
      return;
    const session = boundSession;
    const preferences = {
      selectedModelId: models.value.some((model) => model.id === modelId.value && model.source === 'byok')
        ? modelId.value
        : null,
      sharingAllowed: sharingAllowed.value
    };
    preferencesDirty = true;
    const saved = storageService.save(preferenceKey, preferences, true, session);
    modelPreferenceState.value = { phase: saved ? 'saving' : 'error', errorCode: saved ? null : 'STORAGE_FAILED' };
    preferenceWrite = preferenceWrite
      .catch(() => undefined)
      .then(async () => {
        if (checkSession(session) !== 'current') return { success: false, error: 'CONTEXT_CHANGED' };
        const result = await saveLearningModelPreferences(preferences, { session, expectedOwner: session.owner });
        if (checkSession(session) === 'current')
          modelPreferenceState.value = {
            phase: result.success ? 'saved' : 'error',
            errorCode: result.success ? null : result.error || result.errorCode || 'CONFIG_FAILED'
          };
        return result;
      })
      .catch(() => {
        if (checkSession(session) === 'current')
          modelPreferenceState.value = { phase: 'error', errorCode: 'NETWORK_FAILED' };
        return { success: false, error: 'NETWORK_FAILED' };
      });
    return preferenceWrite;
  }
  watch([modelId, sharingAllowed], persistModelPreferences, { flush: 'sync' });
  async function selectModel(id) {
    assert(!busy.value && !intakeBusy.value, 'BUSY', '请先等待或查询原请求');
    if (!models.value.length) await loadModels();
    assert(
      models.value.some(
        (model) => model.id === id && model.source === 'byok' && model.configured && !model.requiresModelSelection
      ),
      'NEEDS_CONNECTION',
      '请先保存可用的 API 连接'
    );
    const unchanged = modelId.value === id;
    modelId.value = id;
    modelListState.value = { ...modelListState.value, selectionError: null };
    selectedMode.value = 'cloud';
    if (unchanged) persistModelPreferences();
    return (await preferenceWrite) || { success: true };
  }
  async function setSharingAllowed(allowed) {
    assert(typeof allowed === 'boolean', 'INPUT_INVALID', '共享设置不合法');
    const unchanged = sharingAllowed.value === allowed;
    sharingAllowed.value = allowed;
    if (unchanged) persistModelPreferences();
    return (await preferenceWrite) || { success: true };
  }
  const selectedMode = ref('offline');
  const streamEnabled = ref(false),
    streamPreview = ref('');
  // Device-only presentation. Provisional text never enters the event repository.
  const reply = ref(null);
  let replyController = null;
  let retryOperation = 0;
  const sending = new Map();
  function beginReply(kind, requestId, conversationId = selectedConversationId.value) {
    const control = new AbortController();
    replyController = control;
    reply.value = {
      kind,
      operationId: learningId('presentation'),
      requestId,
      id: `${requestId}:reply`,
      conversationId,
      content: '',
      pending: true,
      at: Date.now()
    };
    return control;
  }
  function previewReply(control, content) {
    assert(!control.signal.aborted && replyController === control, 'CANCELLED', '请求已取消，旧模型响应未写入');
    streamPreview.value = content;
    reply.value.content = content;
  }
  function finishReply(control, content = '') {
    if (replyController !== control) return;
    reply.value = {
      ...reply.value,
      pending: false,
      cancelled: control.signal.aborted,
      content: control.signal.aborted ? reply.value.content : content
    };
    replyController = null;
    streamPreview.value = '';
  }
  const visualRequest = shallowRef(null);
  const streamPlatform = learningStreamPlatform();
  const streamSupported = computed(
    () =>
      selectedMode.value === 'cloud' &&
      models.value.find((m) => m.id === modelId.value)?.capabilities?.stream === true &&
      streamPlatform !== 'unsupported'
  );
  let controller = null;
  let pendingCloudCall = null;
  let computeRequest = null;
  const pendingUploads = ref([]);
  const materialBusy = ref(false);
  const materialProgress = ref(null);
  const materialImportState = ref(null);
  const materialConnectionBusy = ref(false);
  let materialController = null;
  let materialRequestContext = null;
  let materialImportContext = null;
  let materialConnectionController = null;
  let materialConnectionRequestContext = null;
  let materialIdentityConnection = null,
    materialIdentitySignature = null,
    materialIdentitySequence = 0;
  function materialIdentity() {
    const connection = materialConnection.value;
    const signature = connection
      ? JSON.stringify([
          connection.endpoint,
          connection.allowedOrigins,
          connection.consent,
          connection.token,
          connection.capabilities?.uploadRecovery?.storageId || null,
          connection.capabilities?.uploadMaintenance?.generation || null
        ])
      : null;
    if (connection !== materialIdentityConnection || signature !== materialIdentitySignature) {
      materialIdentityConnection = connection;
      materialIdentitySignature = signature;
      materialIdentitySequence++;
    }
    return materialIdentitySequence;
  }
  function recordContext() {
    try {
      if (sessionReady && !resettingSession) ensureSessionCurrent(undefined, undefined, { readOnly: true });
      lastRecordContext = JSON.stringify([learningRepository.lifecycleContext(), loginContext()]);
      return lastRecordContext;
    } catch {
      return readSessionSnapshot().status === 'unavailable' ? lastRecordContext : null;
    }
  }
  function loginContext() {
    return JSON.stringify([boundSession?.owner, sessionRevision]);
  }
  // Notifications accelerate revocation. Every operation and result checks persisted identity itself.
  function ensureSessionCurrent(expectedSession = operationSessions.at(-1), signal, { readOnly = false } = {}) {
    if (resettingSession) {
      assert(readOnly, 'CONTEXT_CHANGED', '登录会话正在重置，旧动作未写入');
      return loginContext();
    }
    const snapshot = readSessionSnapshot();
    if (snapshot.status === 'unavailable') {
      if (sessionReady) for (const operation of modelReads.values()) operation.unavailable = true;
      const changed = checkSession(boundSession) === 'changed';
      if (changed) reloadRecords({ identityChanged: true });
      else {
        error.value = '登录状态暂不可读，请重试';
        if (readOnly) return loginContext();
      }
      assert(
        false,
        changed ? 'CONTEXT_CHANGED' : 'SESSION_UNAVAILABLE',
        changed ? '登录会话已变化，旧结果未采用' : '登录状态暂不可读，请重试'
      );
    }
    if (snapshot.status === 'changed' && !boundSession) {
      assert(readOnly, 'CONTEXT_CHANGED', '登录会话已撤销，请重新登录');
      return loginContext();
    }
    const epoch = snapshot.session.epoch;
    if (isSessionFormatMigration(boundSession, snapshot)) {
      boundSession = snapshot.session;
      sessionEpoch = epoch;
    }
    const identity = {
      owner: snapshot.session.owner === 'guest' ? null : snapshot.session.owner,
      token: snapshot.token
    };
    if (
      snapshot.status === 'changed' ||
      epoch !== sessionEpoch ||
      identity.owner !== observedIdentity.owner ||
      Boolean(identity.token) !== Boolean(observedIdentity.token)
    ) {
      reloadRecords({ identityChanged: true });
      assert(readOnly, 'CONTEXT_CHANGED', '登录会话已变化，请重新确认授权后继续');
    }
    // A revoked authenticated session must not be silently upgraded here. Guests can study offline.
    assert(readOnly || !identity.token || epoch, 'CONTEXT_CHANGED', '登录会话已撤销，请重新登录');
    observedIdentity = identity;
    assert(
      expectedSession === undefined || expectedSession === loginContext(),
      'CONTEXT_CHANGED',
      '登录会话已变化，旧结果未写入'
    );
    assert(!signal?.aborted, 'CANCELLED', '请求已取消，旧结果未写入');
    if (!recordsInitialized && recordReadState.value === 'pending') {
      try {
        refresh();
      } catch (failure) {
        if (!readOnly) throw failure;
      }
    }
    assert(
      readOnly || recordsInitialized,
      recordReadState.value === 'pending' ? 'SESSION_UNAVAILABLE' : 'CONTEXT_CHANGED',
      '学习记录暂不可读，请重试'
    );
    return loginContext();
  }
  function cancelModelActions() {
    for (const controller of modelActions) controller.abort();
    modelActions.clear();
  }
  function resetModelResources() {
    cancelModelReads(undefined, 'CONTEXT_CHANGED');
    modelIntakeAvailable = false;
    modelCoachMethods = [];
    modelPresentationAvailable = false;
    singleQuestionAvailable.value = false;
    modelIntakeContract.value = null;
    modelIntakeScopeContract = null;
    models.value = [];
    modelPresets.value = [];
    usage.value = null;
    modelListState.value = { phase: 'idle', message: '' };
    modelUsageState.value = { phase: 'idle', message: '' };
    modelDiscovery.value = null;
    modelDiscoveryState.value = { phase: 'idle', message: '' };
    modelResourceContext = null;
  }
  watch(
    () => state.value,
    () => {
      if (modelResourceContext && recordContext() !== modelResourceContext) {
        resetModelResources();
      }
    },
    { flush: 'sync' }
  );
  function materialContext() {
    const records = recordContext();
    return records ? JSON.stringify([records, materialIdentity()]) : null;
  }
  function prepareMaterialAction() {
    ensureSessionCurrent();
    learningRepository.prepareAsyncAction();
    const context = materialContext();
    assert(context, 'CONTEXT_CHANGED', '本机记录上下文不可用，请重新核对');
    return context;
  }
  watch(
    [() => state.value, materialIdentity],
    () => {
      if (materialRequestContext && materialContext() !== materialRequestContext) materialController?.abort();
      if (materialImportContext && materialContext() !== materialImportContext) {
        materialImportContext = null;
        materialProgress.value = null;
        materialImportState.value = null;
      }
      if (materialConnectionRequestContext && materialContext() !== materialConnectionRequestContext)
        materialConnectionController?.abort();
    },
    { flush: 'sync' }
  );
  const syncBusy = ref(false);
  const syncState = ref({ phase: 'idle', message: '', context: null, kind: null });
  const syncConflict = ref(null);
  const accountRead = ref({ phase: 'pending', context: null });
  const accountRecordState = computed(() =>
    state.value.owner === 'guest' || state.value.revision > 0
      ? 'ready'
      : accountRead.value.context === recordContext()
        ? accountRead.value.phase
        : 'pending'
  );
  let accountReadPromise = null;
  let syncController = null;
  let syncRequest = null;
  const syncProgress = ref(null);
  watch(
    () => state.value,
    () => {
      const context = recordContext();
      if (syncRequest?.context && context !== syncRequest.context) cancelSync({ clearFeedback: true });
      if (syncState.value.context && context !== syncState.value.context)
        syncState.value = { phase: 'idle', message: '', context: null, kind: null };
    },
    { flush: 'sync' }
  );
  const historyBusy = ref(false),
    historyProgress = ref(null);
  let historyController = null;
  let historyRequestContext = null;
  watch(
    () => state.value,
    () => {
      if (
        historyRequestContext &&
        (recordContext() !== historyRequestContext.context || state.value.revision !== historyRequestContext.revision)
      )
        cancelHistory();
    },
    { flush: 'sync' }
  );
  const active = computed(() => state.value.conversations.find((c) => c.id === selectedConversationId.value));
  const conversationLocation = shallowRef(null);
  const recordSearch = createLearningRecordSearch();
  const recordReadState = ref('pending');
  const recordSnapshotContext = ref(null);
  watch(
    state,
    () => {
      recordSnapshotContext.value = recordContext();
    },
    { flush: 'sync' }
  );
  const recordLocation = shallowRef(null);
  watch(
    [() => recordContext(), selectedConversationId, () => active.value?.activeQuestionKey],
    () => {
      recordLocation.value = null;
      coachError.value = '';
    },
    { flush: 'sync' }
  );
  const locatedRecord = computed(() => {
    if (recordReadState.value !== 'ready' || !recordLocation.value || recordLocation.value.context !== recordContext())
      return null;
    try {
      return recordSearch.target(state.value, recordLocation.value.id, recordSnapshotContext.value);
    } catch {
      return null;
    }
  });
  function searchRecords(query, options) {
    const context = recordContext();
    const current =
      recordReadState.value === 'ready' &&
      context !== null &&
      context === recordSnapshotContext.value &&
      state.value.owner === (boundSession?.owner || 'guest');
    return {
      ...recordSearch.search(
        current ? state.value : emptyLearningState(boundSession?.owner || 'guest'),
        query,
        options,
        current ? context : null
      ),
      context: current ? context : null
    };
  }
  function openRecord(id, context) {
    idleRecords({ readOnly: true });
    refresh();
    assert(context && context === recordContext(), 'CONTEXT_CHANGED', '学习记录已变化，请重新搜索');
    const target = recordSearch.target(state.value, id, recordSnapshotContext.value);
    if (target.questionKey) focus(target.questionKey, target.conversationId);
    locateConversation(target.conversationId);
    recordLocation.value = { id: target.id, context };
    return target;
  }
  function dismissLocatedRecord() {
    recordLocation.value = null;
  }
  function startFocusedStudy(scope, context) {
    idleRecords();
    refresh();
    assert(context && context === recordContext(), 'CONTEXT_CHANGED', '学习记录已变化，请重新查看');
    const questions = new Map(state.value.questions.map((q) => [questionKey(q), q]));
    const sessions = new Set(state.value.conversations.map((c) => c.id));
    const original = state.value.attempts
      .filter(
        (a) =>
          sessions.has(a.conversationId) &&
          questions.has(a.questionKey) &&
          knowledgeScope(questions.get(a.questionKey)) === scope
      )
      .sort((a, b) => b.at - a.at)[0];
    const question = original && questions.get(original.questionKey);
    assert(question, 'NOT_FOUND', '学习依据不存在');
    // Specialized tasks retain their owning conversation and due-time gates.
    if (
      question.writingExercise ||
      question.scienceExercise ||
      question.sentenceExercise ||
      question.vocabularyExercise ||
      question.vocabularyReview ||
      question.oatutorExercise
    ) {
      focus(original.questionKey, original.conversationId);
      selectedTrainingId.value = 'question-only';
      return active.value;
    }
    // A new conversation and its original question are saved atomically. A
    // repeated original is a redo, never a fresh independent first answer.
    const id = learningId('focused'),
      at = Date.now();
    commitJourneyBatch([
      {
        id,
        type: 'conversation.start',
        at,
        data: { goal: [question.subject, question.knowledgePoint].filter(Boolean).join(' · ').slice(0, 200) }
      },
      {
        id: `${id}:focus`,
        type: 'question.focus',
        at,
        data: { conversationId: id, questionKey: original.questionKey, kind: 'redo' }
      }
    ]);
    selectedConversationId.value = id;
    selectedTrainingId.value = 'question-only';
    return active.value;
  }
  function openInsightReview(reviewId, context) {
    idleRecords();
    refresh();
    assert(context && context === recordContext(), 'CONTEXT_CHANGED', '学习记录已变化，请重新查看');
    const review = reviewFacts(state.value).find(
      (r) => r.id === reviewId && !r.cancelled && !r.completedBy && !r.resolvedBy
    );
    const original =
      review && state.value.attempts.find((a) => a.id === review.attemptId && a.questionKey === review.questionKey);
    assert(original && effectiveGrade(original)?.status === 'reliable', 'NOT_FOUND', '复习依据不存在');
    assert(review.availableAt <= Date.now(), 'NOT_DUE', '此题尚未到复习时间');
    assert(
      state.value.conversations.some((c) => c.id === original.conversationId) &&
        state.value.questions.some((q) => questionKey(q) === review.questionKey),
      'NOT_FOUND',
      '复习原题不存在'
    );
    focus(review.questionKey, original.conversationId, 'review');
    selectedTrainingId.value = 'question-only';
    locateConversation(original.conversationId);
  }
  const timeline = computed(() => conversationTimeline(state.value, selectedConversationId.value, { dayKey }));
  watch(
    [() => JSON.stringify([state.value.owner, recordContext()]), selectedConversationId],
    () => {
      conversationLocation.value = null;
    },
    { flush: 'sync' }
  );
  function locateConversation(conversationId, day = null, groupId = null, messageId = null) {
    if (busy.value) return;
    const session = state.value.conversations.find((c) => c.id === conversationId);
    assert(session, 'NOT_FOUND', '学习目标不存在');
    const chapters = conversationTimeline(state.value, conversationId, { dayKey });
    const chapter = day ? chapters.find((entry) => entry.day === day) : null;
    assert(!day || chapter, 'NOT_FOUND', '学习日期不存在');
    const group = groupId ? chapter?.groups.find((g) => g.id === groupId) : null;
    assert(!groupId || group, 'NOT_FOUND', '模块记录不存在');
    assert(!messageId || session.messages.some((m) => m.id === messageId), 'NOT_FOUND', '消息不存在');
    selectedConversationId.value = conversationId;
    if (group) selectedTrainingId.value = group.id;
    const message = group
      ? chapter.messages.find((m) => group.questionKeys.includes(m.questionKey))
      : chapter?.messages[0];
    conversationLocation.value = { conversationId, day, groupId, messageId: messageId || message?.id || null };
  }
  const activeStrategy = computed(() => conversationStrategy(state.value, selectedConversationId.value));
  const activeQuestion = computed(() =>
    state.value.questions.find((q) => questionKey(q) === active.value?.activeQuestionKey)
  );
  const canReadChatWritingReference = computed(
    () =>
      selectedMode.value === 'offline' &&
      !batchTrainingActive.value &&
      activeQuestion.value?.writingExercise?.contract === EMAIL_WRITING_CONTRACT &&
      writingGenre(activeQuestion.value) === 'email' &&
      PUBLIC_WRITING_REFERENCES.some((reference) => reference.genreId === 'email')
  );
  const canComputeReference = computed(() => {
    try {
      computeScopeFor(state.value, selectedConversationId.value);
      return true;
    } catch {
      return false;
    }
  });
  const canCheckGrammar = computed(() => {
    try {
      grammarScopeFor(state.value, selectedConversationId.value);
      return true;
    } catch {
      return false;
    }
  });
  let lastComputeContext = null;
  function computeReferenceContext() {
    if (readSessionSnapshot().status === 'unavailable') return lastComputeContext;
    lastComputeContext = JSON.stringify([recordContext(), state.value.revision, selectedConversationId.value]);
    return lastComputeContext;
  }
  watch(
    [() => state.value, selectedConversationId],
    () => {
      if (computeRequest && computeReferenceContext() !== computeRequest.context) computeRequest.controller.abort();
    },
    { flush: 'sync' }
  );
  watch(
    [
      () => state.value.owner,
      recordContext,
      selectedConversationId,
      () => active.value?.activeQuestionKey,
      () => active.value?.stopped
    ],
    () => {
      visualRequest.value = null;
    },
    { flush: 'sync' }
  );
  const calendarTime = ref(Date.now());
  const calendar = createLearningCalendar((at) => {
    calendarTime.value = at;
  });
  const observeCalendar = () => calendar.observe();
  const summary = computed(() => summarizeLearning(state.value, calendarTime.value));
  const todaySummary = computed(() => summarizeLearning(state.value, calendarTime.value, { range: 'day' }));
  const journey = computed(() =>
    describeJourney(state.value, selectedConversationId.value, calendarTime.value, { dayKey, effectiveGrade })
  );
  const journeySummary = computed(() =>
    active.value
      ? summarizeLearning(state.value, calendarTime.value, {
          range: 'day',
          conversationId: active.value.id,
          timezone: active.value.journey?.timezone || state.value.timezone
        })
      : null
  );
  const scopedSummary = (range = 'day', conversationId) =>
    summarizeLearning(state.value, calendarTime.value, {
      range,
      ...(conversationId
        ? {
            conversationId,
            timezone:
              state.value.conversations.find((c) => c.id === conversationId)?.journey?.timezone || state.value.timezone
          }
        : {})
    });
  function journeyContext() {
    return JSON.stringify([recordContext(), selectedConversationId.value, state.value.revision]);
  }
  function configureJourney(expectedContext, config) {
    idleRecords();
    refresh();
    assert(expectedContext === journeyContext() && active.value, 'CONTEXT_CHANGED', '学习已变化，请重新核对目标');
    return commit('journey.configure', { conversationId: active.value.id, ...config });
  }
  const selectedTrainingId = ref(null);
  watch(
    selectedConversationId,
    () => {
      selectedTrainingId.value = null;
    },
    { flush: 'sync' }
  );
  const trainingGroup = computed(() => {
    if (selectedTrainingId.value === 'question-only') return null;
    const groups = active.value?.trainingGroups || [];
    const selected = groups.find((group) => group.id === selectedTrainingId.value);
    if (selected) return selected;
    // 重开后的临时选择为空，沿已保存焦点恢复；独立变式不被旧整批结果遮住。
    const key = active.value?.activeQuestionKey;
    return key ? groups.find((group) => group.questionKeys.includes(key)) || null : groups.at(-1) || null;
  });
  const trainingResult = computed(() =>
    trainingGroup.value
      ? trainingReport(state.value, active.value.id, trainingGroup.value.id, { effectiveGrade })
      : null
  );
  const batchTrainingActive = computed(() => Boolean(trainingGroup.value && trainingGroup.value.mode !== 'guided'));
  const dailyRecap = computed(() =>
    journey.value
      ? journeyRecap(state.value, active.value.id, 'day', journey.value.day, null, { effectiveGrade })
      : null
  );
  const journeyInsights = computed(() =>
    journey.value
      ? deriveJourneyInsights(state.value, active.value.id, journey.value.day, { effectiveGrade, dayKey })
      : { comparisons: [], consolidation: [], handoff: '' }
  );
  function startWeakness(expectedContext, attemptId) {
    requireJourney(expectedContext);
    assert(
      journeyInsights.value.consolidation.some((row) => row.evidenceIds.includes(attemptId)),
      'CONTEXT_CHANGED',
      '巩固依据已变化，请重新查看'
    );
    const attempt = state.value.attempts.find((a) => a.id === attemptId && a.conversationId === active.value.id);
    assert(attempt, 'NOT_FOUND', '原答不存在');
    focus(attempt.questionKey, active.value.id);
    selectedTrainingId.value = 'question-only';
    if (effectiveGrade(attempt).status !== 'reliable') return { questionKey: attempt.questionKey, pending: true };
    return generateVariant();
  }
  const weeklyRecap = computed(() =>
    journey.value
      ? journeyRecap(state.value, active.value.id, 'week', journey.value.day, null, { effectiveGrade })
      : null
  );
  const moduleRecap = computed(() =>
    trainingGroup.value && journey.value
      ? journeyRecap(state.value, active.value.id, 'module', trainingGroup.value.day, trainingGroup.value.id, {
          effectiveGrade
        })
      : null
  );
  function confirmRecap(expectedContext, kind = 'day') {
    requireJourney(expectedContext);
    const recap = kind === 'module' ? moduleRecap.value : kind === 'week' ? weeklyRecap.value : dailyRecap.value;
    assert(recap?.submitted, 'PRECONDITION', '请先提交训练后复盘');
    if (recap.confirmed) return recap.confirmed;
    return commit('recap.confirm', {
      conversationId: active.value.id,
      kind,
      day: recap.day,
      groupId: recap.groupId,
      signature: recap.signature,
      explicit: true
    });
  }
  function planNextTraining(expectedContext, moduleId, size) {
    requireJourney(expectedContext);
    const day = new Date((journeyDate(journey.value.day) + 1) * 86400000).toISOString().slice(0, 10);
    return startTraining(journeyContext(), moduleId, size, day);
  }
  function configureReminder(expectedContext, config) {
    requireJourney(expectedContext, true);
    return commit('reminder.set', { conversationId: active.value.id, ...config });
  }
  function configureStudyReminder(expectedContext, conversationId, config) {
    idleRecords();
    refresh();
    assert(expectedContext === recordContext(), 'CONTEXT_CHANGED', '账户或学习记录已变化，请重新设置');
    const target = state.value.conversations.find((item) => item.id === conversationId);
    assert(target?.coach?.profile || target?.studyProfile || target?.journey, 'NOT_FOUND', '请先保存学习目标');
    return commit('reminder.set', { ...config, conversationId });
  }
  function reminderQueue(at = Date.now()) {
    return reminderJobs(state.value, at, { dayKey });
  }
  let lastNotificationContext = null;
  const notificationContext = () => {
    if (readSessionSnapshot().status === 'unavailable') return lastNotificationContext;
    lastNotificationContext = JSON.stringify([learningRepository.notificationConsentContext(), sessionEpoch]);
    return lastNotificationContext;
  };
  function prepareNotificationConsent() {
    ensureSessionCurrent();
    idleRecords();
    learningRepository.prepareAsyncAction();
    return notificationContext();
  }
  function reminderReceipt(job, status, channel, expectedLifecycle) {
    refresh();
    assert(
      !expectedLifecycle || recordContext() === expectedLifecycle,
      'CONTEXT_CHANGED',
      '账户或记录已变化，旧通知回执未保存'
    );
    return commit(
      'reminder.receipt',
      {
        conversationId: job.conversationId,
        reminderId: job.reminderId,
        generation: job.generation,
        day: job.day,
        status,
        channel
      },
      `${job.id}:${channel}:${status}`
    );
  }
  function openReminder(job) {
    refresh();
    const session = state.value.conversations.find((c) => c.id === job.conversationId);
    assert(
      Number.isFinite(job.dueAt) &&
        reminderQueue(job.dueAt).some(
          (current) =>
            current.id === job.id &&
            current.conversationId === job.conversationId &&
            current.reminderId === job.reminderId &&
            current.generation === job.generation &&
            current.kind === job.kind &&
            current.day === job.day &&
            current.dueAt === job.dueAt &&
            (current.reviewId || null) === (job.reviewId || null) &&
            (current.questionKey || null) === (job.questionKey || null)
        ),
      'CONTEXT_CHANGED',
      '提醒已修改、学习已停止或完成，或属于其他账户'
    );
    selectedConversationId.value = session.id;
    if (job.questionKey) {
      const group = session.trainingGroups?.find((g) => !g.submittedBy && g.questionKeys.includes(job.questionKey));
      const dueReview = state.value.reviews.some(
        (r) => !r.cancelled && r.questionKey === job.questionKey && r.due <= Date.now()
      );
      focus(job.questionKey, session.id, dueReview && !group ? 'review' : undefined);
      selectedTrainingId.value = group ? group.id : 'question-only';
    } else selectedTrainingId.value = null;
    return session;
  }
  function requireJourney(expectedContext, allowStopped = false) {
    idleRecords();
    refresh();
    assert(
      expectedContext === journeyContext() && active.value?.journey,
      'CONTEXT_CHANGED',
      '学习已变化，请重新核对题组'
    );
    assert(allowStopped || !active.value.stopped, 'STOPPED', '当前学习已停止');
  }
  function latestPlanForDay(day, conversationId = selectedConversationId.value) {
    return state.value.plans.filter((p) => p.day === day && p.conversationId === conversationId).at(-1);
  }
  function commitJourneyBatch(operations) {
    ensureSessionCurrent();
    operations = operations.map((op) =>
      op.type === 'plan.set' && !op.data.conversationId && !state.value.events.some((e) => e.id === op.id)
        ? { ...op, data: { ...op.data, conversationId: selectedConversationId.value } }
        : op
    );
    const outcome = learningRepository.commitBatch(operations, state.value.revision);
    state.value = outcome.state;
    uni.$emit('conversationLearningUpdated');
    return outcome;
  }
  function startTraining(expectedContext, moduleId, size = 5, plannedDay) {
    requireJourney(expectedContext);
    const program = active.value.journey;
    const day = plannedDay || dayKey(Date.now(), program.timezone);
    const existing = active.value.trainingGroups?.find(
      (g) => g.day === day && g.moduleId === moduleId && !g.submittedBy
    );
    if (existing) {
      selectedTrainingId.value = existing.id;
      return existing;
    }
    const id = learningId('training');
    const count = program.mode === 'guided' ? 1 : size;
    const questions = createJourneyQuestions(state.value, active.value.id, moduleId, count, id);
    const keys = questions.map(questionKey);
    const module = JOURNEY_MODULES.find((m) => m.id === moduleId);
    const at = Date.now(),
      conversationId = active.value.id;
    const tasks = latestPlanForDay(day)?.tasks || [];
    assert(tasks.length + keys.length <= 100, 'RESOURCE_LIMIT', '当日计划最多100项任务');
    commitJourneyBatch([
      ...questions.map((question, index) => ({ id: `${id}:q${index}`, type: 'question.add', at, data: { question } })),
      {
        id,
        type: 'training.open',
        at,
        data: {
          conversationId,
          moduleId,
          questionKeys: keys,
          day,
          minutes: Math.max(1, Math.min(Math.floor(program.minutes / program.moduleIds.length), module.minutes))
        }
      },
      {
        id: `${id}:plan`,
        type: 'plan.set',
        at,
        data: {
          day,
          reason: `用户明确安排${module.label}训练`,
          tasks: [
            ...tasks,
            ...keys.map((key, index) => ({
              id: `${id}:task${index}`,
              title: `${module.label} · 第${index + 1}题`,
              questionKey: key,
              condition: 'submitted'
            }))
          ]
        }
      },
      { id: `${id}:focus`, type: 'question.focus', at, data: { conversationId, questionKey: keys[0] } }
    ]);
    selectedTrainingId.value = id;
    return active.value.trainingGroups.find((g) => g.id === id);
  }
  function selectTraining(groupId) {
    if (groupId === null) {
      selectedTrainingId.value = 'question-only';
      return;
    }
    assert(
      active.value?.trainingGroups?.some((g) => g.id === groupId),
      'NOT_FOUND',
      '题组不存在'
    );
    selectedTrainingId.value = groupId;
  }
  function submitTraining(expectedContext, groupId, answers) {
    requireJourney(expectedContext, true);
    const group = active.value.trainingGroups?.find((g) => g.id === groupId);
    assert(
      group &&
        Array.isArray(answers) &&
        answers.length === group.questionKeys.length &&
        answers.every((value) => typeof value === 'string' && value.trim()),
      'INVALID_INPUT',
      '请完成全部题目再统一交卷'
    );
    if (group.submittedBy) {
      assert(
        group.attemptIds.every((id, index) => state.value.attempts.find((a) => a.id === id)?.answer === answers[index]),
        'IDEMPOTENCY_CONFLICT',
        '这组原答已保存，修改请另行重做'
      );
      return trainingReport(state.value, active.value.id, groupId, { effectiveGrade });
    }
    assert(!active.value.stopped, 'STOPPED', '当前学习已停止');
    const conversationId = active.value.id,
      at = Date.now();
    const attemptIds = group.questionKeys.map((_, index) => `${groupId}:answer${index}`);
    const before = state.value;
    const outcome = commitJourneyBatch([
      ...group.questionKeys.flatMap((key, index) => [
        {
          id: `${groupId}:submit-focus${index}`,
          type: 'question.focus',
          at,
          data: { conversationId, questionKey: key }
        },
        {
          id: attemptIds[index],
          type: 'attempt.submit',
          at,
          data: { conversationId, answer: answers[index], explicit: true, trainingGroupId: groupId }
        }
      ]),
      {
        id: `${groupId}:complete`,
        type: 'training.complete',
        at,
        data: { conversationId, groupId, attemptIds, explicit: true }
      }
    ]);
    // 后续FSRS仍沿同一可靠作答政策；整批原答成功后才建立调度。
    for (const id of attemptIds) {
      const attempt = state.value.attempts.find((a) => a.id === id);
      if (attempt && !before.attempts.some((a) => a.id === id)) scheduleAttempt(attempt);
    }
    selectedTrainingId.value = groupId;
    return trainingReport(outcome.state, conversationId, groupId, { effectiveGrade });
  }
  function openTrainingFeedback(expectedContext, groupId, key) {
    requireJourney(expectedContext);
    const group = active.value.trainingGroups?.find(
      (g) => g.id === groupId && g.submittedBy && g.questionKeys.includes(key)
    );
    assert(group, 'PRECONDITION', '请先完成整批交卷');
    focus(key);
    const segment = activeQuestion.value.scienceExercise
      ? {
          method: 'explain',
          helped: true,
          level: 3,
          content: scienceVisualHelpContent(activeQuestion.value.scienceExercise.input)
        }
      : localTeaching(activeQuestion.value, 'explain');
    if (!segment) return '本题原答已保存，表达与评分仍待核对。';
    deliverTeaching(segment, `${groupId}:explain:${group.questionKeys.indexOf(key)}`);
    return segment.content;
  }
  const taskContext = computed(() => learningTaskContext(state.value, selectedConversationId.value));
  const canDiagnose = computed(() =>
    Boolean(
      activeQuestion.value &&
      createPrerequisiteQuestion('capability', activeQuestion.value, state.value.attempts, selectedConversationId.value)
    )
  );
  const diagnosticProgress = computed(() => prerequisiteProgress(state.value, activeQuestion.value));
  const teachingProgress = computed(() => observeTeaching(state.value));
  const currentPlan = computed(() => state.value.plans.find((p) => p.id === summary.value.tasks.planId));
  function resetAccountResources() {
    accountRead.value = { phase: 'pending', context: null };
    accountReadPromise = null;
    sessionRevision++;
    storageService.getSessionEpoch({ migrateLegacy: false });
    sessionRevocation.abort();
    sessionRevocation = new AbortController();
    const snapshot = readSessionSnapshot();
    boundSession = snapshot.status === 'current' ? snapshot.session : null;
    sessionEpoch = boundSession?.epoch || null;
    observedIdentity = {
      owner: boundSession?.owner === 'guest' ? null : boundSession?.owner || null,
      token: snapshot.token
    };
    cancelModelActions();
    localConnectionController?.abort();
    controller?.abort();
    pendingCloudCall = null;
    replyController?.abort();
    replyController = null;
    reply.value = null;
    visualRequest.value = null;
    streamPreview.value = '';
    streamEnabled.value = false;
    materialController?.abort();
    materialConnectionController?.abort();
    syncController?.abort();
    historyController?.abort();
    historyProgress.value = null;
    preferencesOwner = null;
    preferencesDirty = false;
    modelPreferenceState.value = { phase: 'idle', errorCode: null };
    retryState.value = { phase: 'idle', errorCode: null, message: '' };
    sharingAllowed.value = false;
    localConnection.value = null;
    materialConnection.value = null;
    modelIntakeAvailable = false;
    modelCoachMethods = [];
    modelPresentationAvailable = false;
    modelIntakeContract.value = null;
    modelIntakeScopeContract = null;
    models.value = [];
    modelPresets.value = [];
    usage.value = null;
    modelId.value = '';
    selectedMode.value = 'offline';
    error.value = '';
    materialProgress.value = null;
    coachError.value = '';
    materialImportState.value = null;
    materialImportContext = null;
    selectedTrainingId.value = null;
    controller = null;
    computeRequest = null;
    localConnectionController = null;
    materialController = null;
    materialConnectionController = null;
    materialRequestContext = null;
    materialConnectionRequestContext = null;
    if (syncRequest) syncRequest.feedback = false;
    syncController = null;
    syncRequest = null;
    historyController = null;
    historyRequestContext = null;
    busy.value = false;
    materialBusy.value = false;
    materialConnectionBusy.value = false;
    syncBusy.value = false;
    syncProgress.value = null;
    historyBusy.value = false;
  }
  function refresh() {
    if (readSessionSnapshot().status === 'unavailable' && checkSession(boundSession) !== 'changed') {
      error.value = '登录状态暂不可读，请重试';
      return state.value;
    }
    if (!resettingSession && recordsInitialized) ensureSessionCurrent(undefined, undefined, { readOnly: true });
    const previous = {
      state: state.value,
      session: boundSession,
      phase: recordReadState.value,
      context: recordSnapshotContext.value
    };
    // Block synchronous subscribers throughout projection replacement, including failed initialization.
    resettingSession++;
    try {
      recordReadState.value = 'loading';
      recordSnapshotContext.value = null;
      const next = learningRepository.read();
      const uploads = pendingUploadJournal.list();
      const conflict = learningRepository.previewSyncConflict();
      if (next.owner !== state.value.owner) resetAccountResources();
      if (!recordsInitialized || next.owner !== state.value.owner) {
        const startup =
          import.meta.env.VITE_ENABLE_WRITING_COACH === 'false'
            ? next.conversations
            : next.conversations.filter((conversation) => conversation.coach);
        const location =
          boundSession && storageService.get(LOCATION_KEY, null, { session: boundSession, migrateLegacy: false });
        selectedConversationId.value = restoredConversation(
          location,
          next,
          startup.at(-1)?.id || next.conversations.at(-1)?.id || null
        );
      }
      state.value = next;
      if (preferencesOwner !== next.owner && boundSession && boundSession.owner === next.owner) {
        hydratingPreferences = true;
        try {
          const savedModelPreferences = storageService.get(preferenceKey, null, {
            session: boundSession,
            migrateLegacy: false
          });
          modelId.value =
            typeof savedModelPreferences?.selectedModelId === 'string' ? savedModelPreferences.selectedModelId : '';
          // The catalog must confirm this identity before it can be used.
          selectedMode.value = 'offline';
          sharingAllowed.value =
            storageService.get(preferenceKey, null, { session: boundSession, migrateLegacy: false })?.sharingAllowed ===
            true;
        } finally {
          hydratingPreferences = false;
        }
        preferencesOwner = next.owner;
      }
      calendar.read();
      pendingUploads.value = uploads;
      syncConflict.value = conflict;
      recordsInitialized = true;
      recordSnapshotContext.value = recordContext();
      recordReadState.value = 'ready';
      return state.value;
    } catch (cause) {
      if (cause.code === 'SESSION_UNAVAILABLE') {
        if (checkSession(previous.session) !== 'changed' && previous.state.owner === (boundSession?.owner || 'guest')) {
          state.value = previous.state;
          recordSnapshotContext.value = previous.context;
          recordReadState.value = recordsInitialized ? previous.phase : 'pending';
        }
        error.value = '登录状态暂不可读，请重试';
        return state.value;
      }
      recordSearch.clear();
      resetAccountResources();
      recordLocation.value = null;
      conversationLocation.value = null;
      state.value = emptyLearningState(getUserId() || 'guest');
      selectedConversationId.value = null;
      recordSnapshotContext.value = null;
      recordReadState.value = 'error';
      throw cause;
    } finally {
      resettingSession--;
    }
  }
  function reloadRecords({ identityChanged = false } = {}) {
    if (resettingSession) return state.value;
    if (readSessionSnapshot().status === 'unavailable' && checkSession(boundSession) !== 'changed') {
      error.value = '登录状态暂不可读，请重试';
      return state.value;
    }
    const previous = {
      location: recordLocation.value,
      conversation: conversationLocation.value,
      session: boundSession
    };
    if (identityChanged) sessionRevision++;
    resettingSession++;
    try {
      recordSearch.clear();
      recordLocation.value = null;
      conversationLocation.value = null;
      if (identityChanged) {
        state.value = emptyLearningState(readSessionSnapshot().session?.owner || 'guest');
        selectedConversationId.value = null;
        recordsInitialized = false;
        lastRecordContext = null;
        recordReadState.value = 'loading';
        recordSnapshotContext.value = null;
        resetAccountResources();
        resetModelResources();
        cancelSync({ clearFeedback: true });
        cancelHistory();
      }
      const result = refresh();
      if (
        !identityChanged &&
        readSessionSnapshot().status === 'unavailable' &&
        checkSession(previous.session) !== 'changed'
      ) {
        recordLocation.value = previous.location;
        conversationLocation.value = previous.conversation;
      }
      return result;
    } catch (cause) {
      if (cause.code === 'SESSION_UNAVAILABLE') {
        error.value = '登录状态暂不可读，请重试';
        return state.value;
      }
      resetModelResources();
      cancelSync({ clearFeedback: true });
      cancelHistory();
      controller?.abort();
      materialController?.abort();
      materialConnection.value = null;
      error.value = '本机记录已变化且暂不可读，请重新核对；旧资料动作已取消。';
    } finally {
      resettingSession--;
    }
  }
  const stopIdentityChanges = storageService.onIdentityChange(
    (change) => {
      const snapshot = readSessionSnapshot();
      if (checkSession(boundSession) === 'changed') {
        reloadRecords({ identityChanged: true });
        return;
      }
      if (snapshot.status === 'unavailable') return;
      if (snapshot.session?.owner === 'guest' && change?.type !== 'records') {
        reloadRecords({ identityChanged: true });
        return;
      }
      try {
        ensureSessionCurrent(loginContext(), undefined, { readOnly: true });
      } catch {
        return;
      }
      // 登录完成后账号记录可能刚写入；重读才能把损坏或不兼容的记录显示为短错误与重试，而不是停在「正在读取」。
      if (change?.type === 'records' || change?.type === 'login') reloadRecords();
    },
    {
      $on: (event, listener) => uni.$on?.(event, listener),
      $off: (event, listener) => uni.$off?.(event, listener)
    }
  );
  const storageChanged = (event) => {
    const prefix = state.value.owner === 'guest' ? '' : `u_${state.value.owner}_`;
    const keys = [
      LEARNING_KEY,
      `${LEARNING_KEY}_lifecycle`,
      `${LEARNING_KEY}_privacy_pending`,
      `${LEARNING_KEY}_sync_conflict`,
      `${LEARNING_KEY}_upload_pending`
    ].flatMap((key) => [`${prefix}${key}`, `__exam_storage__:${prefix}${key}`]);
    if (!keys.includes(event.key)) return;
    if (event.storageArea && event.storageArea !== window.localStorage) return;
    reloadRecords();
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', storageChanged);
  onScopeDispose(() => {
    recordSearch.clear();
    if (notificationRefreshTimer !== null) clearTimeout(notificationRefreshTimer);
    notificationObserver?.dispose();
    calendar.dispose();
    if (typeof window !== 'undefined') window.removeEventListener('storage', storageChanged);
    stopIdentityChanges();
    controller?.abort();
    cancelModelReads();
    cancelModelActions();
    localConnectionController?.abort();
    materialController?.abort();
    materialConnectionController?.abort();
    cancelSync({ clearFeedback: true });
    historyController?.abort();
  });
  function commit(type, data, id = learningId()) {
    ensureSessionCurrent();
    if (
      type === 'plan.set' &&
      !state.value.events.some((e) => e.id === id) &&
      !data.conversationId &&
      selectedConversationId.value
    )
      data = { ...data, conversationId: selectedConversationId.value };
    const result = learningRepository.commit({ id, type, data });
    state.value = result.state;
    uni.$emit('conversationLearningUpdated');
    return result.result;
  }
  function confirmProfile(expectedContext, conversationId, fields, suggestion, id = learningId('profile')) {
    ensureSessionCurrent();
    assert(
      recordContext() === expectedContext &&
        selectedConversationId.value === conversationId &&
        active.value &&
        !active.value.stopped,
      'CONTEXT_CHANGED',
      '当前学习已变化，请重新确认'
    );
    const keys = ['goal', 'foundation', 'minutes', 'deadline', 'preference'];
    assert(fields && Object.keys(fields).every((key) => keys.includes(key)), 'INVALID_INPUT', '档案字段不合法');
    const scope = String(fields.goal || active.value.goal).trim();
    const at = Date.now();
    const operations = keys
      .filter((key) => String(fields[key] || '').trim())
      .map((field) => ({
        id: `${id}:${field}`,
        type: 'profile.set',
        at,
        data: { field, value: String(fields[field]).trim(), source: 'self_report', scope, conversationId }
      }));
    assert(operations.length, 'INVALID_INPUT', '请至少填写一项');
    if (fields.minutes)
      assert(
        /^\d{1,3}$/.test(fields.minutes) && Number(fields.minutes) >= 1 && Number(fields.minutes) <= 480,
        'INVALID_INPUT',
        '每日时间应为1到480分钟'
      );
    if (suggestion)
      operations.push({
        id: `${id}:plan-proposal`,
        type: 'message.add',
        at,
        data: {
          conversationId,
          role: 'assistant',
          content: suggestion.reason,
          proposal: { type: 'plan.set', data: suggestion }
        }
      });
    return commitJourneyBatch(operations);
  }
  function notice(content, id = learningId('notice'), extras = {}) {
    return commit(
      'message.add',
      { conversationId: selectedConversationId.value, role: 'notice', content, ...extras },
      id
    );
  }
  function deliverTeaching(segment, id, origin = 'local_tool') {
    return commit(
      'teaching.deliver',
      {
        conversationId: selectedConversationId.value,
        questionKey: questionKey(activeQuestion.value),
        method: segment.method,
        content: segment.content,
        ...(segment.contentBlocks ? { contentBlocks: segment.contentBlocks } : {}),
        origin,
        helped: segment.helped,
        ...(segment.visualReading ? { visualReading: segment.visualReading } : {}),
        ...(segment.helped ? { level: segment.level } : {})
      },
      id
    );
  }
  function start(goal, task) {
    error.value = '';
    const conversation = commit('conversation.start', { goal, ...(task ? { task: normalizeLearningTask(task) } : {}) });
    selectedConversationId.value = conversation.id;
    const id = learningId('q');
    const genre = /^(?:英文|英语)说明(?:写作)?[。.!]?$/u.test(goal.trim())
      ? 'explanation'
      : /^(?:英文|英语)论证(?:写作)?[。.!]?$/u.test(goal.trim())
        ? 'argument'
        : /^(?:英文|英语)邮件(?:写作)?[。.!]?$/u.test(goal.trim())
          ? 'email'
          : /^(?:英文|英语)学术讨论(?:写作)?[。.!]?$/u.test(goal.trim())
            ? 'discussion'
            : /^中文叙事(?:写作)?[。.!]?$/u.test(goal.trim())
              ? 'narrative'
              : /^中文材料论证(?:写作)?[。.!]?$/u.test(goal.trim())
                ? 'material_argument'
                : null;
    const question =
      (/^函数运算带练[。.!]?$/u.test(goal.trim()) ? createOatutorQuestion(id, conversation.id) : null) ||
      localPressureQuestion(id, conversation.id, goal) ||
      localDensityQuestion(id, conversation.id, goal) ||
      localEnergyQuestion(id, conversation.id, goal) ||
      localVelocityGraphQuestion(id, conversation.id, goal) ||
      (/^(?:英文|英语)句子组织[。.!]?$/u.test(goal.trim()) ? createSentenceQuestion(id, conversation.id) : null) ||
      (genre ? createWritingQuestion(id, conversation.id, genre) : null) ||
      (/^(?:英文|英语)通知(?:写作)?[。.!]?$/u.test(goal.trim()) ? createNoticeQuestion(id, conversation.id) : null) ||
      createConditionQuestion(id, goal) ||
      createAlgebraQuestion(id, goal) ||
      createArithmeticQuestion(id, goal, activeStrategy.value.difficulty);
    if (question) addQuestion(question);
    return conversation;
  }
  function startCoach(goal) {
    assert(!busy.value, 'BUSY', '请等待当前请求完成');
    // 新带练使用同一个学习档案与历史事件，旧对话保持可回看。
    const conversation = commit('conversation.start', { goal: String(goal || '考研英语写作').slice(0, 400) });
    selectedConversationId.value = conversation.id;
    commit('coach.begin', { conversationId: conversation.id, explicit: true });
    selectedMode.value = 'cloud';
    return conversation;
  }
  function startSingleQuestion(goal) {
    idleRecords();
    assert(!intakeBusy.value && !reply.value?.pending, 'BUSY', '请等待或取消当前请求');
    assert(singleQuestionAvailable.value, 'UNSUPPORTED', '当前服务尚未支持单题答疑');
    assert(
      getToken() &&
        models.value.some(
          (model) =>
            model.id === modelId.value && model.source === 'byok' && model.configured && !model.requiresModelSelection
        ),
      'NEEDS_CONNECTION',
      '请先选择自己的 AI 连接'
    );
    assert(sharingAllowed.value, 'CONSENT_REQUIRED', '请先授权本次问题发送');
    assert(typeof goal === 'string' && goal.trim() && goal.length <= 1000, 'INVALID_INPUT', '请写下本次问题');
    const conversation = commit('conversation.start', {
      goal,
      entryContract: SINGLE_QUESTION_CONTRACT,
      explicit: true
    });
    selectedConversationId.value = conversation.id;
    selectedMode.value = 'cloud';
    error.value = '';
    retryState.value = { phase: 'idle', errorCode: null, message: '' };
    return conversation;
  }
  function coachSave(type, data = {}) {
    assert(active.value?.coach && !busy.value, 'BUSY', '请回到当前带练，等待请求结束');
    return commit(`coach.${type}`, {
      ...data,
      ...(type === 'answer' ? { predictionContract: WRITING_PREDICTION_CONTRACT } : {}),
      conversationId: active.value.id,
      explicit: true,
      day: dayKey(Date.now(), state.value.timezone)
    });
  }
  function coachReview(itemId, answer) {
    const item = active.value?.coach?.library.find((v) => v.id === itemId);
    assert(item, 'NOT_FOUND', '句式已变化');
    const rating = phraseReviewRating(item, answer);
    const card = item.schedule
      ? {
          ...item.schedule,
          due: new Date(item.schedule.due),
          ...(item.schedule.last_review ? { last_review: new Date(item.schedule.last_review) } : {})
        }
      : createNewCard();
    const { card: scheduled } = scheduleCard(card, rating, new Date(), captureSession());
    return coachSave('review', {
      itemId,
      answer,
      rating,
      ratingSource: 'host-v1',
      schedule: JSON.parse(JSON.stringify(scheduled))
    });
  }
  function coachPractice(itemId, answer) {
    const item = active.value?.coach?.library.find((entry) => entry.id === itemId);
    assert(item, 'NOT_FOUND', '句式已变化');
    const rating = phraseReviewRating(item, answer);
    assert(DEV_TEST, 'FORBIDDEN', '当前渠道不支持主动复习');
    return coachSave('review', { itemId, answer, rating, practice: true, ratingSource: 'host-v1' });
  }
  async function requestCoach(phase, target = phase, requestId = null) {
    assert(!busy.value && !reply.value?.pending, 'BUSY', '请等待当前请求完成');
    const control = beginReply('coach', requestId || learningId('coach'));
    let result;
    try {
      result = await requestCoachTurn(phase, target, requestId, control);
      return result;
    } finally {
      finishReply(control, result?.success ? reply.value?.content : '');
    }
  }
  async function requestCoachTurn(phase, target, requestId, requestController) {
    refresh();
    const session = ensureSessionCurrent(),
      owner = state.value.owner;
    assert(!busy.value && active.value?.coach && !active.value.stopped, 'BUSY', '请回到当前未停止的带练');
    assert(getToken(), 'AUTH_REQUIRED', '登录后开始 AI 带练，建档和原答已保留');
    const conversationId = active.value.id,
      context = recordContext(),
      today = dayKey(Date.now(), state.value.timezone);
    const coach = active.value.coach;
    let request = coach.requests.find(
      (v) =>
        (v.status === 'pending' || (requestId && v.status === 'closed')) &&
        v.request.phase === phase &&
        v.request.target === target &&
        (requestId ? v.id === requestId : v.request.day === today)
    );
    assert(!requestId || request, 'NOT_FOUND', '原请求不存在');
    const requestDay = request?.request.day || today;
    const retryOf = request?.status === 'closed' ? request.id : null;
    if (retryOf) request = null;
    const day = coach.days.find((v) => v.day === requestDay);
    const bound = coachInputFor(coach, day, phase, target);
    const recovering = Boolean(request);
    assert(
      recovering || sharingAllowed.value,
      'CONSENT_REQUIRED',
      '请先确认本次带练所需的资料片段与原答可发送给所选模型'
    );
    if (DEV_TEST) {
      await learningWriteLease.waitUntilWritable(owner);
      assert(!requestController.signal.aborted, 'CANCELLED', '请求已取消');
      ensureSessionCurrent(session);
      assert(
        recordContext() === context &&
          active.value?.id === conversationId &&
          !busy.value &&
          (recovering || sharingAllowed.value),
        'CONTEXT_CHANGED',
        '当前学习或共享授权已变化，请重新确认'
      );
    }
    if (!request) {
      const listed = await loadModels();
      assert(!requestController.signal.aborted, 'CANCELLED', '请求已取消');
      assert(recordContext() === context && active.value?.id === conversationId, 'CONTEXT_CHANGED', '当前学习已变化');
      assert(listed.success, 'MODEL_DISABLED', listed.message || '平台模型暂不可用');
      const model = modelId.value ? models.value.find((m) => m.id === modelId.value) : null;
      assert(
        model && (model.source !== 'platform' || listed.data.platformEnabled),
        'NEEDS_CONNECTION',
        modelId.value ? '所选模型暂不可用，请重新选择；不会自动切换模型' : '请先在 AI 连接器接入自己的 API'
      );
      assert(
        !streamEnabled.value || (model.capabilities?.stream === true && streamPlatform !== 'unsupported'),
        'STREAM_UNSUPPORTED',
        '当前模型或终端不支持所选流式模式；请主动选择非流式'
      );
      const weaknesses = coachWeaknesses(coach);
      const sources = coachMaterialContext(state.value, active.value, { phase, ...bound, weaknesses });
      const subjectMethod = subjectCoachMethod(coach.profile.exam, coach.profile.methodContract);
      assert(
        (coach.profile.exam !== 'cs408' && (!subjectMethod?.sourceRequired || phase === 'summary')) || sources.length,
        'MATERIAL_REQUIRED',
        subjectMethod ? `请先添加${subjectMethod.subject}材料` : '请先添加专业课资料'
      );
      const id = retryOf ? learningId('coach') : reply.value.requestId,
        binding = learningId('binding');
      const data = {
        contract: WRITING_COACH_CONTRACT,
        phase,
        target,
        day: requestDay,
        exam: coach.profile.exam ?? 'general',
        ...(subjectMethod ? { methodContract: subjectMethod.contract } : {}),
        minutes: coach.profile.minutes,
        ...(coach.profile.foundation ? { foundation: coach.profile.foundation } : {}),
        ...(coach.profile.examScope ? { examScope: coach.profile.examScope } : {}),
        essayType: coachEssayType(coach, requestDay),
        ...(['feedback', 'essay'].includes(phase) && coach.profile.exam !== 'cs408' && !subjectMethod
          ? { feedbackVersion: COACH_FEEDBACK_VERSION }
          : {}),
        ...(['diagnostic', 'daily'].includes(phase) && coach.profile.exam !== 'cs408' && !subjectMethod
          ? { exerciseContract: COACH_EXERCISE_CONTRACT, predictionContract: WRITING_PREDICTION_CONTRACT }
          : {}),
        ...(phase === 'summary' && coach.profile.exam !== 'cs408' && !subjectMethod
          ? { summaryContract: COACH_SUMMARY_CONTRACT }
          : {}),
        ...(['feedback', 'essay'].includes(phase) && coach.profile.exam !== 'cs408' && !subjectMethod
          ? { dimensionContract: 'writing-dimensions-v1', knowledgeContract: WRITING_KNOWLEDGE_CONTRACT }
          : {}),
        ...bound,
        sources,
        weaknesses
      };
      const writingBand =
        DEV_TEST && phase === 'essay' && !subjectMethod ? coachWritingBandContext(coach, day, id) : null;
      if (writingBand) data.writingBand = writingBand;
      commit('coach.request', {
        conversationId,
        explicit: true,
        requestId: id,
        request: data,
        ...(retryOf ? { retryOf } : {}),
        modelId: model.id,
        binding
      });
      request = active.value.coach.requests.find((v) => v.id === id);
    } else {
      assert(request.request.input === bound.input, 'CONTEXT_CHANGED', '原答已变化，旧请求只保留供核对');
    }
    reply.value.requestId = request.id;
    reply.value.id = `${request.id}:reply`;
    controller = requestController;
    pendingCloudCall = { id: request.id, owner, session };
    const revision = state.value.revision;
    const selectedModel = modelId.value,
      selectedProviderMode = selectedMode.value;
    const assertCurrent = () => {
      ensureSessionCurrent(session, requestController.signal);
      assert(
        recordContext() === context &&
          active.value?.id === conversationId &&
          !active.value.stopped &&
          state.value.revision === revision &&
          modelId.value === selectedModel &&
          selectedMode.value === selectedProviderMode &&
          (recovering || sharingAllowed.value),
        'CONTEXT_CHANGED',
        '当前学习、模型或共享授权已变化，未采用旧响应'
      );
    };
    busy.value = true;
    error.value = '';
    coachError.value = '';
    retryState.value = {
      phase: 'running',
      requestId: request.id,
      errorCode: null,
      message: recovering ? '正在查询原请求' : '正在请求模型'
    };
    streamPreview.value = '';
    try {
      assertCurrent();
      // 已发送的请求只查询原结果；超时、断网和刷新均不会重发。
      const options = {
        session: boundSession,
        expectedOwner: owner,
        signal: requestController.signal,
        assertCurrent,
        stream: streamEnabled.value,
        onPreview: (text) => {
          assertCurrent();
          previewReply(requestController, text);
        }
      };
      const result = recovering
        ? await fetchLearningResult(request.id, options)
        : await generateLearningTurn(
            {
              modelId: request.modelId,
              requestId: request.id,
              requestBinding: request.binding,
              shareConsent: true,
              messages: [{ role: 'user', content: request.request.input }],
              learningContext: {
                owner,
                goal: active.value.goal,
                snapshot: compactLearningProgress(state.value, conversationId),
                coach: request.request
              }
            },
            options
          );
      assertCurrent();
      if (!result.success) {
        if (['failed', 'cancelled'].includes(result.status) || (recovering && [404, 410].includes(result.code)))
          commit('coach.closeRequest', {
            conversationId,
            explicit: true,
            requestId: request.id,
            closeAssessment: true,
            outcome:
              result.status === 'cancelled'
                ? 'cancelled'
                : result.code === 404
                  ? 'not_found'
                  : result.code === 410
                    ? 'expired'
                    : 'failed'
          });
        retryState.value = {
          phase: 'failed',
          requestId: request.id,
          status: result.status,
          errorCode: result.error || result.errorCode || String(result.code),
          message: modelErrorPresentation({ ...result, retryAllowed: true }).message
        };
        coachError.value =
          (result.message || '请求未完成，原答已保存；可查询原请求结果') +
          (DEV_TEST && Number.isInteger(result.upstreamStatus)
            ? `（上游 HTTP ${result.upstreamStatus}${['json_validate_failed', 'rate_limit_exceeded', 'context_length_exceeded', 'invalid_request_error', 'failed_generation', 'invalid_json'].includes(result.upstreamCode) ? ` / ${result.upstreamCode}` : ''}）`
            : '');
        return result;
      }
      assert(
        result.data.requestId === request.id &&
          result.data.requestBinding === request.binding &&
          result.data.modelId === request.modelId,
        'CONTEXT_CHANGED',
        '结果与本次请求不符'
      );
      commit(
        'coach.result',
        {
          conversationId,
          explicit: true,
          requestId: request.id,
          output: result.data.coach,
          ...((request.request.knowledgeContract ||
            request.request.predictionContract ||
            subjectCoachMethodByContract(request.request.methodContract)) &&
          result.data.modelOrigin
            ? { modelOrigin: result.data.modelOrigin }
            : {})
        },
        `${request.id}:result`
      );
      reply.value.content = safeLearningMessage(result.data.message || '');
      retryState.value = { phase: 'succeeded', requestId: request.id, errorCode: null, message: '已收到结果' };
      return result;
    } catch (failure) {
      if (controller === requestController && recordContext() === context) {
        retryState.value = {
          phase: 'failed',
          requestId: request.id,
          errorCode: failure.code || 'MODEL_FAILED',
          message: modelErrorPresentation(failure).message
        };
        coachError.value = retryState.value.message;
      }
      throw failure;
    } finally {
      if (controller === requestController) {
        controller = null;
        busy.value = false;
        pendingCloudCall = null;
        streamPreview.value = '';
      }
    }
  }
  function writingContext() {
    return JSON.stringify([recordContext(), selectedConversationId.value, active.value?.activeQuestionKey]);
  }
  function oatutorContext() {
    return JSON.stringify([writingContext(), state.value.revision, !!active.value?.stopped]);
  }
  function requireOatutorContext(expectedContext) {
    idleRecords();
    refresh();
    assert(expectedContext === oatutorContext(), 'CONTEXT_CHANGED', '学习已变化，请回到当前带练');
    assert(active.value && !active.value.stopped && !busy.value, 'STOPPED', '当前任务已停止或正在处理');
    assert(activeQuestion.value?.oatutorExercise?.role === 'main', 'PRECONDITION', '请先选择函数带练');
  }
  function startOatutor(expectedContext, itemId) {
    requireOatutorContext(expectedContext);
    const existing = state.value.questions.find(
      (q) =>
        q.oatutorExercise?.role === 'main' &&
        q.oatutorExercise.conversationId === active.value.id &&
        q.oatutorExercise.itemId === itemId &&
        q.oatutorExercise.packVersion === 1
    );
    if (existing) return focus(questionKey(existing));
    return addQuestion(createOatutorQuestion(learningId('oatutor_q'), active.value.id, itemId));
  }
  function oatutorAction(expectedContext, action, nodeId, answer, submissionId) {
    requireOatutorContext(expectedContext);
    const operations = {
      open: 'oatutor.node.open',
      submit: 'oatutor.scaffold.submit',
      reference: 'oatutor.reference.read',
      final: 'oatutor.final.read'
    };
    assert(operations[action], 'INVALID_INPUT', '带练操作不支持');
    return commit(
      operations[action],
      {
        conversationId: active.value.id,
        questionKey: active.value.activeQuestionKey,
        ...(nodeId !== undefined ? { nodeId } : {}),
        ...(action === 'submit' ? { answer, explicit: true } : {})
      },
      submissionId || learningId('oatutor')
    );
  }
  function startWriting(expectedContext, genreId = writingGenre(activeQuestion.value)) {
    idleRecords();
    refresh();
    assert(expectedContext === writingContext(), 'CONTEXT_CHANGED', '学习已切换，请重新打开写作');
    assert(!active.value?.stopped, 'STOPPED', '当前任务已停止');
    const genre = writingGenreInfo(genreId);
    if (!active.value) return start(genre.goal);
    const existing =
      activeQuestion.value?.writingExercise && writingGenre(activeQuestion.value) === genreId
        ? activeQuestion.value
        : state.value.questions
            .filter(
              (q) =>
                q.writingExercise?.conversationId === selectedConversationId.value &&
                q.writingExercise.phase === 'independent' &&
                writingGenre(q) === genreId
            )
            .at(-1);
    if (existing) {
      const key = questionKey(existing);
      const helped =
        active.value.activeQuestionKey === key
          ? active.value.pendingHints.length
          : active.value.helpQueues?.find((entry) => entry.questionKey === key)?.hints.length;
      const submitted = state.value.attempts.some((a) => a.questionKey === key && a.conversationId === active.value.id);
      if (!helped && !submitted) return focus(key);
      return addQuestion(
        createWritingQuestion(
          learningId('notice_independent'),
          selectedConversationId.value,
          genreId,
          nextWritingTask(state.value, selectedConversationId.value, genreId),
          submitted ? key : null
        )
      );
    }
    return addQuestion(createWritingQuestion(learningId('writing_q'), selectedConversationId.value, genreId));
  }
  function recordWritingHelp(expectedContext, content, genreId = writingGenre(activeQuestion.value)) {
    idleRecords();
    refresh();
    assert(expectedContext === writingContext(), 'CONTEXT_CHANGED', '学习已切换，请重新打开写作');
    assert(!active.value?.stopped, 'STOPPED', '当前任务已停止');
    if (!activeQuestion.value?.writingExercise || writingGenre(activeQuestion.value) !== genreId) return false;
    assert(typeof content === 'string' && content.length <= 500, 'RESOURCE_LIMIT', '写作提示过长');
    return commit('hint.add', { conversationId: selectedConversationId.value, content, level: 1 });
  }
  function readWritingReference(expectedContext, referenceId, referenceVersion, operationId) {
    idleRecords();
    refresh();
    assert(expectedContext === writingContext(), 'CONTEXT_CHANGED', '学习已切换，请重新打开参考');
    assert(active.value && !active.value.stopped, 'STOPPED', '当前任务已停止');
    const reference = publicWritingReference(referenceId, referenceVersion);
    const result = commit(
      'hint.add',
      {
        conversationId: selectedConversationId.value,
        questionKey: active.value.activeQuestionKey,
        referenceId,
        referenceVersion
      },
      operationId
    );
    return { hintId: result.hintId, reference };
  }
  function readChatWritingReference(id) {
    const selected = PUBLIC_WRITING_REFERENCES.find((reference) => reference.genreId === 'email');
    assert(canReadChatWritingReference.value && selected, 'CAPABILITY_UNAVAILABLE', '当前题目没有本地邮件参考');
    const reference = publicWritingReference(selected.id, selected.version);
    const content = [
      '公开参考内容，不计入学习记录。',
      reference.title,
      reference.excerpt,
      `${reference.copyright} · ${reference.author}`,
      reference.publisher,
      reference.changes,
      reference.versionNote,
      reference.url,
      `${reference.license} · ${reference.licenseUrl}`
    ]
      .filter(Boolean)
      .join('\n\n');
    assert(content.length <= 8000, 'RESOURCE_LIMIT', '本地参考超出聊天长度限制');
    const result = readWritingReference(writingContext(), reference.id, reference.version, `${id}:writing-reference`);
    notice(content, `${id}:reply`);
    return { localWritingReference: true, referenceId: reference.id, hintId: result.hintId };
  }
  function openVocabulary(expectedContext, word) {
    idleRecords();
    refresh();
    assert(expectedContext === writingContext(), 'CONTEXT_CHANGED', '写作已切换，请重新选择词语');
    const result = commit('vocabulary.open', {
      conversationId: selectedConversationId.value,
      writingQuestionKey: active.value?.activeQuestionKey,
      word
    });
    return state.value.questions.find((q) => questionKey(q) === result.questionKey);
  }
  function submitVocabulary(expectedContext, key, answer) {
    idleRecords();
    refresh();
    assert(expectedContext === writingContext(), 'CONTEXT_CHANGED', '写作已切换，旧词义选择未保存');
    return commit('vocabulary.submit', {
      conversationId: selectedConversationId.value,
      questionKey: key,
      answer,
      explicit: true
    });
  }
  function vocabularyTaskFor(key, phase = 'retest', delayDays = 1) {
    assert(
      ['retest', 'usage'].includes(phase) && [1, 3, 7].includes(delayDays) && (phase === 'retest' || delayDays === 1),
      'INVALID_INPUT',
      '词义复测间隔不支持'
    );
    const day =
      phase === 'retest'
        ? vocabularyReviewDay(dayKey(Date.now(), state.value.timezone), delayDays)
        : dayKey(Date.now(), state.value.timezone);
    const target = state.value.questions.find(
      (q) =>
        q.vocabularyReview?.originQuestionKey === key &&
        q.vocabularyReview.phase === phase &&
        (phase !== 'retest' || (q.vocabularyReview.dueDay === day && (q.vocabularyReview.delayDays ?? 1) === delayDays))
    );
    if (!target) return null;
    const plan = latestPlanForDay(day);
    return plan?.tasks.some((t) => t.questionKey === questionKey(target))
      ? { questionKey: questionKey(target), day, conversationId: target.vocabularyReview.conversationId }
      : null;
  }
  function startVocabularyTask(expectedContext, key, phase, delayDays = 1) {
    idleRecords();
    refresh();
    assert(expectedContext === writingContext(), 'CONTEXT_CHANGED', '写作已切换，请重新打开词语任务');
    assert(active.value && !active.value.stopped, 'STOPPED', '当前任务已停止');
    assert(['retest', 'usage'].includes(phase), 'INVALID_INPUT', '词语任务类型不支持');
    assert(
      [1, 3, 7].includes(delayDays) && (phase === 'retest' || delayDays === 1),
      'INVALID_INPUT',
      '词义复测间隔不支持'
    );
    const origin = state.value.questions.find((q) => questionKey(q) === key);
    assert(
      origin?.vocabularyExercise?.writingQuestionKey === active.value.activeQuestionKey &&
        origin.vocabularyExercise.conversationId === selectedConversationId.value,
      'CONTEXT_CHANGED',
      '请回到原写作安排词语任务'
    );
    const attempt = state.value.attempts.find(
      (a) => a.questionKey === key && a.conversationId === selectedConversationId.value
    );
    assert(attempt, 'PRECONDITION', '请先确认词义选择');
    const existing = vocabularyTaskFor(key, phase, delayDays);
    if (existing) {
      if (phase === 'usage') focus(existing.questionKey, existing.conversationId);
      return existing;
    }
    const plannedDay = dayKey(Date.now(), state.value.timezone),
      day = phase === 'retest' ? vocabularyReviewDay(plannedDay, delayDays) : plannedDay;
    const plan = latestPlanForDay(day);
    assert((plan?.tasks.length || 0) < 100, 'RESOURCE_LIMIT', '词语计划已满');
    let target = state.value.questions.find(
      (q) =>
        q.vocabularyReview?.originQuestionKey === key &&
        q.vocabularyReview.phase === phase &&
        (phase !== 'retest' || (q.vocabularyReview.dueDay === day && (q.vocabularyReview.delayDays ?? 1) === delayDays))
    );
    if (!target) {
      const count = state.value.questions.filter(
        (q) =>
          q.vocabularyReview?.senseId === origin.vocabularyExercise.senseId &&
          q.vocabularyReview.phase === 'retest' &&
          q.vocabularyReview.contract === VOCABULARY_REVIEW_CONTRACT
      ).length;
      target = createVocabularyReviewQuestion(
        learningId('vocabulary_task'),
        origin,
        attempt.id,
        phase,
        phase === 'retest' ? { day: plannedDay, timezone: state.value.timezone } : null,
        phase === 'retest' ? (delayDays === 1 ? count % 2 : delayDays === 3 ? 0 : 1) : 0,
        delayDays
      );
      commit('question.add', { question: target });
    }
    commit('plan.set', {
      day,
      tasks: [
        ...(plan?.tasks || []).map((t) => ({ ...t })),
        {
          id: `${target.id}:task`,
          title: target.prompt,
          questionKey: questionKey(target),
          condition: phase === 'retest' ? 'independent_correct' : 'submitted'
        }
      ],
      reason:
        phase === 'retest'
          ? delayDays === 1
            ? '用户安排明日词义复测，需无提示且正确'
            : `用户安排${delayDays}天后词义复测，需无提示且正确`
          : '用户开始自由写句；提交不代表用法正确'
    });
    if (phase === 'usage') focus(questionKey(target), target.vocabularyReview.conversationId);
    return { questionKey: questionKey(target), day, conversationId: target.vocabularyReview.conversationId };
  }
  function recordDiagramHelp(expectedContext, input) {
    idleRecords();
    refresh();
    assert(expectedContext === writingContext(), 'CONTEXT_CHANGED', '学习已切换，请重新确认原图');
    assert(active.value && !active.value.stopped, 'STOPPED', '当前任务已停止');
    const source = sourceDiagram(state.value, activeQuestion.value, selectedConversationId.value);
    assert(source, 'IMAGE_SOURCE_UNAVAILABLE', '本题原页图或提取版本已不可用');
    const recipe = confirmedDiagramRecipe(input, source);
    return commit('hint.add', {
      conversationId: selectedConversationId.value,
      content: diagramHelpContent(recipe, source.binding.page),
      level: 1
    });
  }
  function startScience(expectedContext, input) {
    idleRecords();
    refresh();
    assert(expectedContext === writingContext(), 'CONTEXT_CHANGED', '学习已切换，请重新打开动画');
    assert(!active.value?.stopped, 'STOPPED', '当前任务已停止');
    const observed = scienceInput(input);
    const next = nextScienceInput(observed);
    if (!active.value) start('物理独立检验');
    const original = activeQuestion.value;
    const sameExercise =
      original?.scienceExercise &&
      JSON.stringify(scienceInput(original.scienceExercise.input)) === JSON.stringify(observed);
    const parent =
      sameExercise || sourceDiagram(state.value, original, selectedConversationId.value) ? questionKey(original) : null;
    const question = availableScienceQuestion(learningId('science_q'), next, parent);
    if (state.value.questions.some((q) => questionKey(q) === questionKey(question)))
      return focus(questionKey(question));
    return addQuestion(question, 'independent_correct');
  }
  function availableScienceQuestion(id, input, parent = null) {
    let next = input;
    const findExisting = () =>
      state.value.questions.find(
        (q) =>
          q.scienceExercise?.phase === 'independent' &&
          q.scienceExercise.conversationId === selectedConversationId.value &&
          (q.parentQuestionKey || null) === parent &&
          JSON.stringify(q.scienceExercise.input) === JSON.stringify(next)
      );
    let existing = findExisting(),
      remaining = state.value.questions.length + 1;
    // 未使用的新题可复用；已看帮助或提交过的题目继续换条件，不能伪装成撤去支架的独立检验。
    while (existing) {
      const key = questionKey(existing);
      const helped =
        active.value.activeQuestionKey === key
          ? active.value.pendingHints.length
          : active.value.helpQueues?.find((entry) => entry.questionKey === key)?.hints.length;
      const submitted = state.value.attempts.some(
        (a) => a.questionKey === key && a.conversationId === selectedConversationId.value
      );
      if (!helped && !submitted) break;
      assert(--remaining > 0, 'RESOURCE_LIMIT', '独立检验需要可用的新条件');
      parent = key;
      next = nextScienceInput(existing.scienceExercise.input);
      existing = findExisting();
    }
    return existing || createScienceQuestion(id, selectedConversationId.value, next, parent);
  }
  function requireSentenceContext(expectedContext) {
    idleRecords();
    refresh();
    assert(expectedContext === writingContext(), 'CONTEXT_CHANGED', '学习已切换，请回到当前句子');
    assert(active.value?.id && !active.value.stopped && !busy.value, 'STOPPED', '当前任务已停止或正在处理');
    assert(activeQuestion.value?.sentenceExercise, 'PRECONDITION', '请先选择句子任务');
  }
  function submitSentence(expectedContext, order) {
    requireSentenceContext(expectedContext);
    return submit(sentenceAnswer(activeQuestion.value, order), true);
  }
  function recordSentenceHelp(expectedContext) {
    requireSentenceContext(expectedContext);
    const content = sentenceHint(activeQuestion.value);
    if (
      !active.value.pendingHints.some((h) => h.content === content && h.questionKey === active.value.activeQuestionKey)
    )
      commit('hint.add', { conversationId: selectedConversationId.value, content, level: 1 });
    return content;
  }
  function startSentenceTask(expectedContext) {
    requireSentenceContext(expectedContext);
    const key = questionKey(activeQuestion.value);
    const submitted = state.value.attempts.some(
      (a) => a.questionKey === key && a.conversationId === selectedConversationId.value
    );
    return addQuestion(
      createSentenceQuestion(
        learningId('sentence_q'),
        selectedConversationId.value,
        nextSentenceTask(state.value, selectedConversationId.value),
        submitted ? key : null
      ),
      'independent_correct'
    );
  }
  const sentenceCanSubmit = () => {
    void calendarTime.value;
    return sentenceRetestReady(activeQuestion.value);
  };
  const sentenceRetest = computed(() => {
    const key = activeQuestion.value && questionKey(activeQuestion.value);
    for (const q of state.value.questions.slice().reverse()) {
      if (
        q.sentenceExercise?.phase !== 'retest' ||
        q.parentQuestionKey !== key ||
        q.sentenceExercise.conversationId !== selectedConversationId.value
      )
        continue;
      const plan = latestPlanForDay(q.sentenceExercise.dueDay, q.sentenceExercise.conversationId);
      if (plan?.tasks.some((t) => t.questionKey === questionKey(q)))
        return { questionKey: questionKey(q), day: plan.day, conversationId: q.sentenceExercise.conversationId };
    }
    return null;
  });
  function scheduleSentenceRetest(expectedContext) {
    requireSentenceContext(expectedContext);
    const key = questionKey(activeQuestion.value);
    assert(
      state.value.attempts.some((a) => a.questionKey === key && a.conversationId === selectedConversationId.value),
      'PRECONDITION',
      '请先提交当前句子的作答'
    );
    if (sentenceRetest.value) return sentenceRetest.value;
    const plannedDay = dayKey(Date.now(), state.value.timezone),
      day = nextNoticeDay(plannedDay);
    const plan = latestPlanForDay(day);
    assert((plan?.tasks.length || 0) < 100, 'RESOURCE_LIMIT', '明日计划已满');
    let target = state.value.questions.find(
      (q) =>
        q.sentenceExercise?.phase === 'retest' &&
        q.sentenceExercise.conversationId === selectedConversationId.value &&
        q.parentQuestionKey === key &&
        q.sentenceExercise.dueDay === day
    );
    if (!target) {
      target = createSentenceQuestion(
        learningId('sentence_retest'),
        selectedConversationId.value,
        nextSentenceTask(state.value, selectedConversationId.value),
        key,
        { day: plannedDay, timezone: state.value.timezone }
      );
      commit('question.add', { question: target });
    }
    commit('plan.set', {
      day,
      tasks: [
        ...(plan?.tasks || []).map((t) => ({ ...t })),
        {
          id: `${target.id}:task`,
          title: target.prompt,
          questionKey: questionKey(target),
          condition: 'independent_correct'
        }
      ],
      reason: '用户安排明日新句子复测；需无提示且匹配本题组合'
    });
    return sentenceRetest.value;
  }
  function recordScienceHelp(expectedContext, input) {
    idleRecords();
    refresh();
    assert(expectedContext === writingContext(), 'CONTEXT_CHANGED', '学习已切换，请重新打开动画');
    assert(active.value && !active.value.stopped, 'STOPPED', '当前任务已停止');
    const q = activeQuestion.value;
    assert(q?.scienceExercise || q?.subject === '物理', 'PRECONDITION', '请回到当前物理题');
    if (q.scienceExercise?.input?.template === PRESSURE_TEMPLATE || input?.template === PRESSURE_TEMPLATE)
      assert(
        q.scienceExercise?.input?.template === PRESSURE_TEMPLATE &&
          JSON.stringify(scienceInput(input)) === JSON.stringify(scienceInput(q.scienceExercise.input)),
        'CONTEXT_CHANGED',
        '请回到当前压强题的条件。'
      );
    const content = scienceVisualHelpContent(input),
      key = questionKey(q);
    if (active.value.pendingHints.some((h) => h.questionKey === key && h.content === content && h.level === 1))
      return true;
    commit('hint.add', { conversationId: selectedConversationId.value, content, level: 1 });
    return true;
  }
  // 渲染订阅可见时钟，动作再次读取真实当前时间，不沿用后台或昨日值。
  const scienceCanSubmit = () => {
    void calendarTime.value;
    return scienceRetestReady(activeQuestion.value);
  };
  const writingCanSubmit = () => {
    void calendarTime.value;
    return writingRetestReady(activeQuestion.value);
  };
  const vocabularyCanSubmit = () => {
    void calendarTime.value;
    return vocabularyRetestReady(activeQuestion.value);
  };
  const scienceRetest = computed(() => {
    const key = activeQuestion.value && questionKey(activeQuestion.value);
    for (const q of state.value.questions) {
      if (
        q.scienceExercise?.phase !== 'retest' ||
        q.parentQuestionKey !== key ||
        q.scienceExercise.conversationId !== selectedConversationId.value
      )
        continue;
      const plan = latestPlanForDay(q.scienceExercise.dueDay, q.scienceExercise.conversationId);
      if (plan?.tasks.some((t) => t.questionKey === questionKey(q)))
        return { questionKey: questionKey(q), day: plan.day, conversationId: q.scienceExercise.conversationId };
    }
    return null;
  });
  function scheduleScienceRetest() {
    idleRecords();
    refresh();
    assert(active.value && !active.value.stopped, 'STOPPED', '当前任务已停止');
    const original = activeQuestion.value,
      key = original && questionKey(original);
    assert(
      original?.scienceExercise &&
        state.value.attempts.some((a) => a.questionKey === key && a.conversationId === selectedConversationId.value),
      'PRECONDITION',
      '请先提交当前题目的作答'
    );
    if (scienceRetest.value) return scienceRetest.value;
    const plannedDay = dayKey(Date.now(), state.value.timezone),
      day = nextNoticeDay(plannedDay);
    const plan = latestPlanForDay(day);
    assert((plan?.tasks.length || 0) < 100, 'RESOURCE_LIMIT', '明日计划已满');
    let target = state.value.questions.find(
      (q) =>
        q.scienceExercise?.phase === 'retest' &&
        q.scienceExercise.conversationId === selectedConversationId.value &&
        q.parentQuestionKey === key &&
        q.scienceExercise.dueDay === day
    );
    if (!target) {
      target = createScienceQuestion(
        learningId('science_retest'),
        selectedConversationId.value,
        nextScienceInput(original.scienceExercise.input),
        key,
        { day: plannedDay, timezone: state.value.timezone }
      );
      commit('question.add', { question: target });
    }
    commit('plan.set', {
      day,
      tasks: [
        ...(plan?.tasks || []).map((t) => ({ ...t })),
        {
          id: `${target.id}:task`,
          title: target.prompt,
          questionKey: questionKey(target),
          condition: 'independent_correct'
        }
      ],
      reason: '用户安排明日科学复测，需无提示且正确'
    });
    return scienceRetest.value;
  }
  const writingRetest = computed(() => {
    const key = activeQuestion.value && questionKey(activeQuestion.value);
    for (const q of state.value.questions.slice().reverse()) {
      if (
        q.writingExercise?.phase !== 'retest' ||
        q.parentQuestionKey !== key ||
        q.writingExercise.conversationId !== selectedConversationId.value
      )
        continue;
      const plan = latestPlanForDay(q.writingExercise.dueDay, q.writingExercise.conversationId);
      if (plan?.tasks.some((t) => t.questionKey === questionKey(q)))
        return { questionKey: questionKey(q), day: plan.day, conversationId: q.writingExercise.conversationId };
    }
    return null;
  });
  function writingAttempt(id = null) {
    const attempt = state.value.attempts
      .filter(
        (a) => a.questionKey === active.value?.activeQuestionKey && a.conversationId === selectedConversationId.value
      )
      .at(-1);
    assert(
      activeQuestion.value?.writingExercise && attempt && (!id || attempt.id === id),
      'CONTEXT_CHANGED',
      '请先提交当前写作的独立作答'
    );
    assert(
      !EXTENDED_WRITING_CONTRACTS.includes(activeQuestion.value.writingExercise.contract) ||
        !attempt.corrections?.length,
      'CONTEXT_CHANGED',
      '原答已校对，请提交新原答再获取反馈'
    );
    return attempt;
  }
  function feedbackAttempt(id = null) {
    if (activeQuestion.value?.vocabularyReview?.phase !== 'usage') return writingAttempt(id);
    vocabularyUseFeedbackBasis(activeQuestion.value, state.value);
    const attempt = state.value.attempts
      .filter(
        (a) => a.questionKey === active.value?.activeQuestionKey && a.conversationId === selectedConversationId.value
      )
      .at(-1);
    assert(!active.value?.stopped, 'STOPPED', '当前任务已停止');
    assert(
      attempt && (!id || attempt.id === id) && !attempt.corrections?.length,
      'CONTEXT_CHANGED',
      '请先提交当前原句；校对后需提交新的原句'
    );
    return attempt;
  }
  function scheduleWritingRetest() {
    idleRecords();
    refresh();
    assert(!active.value?.stopped, 'STOPPED', '当前任务已停止');
    writingAttempt();
    if (writingRetest.value) return writingRetest.value;
    const key = questionKey(activeQuestion.value),
      plannedDay = dayKey(Date.now(), state.value.timezone),
      day = nextNoticeDay(plannedDay);
    const plan = latestPlanForDay(day);
    assert((plan?.tasks.length || 0) < 100, 'RESOURCE_LIMIT', '明日计划已满');
    // 计划保存失败时保留新题，重试复用同一题，不消耗另一任务或丢失原答。
    let target = state.value.questions.find(
      (q) =>
        q.writingExercise?.phase === 'retest' &&
        q.writingExercise.conversationId === selectedConversationId.value &&
        q.parentQuestionKey === key &&
        q.writingExercise.dueDay === day
    );
    if (!target) {
      target = createWritingQuestion(
        learningId('notice_retest'),
        selectedConversationId.value,
        writingGenre(activeQuestion.value),
        nextWritingTask(state.value, selectedConversationId.value, writingGenre(activeQuestion.value)),
        key,
        day,
        { day: plannedDay, timezone: state.value.timezone }
      );
      commit('question.add', { question: target });
    }
    commit('plan.set', {
      day,
      tasks: [
        ...(plan?.tasks || []).map((t) => ({ ...t })),
        { id: `${target.id}:task`, title: target.prompt, questionKey: questionKey(target), condition: 'submitted' }
      ],
      reason: '用户安排明日写作复测；提交不代表可靠掌握'
    });
    return writingRetest.value;
  }
  async function requestWritingFeedback() {
    idleRecords();
    refresh();
    assert(!active.value?.stopped, 'STOPPED', '当前任务已停止');
    const attempt = writingAttempt();
    assert(selectedMode.value !== 'offline', 'CAPABILITY_UNAVAILABLE', '请先选择 AI 助手');
    assert(sharingAllowed.value, 'CONSENT_REQUIRED', '请先确认数据流向');
    return send(
      '请按当前量表评阅已保存的写作原答，调用 assess 保存全部维度和准确原答引用。分值只是辅助，无法判断的维度留空。回复只讲一个最需要改进的地方和一个下一步，遵循我的教法。',
      { feedbackAttemptId: attempt.id }
    );
  }
  async function requestComputeReference(consent) {
    return requestUpstreamHelp(consent, false);
  }
  async function requestGrammarHelp(consent) {
    return requestUpstreamHelp(consent, true);
  }
  async function requestUpstreamHelp(consent, grammar) {
    const contract = grammar ? GRAMMAR_CONTRACT : COMPUTE_CONTRACT;
    const scopeFor = grammar ? grammarScopeFor : computeScopeFor;
    const normalize = grammar ? normalizeGrammarReference : normalizeComputeReference;
    const referenceText = grammar ? grammarReferenceText : computeReferenceText;
    const requestApi = grammar ? requestLearningGrammar : requestLearningComputation;
    idleRecords();
    learningRepository.prepareAsyncAction();
    refresh();
    assert(consent === true, 'CONSENT_REQUIRED', '请确认使用已同步的本题和原答获取建议');
    assert(
      state.value.owner !== 'guest' && getUserId() === state.value.owner && getToken(),
      'AUTH_REQUIRED',
      '登录并同步本题和原答后可获取建议'
    );
    const scope = scopeFor(state.value, selectedConversationId.value);
    const existing = active.value.messages.find(
      (m) =>
        m.upstreamReference?.contract === (grammar ? 'grammar-reference-v1' : 'sympy-reference-v1') &&
        m.upstreamReference.attemptId === scope.attemptId &&
        m.questionKey === scope.questionKey
    );
    if (existing) return { reused: true, messageId: existing.id };
    const request = {
      controller: new AbortController(),
      context: computeReferenceContext(),
      owner: state.value.owner,
      session: ensureSessionCurrent()
    };
    const epoch = `revision_${state.value.revision}`;
    computeRequest = request;
    controller = request.controller;
    busy.value = true;
    error.value = '';
    try {
      const response = await requestApi(
        {
          contract,
          action: grammar ? 'grammar_reference' : 'sympy_reference',
          consent: true,
          epoch,
          ...scope
        },
        {
          session: boundSession,
          expectedOwner: request.owner,
          signal: request.controller.signal,
          assertCurrent: () => ensureSessionCurrent(request.session, request.controller.signal)
        }
      );
      refresh();
      assert(
        !request.controller.signal.aborted && computeReferenceContext() === request.context,
        'CONTEXT_CHANGED',
        '任务已变化，未显示旧工具建议'
      );
      assert(response?.success, 'COMPUTE_FAILED', response?.message || '工具建议暂不可用，原答保持');
      const data = response.data;
      assert(
        data?.contract === contract &&
          data.ownerId === request.owner &&
          data.conversationId === scope.conversationId &&
          data.epoch === epoch &&
          data.gradingAuthority === false &&
          data.persisted === false &&
          data.requiresHelpRecord === true &&
          sameComputeSnapshot(data.expected, scope.expected),
        'INVALID_RESPONSE',
        '工具回执与本题原答不一致'
      );
      const reference = normalize(data.reference, state.value, scope.conversationId, scope.questionKey);
      // One atomic teaching event saves the help and message before either is displayed.
      computeRequest = null;
      return commit(
        'teaching.deliver',
        {
          conversationId: scope.conversationId,
          questionKey: scope.questionKey,
          method: 'explain',
          origin: 'upstream_reference',
          helped: true,
          level: 3,
          content: referenceText(reference),
          upstreamReference: reference
        },
        `${grammar ? 'grammar' : 'sympy'}_${reference.requestId}`
      );
    } catch (failure) {
      if (computeReferenceContext() === request.context) error.value = publicError(failure);
      throw failure;
    } finally {
      if (computeRequest === request) computeRequest = null;
      if (controller === request.controller) {
        controller = null;
        busy.value = false;
      }
    }
  }
  async function requestVocabularyFeedback() {
    idleRecords();
    refresh();
    assert(activeQuestion.value?.vocabularyReview?.phase === 'usage', 'PRECONDITION', '请打开自由写句任务');
    const attempt = feedbackAttempt();
    assert(selectedMode.value !== 'offline', 'CAPABILITY_UNAVAILABLE', '请先选择 AI 助手');
    assert(sharingAllowed.value, 'CONSENT_REQUIRED', '请先确认数据流向');
    return send(
      '请按当前词义和量表评阅我已提交的原句，仅调用 assess 保存全部维度和准确原答引用。核对词义、词形搭配和本句情境，无法判断的维度留空；不要按包含词语就判断用法正确。反馈一个改进点和一个下一步，遵循我的教法。',
      { feedbackAttemptId: attempt.id }
    );
  }
  function setRhythm(id) {
    assert(!busy.value, 'PRECONDITION', '请先结束或取消正在执行的请求，再调整学习节奏');
    for (const operation of rhythmOperations(id, selectedConversationId.value)) commit(operation.type, operation.data);
    if (id === 'review') {
      const target = summary.value.due[0] || summary.value.mistakes[0];
      if (target) focus(target.questionKey, target.conversationId || selectedConversationId.value, 'review');
      return { focused: Boolean(target) };
    }
    return { focused: false };
  }
  function addQuestion(question, condition = 'submitted') {
    const result = commit('question.add', { question });
    commit('question.focus', { conversationId: selectedConversationId.value, questionKey: result.questionKey });
    const tasks = latestPlanForDay(todaySummary.value.day)?.tasks || [];
    commit('plan.set', {
      tasks: [...tasks.map((t) => ({ ...t })), { title: question.prompt, questionKey: result.questionKey, condition }],
      reason:
        condition === 'independent_correct'
          ? '将当前练习加入今日任务，完成条件为独立正确'
          : '将当前练习加入今日任务，完成条件为正式作答'
    });
    return result;
  }
  function scheduleAttempt(attempt) {
    if (state.value.questions.find((q) => questionKey(q) === attempt.questionKey)?.vocabularyReview) return;
    if (effectiveGrade(attempt).status !== 'reliable') return;
    if (state.value.reviews.some((review) => review.attemptId === attempt.id)) return;
    // 使用同一份事实重建 FSRS，避免取消、更正、重试留下不可撤销的派生卡片。
    const attempts = state.value.attempts.filter(
      (a) => a.questionKey === attempt.questionKey && effectiveGrade(a).status === 'reliable'
    );
    const review = deriveConversationReview(attempts, state.value.reviews);
    if (!review?.evidenceIds.includes(attempt.id)) return;
    commit(
      'review.schedule',
      {
        attemptId: attempt.id,
        due: Math.max(attempt.at + 1000, review.due),
        rating: review.rating,
        policy: review.policy,
        evidenceIds: review.evidenceIds
      },
      `${attempt.id}:review`
    );
  }
  function submit(answer, explicit = false, id = learningId('answer'), options = {}) {
    const { chatEntry: _chatEntry, poetry: _poetry, ...attemptOptions } = options;
    const result = commit(
      explicit === true
        ? attemptSubmissionType(activeQuestion.value, state.value.events.find((event) => event.id === id)?.type)
        : 'attempt.submit',
      { conversationId: selectedConversationId.value, answer, explicit, ...attemptOptions },
      id
    );
    if (result.clarification) {
      notice(result.message, `${id}:clarification`);
      return result;
    }
    const grade = effectiveGrade(result);
    const feedback =
      grade.status !== 'reliable'
        ? grade.basis === 'missing_domain_condition'
          ? '作答已保存；还需补充原式不能取的 x 值，例如“x+1，x≠1”。未补全前暂不判错。'
          : grade.basis === 'original_expression_repeated'
            ? '原式已保存；请给出变形后的等价表达及定义域，再检验本次效果。'
            : '作答已保存，判分待核对。'
        : activeQuestion.value?.sentenceExercise
          ? grade.outcome === 'correct'
            ? '本题组合正确。'
            : '本题组合需调整。'
          : activeQuestion.value?.vocabularyReview
            ? grade.outcome === 'correct'
              ? '本句选对。'
              : '本句需再认。'
            : grade.outcome === 'wrong'
              ? '这次答错了，已加入错题。'
              : grade.outcome === 'partial'
                ? '部分正确，请补全答案。'
                : '答对了。';
    notice(feedback, `${id}:feedback`, { attemptId: result.id });
    scheduleAttempt(result);
    const strategy = nextStrategy(state.value, result);
    if (strategy) {
      commit('strategy.set', { ...strategy, deliveryManaged: true }, `${id}:strategy`);
      if (
        selectedMode.value === 'offline' &&
        activeQuestion.value?.id &&
        ['prerequisite', 'steps', 'example', 'analogy'].includes(strategy.method)
      ) {
        const segment = localTeaching(activeQuestion.value, strategy.method);
        if (segment) deliverTeaching(segment, `${id}:remediation`);
      }
    }
    if (grade.status === 'reliable') {
      const q = state.value.questions.find((q) => questionKey(q) === result.questionKey);
      commit(
        'profile.set',
        {
          field: 'difficulty',
          value:
            grade.outcome === 'correct'
              ? result.hints.length
                ? '本次需要提示'
                : result.kind === 'redo'
                  ? '本次原题重做，仍待复测'
                  : ['review', 'variant'].includes(result.kind)
                    ? '本次独立检验，仍待复测'
                    : '本次独立完成'
              : '本次需复测',
          source: 'observed',
          scope: knowledgeScope(q),
          evidenceIds: [result.id]
        },
        `${id}:observation`
      );
    }
    const training = active.value?.trainingGroups?.find(
      (g) =>
        g.mode === 'guided' && !g.submittedBy && g.questionKeys.length === 1 && g.questionKeys[0] === result.questionKey
    );
    if (training)
      commit(
        'training.complete',
        { conversationId: active.value.id, groupId: training.id, attemptIds: [result.id], explicit: true },
        `${training.id}:complete`
      );
    return result;
  }
  function dispatchLearningAction(command) {
    refresh();
    assert(!busy.value && active.value, 'BUSY', '请等待当前任务结束');
    assert(
      command &&
        [
          'submit',
          'adopt_plan',
          'change_method',
          'hint_only',
          'explain',
          'resume',
          'read_reference',
          'independent_check',
          'prerequisite',
          'stop'
        ].includes(command.type),
      'INVALID_INPUT',
      '未识别此操作，未执行'
    );
    if (command.type === 'submit') return submit(command.answer, true);
    if (command.type === 'stop') {
      if (active.value.stopped) return null;
      const stopped = commit('task.stop', { conversationId: active.value.id });
      notice('当前任务已停止。');
      return stopped;
    }
    if (command.type === 'resume')
      return commit('task.resume', { conversationId: active.value.id, source: 'self_report' });
    if (command.type === 'read_reference') return readChatWritingReference(learningId('reference'));
    if (command.type === 'independent_check') return generateVariant();
    if (command.type === 'prerequisite') return diagnosePrerequisite();
    if (command.type === 'adopt_plan') {
      const message = active.value.messages.find(
        (entry) => entry.id === command.messageId && entry.proposal?.type === 'plan.set'
      );
      assert(message, 'NOT_FOUND', '没有可采用的计划，未执行');
      return commit(
        'plan.set',
        { ...message.proposal.data, proposalId: message.id, explicit: true },
        `${message.id}:accept`
      );
    }
    const method =
      command.type === 'hint_only'
        ? 'hint'
        : command.type === 'explain'
          ? 'explain'
          : activeStrategy.value.method === 'steps'
            ? 'example'
            : 'steps';
    const result = commit('strategy.set', {
      conversationId: active.value.id,
      method,
      reason: command.type === 'hint_only' ? '用户点击只要提示' : '用户点击换法',
      evidenceIds: [],
      source: 'self_report',
      deliveryManaged: true
    });
    // 按钮本身就是求助：切换教法后立刻交付本题的本地帮助，没有可交付内容时才只回执切换。
    const delivered = deliverRequestedTeaching(method);
    if (delivered) return { ...result, ...delivered };
    notice(command.type === 'hint_only' ? '已切换为只给提示。' : '已更换讲解方法。');
    return result;
  }
  function deliverRequestedTeaching(method) {
    const question = activeQuestion.value;
    if (!question || active.value.stopped || batchTrainingActive.value) return null;
    const id = learningId('help');
    if (method === 'hint' && question.sentenceExercise) {
      const content = recordSentenceHelp(writingContext());
      return { sentenceHint: content, ...notice(content, `${id}:sentence-hint`) };
    }
    const level = Math.min(3, Math.max(0, ...active.value.pendingHints.map((hint) => hint.level || 1)) + 1);
    const segment = localTeaching(question, method, level);
    return segment ? deliverTeaching(segment, `${id}:local-teaching`) : null;
  }
  // async keeps the action wrapper's promise contract: a stale session rejects instead of throwing synchronously.
  async function send(raw, options = {}) {
    const id = options.id || learningId('turn');
    if (sending.has(id)) return sending.get(id);
    // A correction is a new, explicitly sent user message. Keep the original
    // answer and invalidate its generation before accepting the correction.
    if (options.correctionOf) {
      assert(
        active.value?.messages.filter((m) => m.role === 'user').at(-1)?.id === options.correctionOf,
        'CONTEXT_CHANGED',
        '当前学习已变化'
      );
      cancel();
    }
    if (reply.value?.pending && !busy.value) {
      if (userDirective(raw, state.value, selectedConversationId.value)?.type === 'task.stop') cancel();
      else {
        error.value = '当前模型任务仍在执行，可以先取消请求或停止当前任务';
        return;
      }
    }
    if (busy.value || selectedMode.value === 'offline') return sendTurn(raw, { ...options, id });
    const control = beginReply('chat', id);
    const pending = sendTurn(raw, { ...options, id, presentationController: control }).finally(() => {
      if (replyController === control) {
        const saved = active.value?.messages.find((message) => message.id === `${id}:reply`);
        finishReply(control, saved?.content || '');
      }
      sending.delete(id);
    });
    sending.set(id, pending);
    return pending;
  }
  async function sendTurn(raw, options = {}) {
    ensureSessionCurrent();
    assert(!intakeBusy.value, 'BUSY', '请等待模型建档回复');
    if (
      getToken() &&
      selectedMode.value !== 'local' &&
      !models.value.some((model) => model.source === 'byok' && model.configured && !model.requiresModelSelection)
    )
      await loadModels();
    assert(!options.presentationController?.signal.aborted, 'CANCELLED', '请求已取消');
    assert(
      !getToken() ||
        selectedMode.value === 'local' ||
        models.value.some((model) => model.source === 'byok' && model.configured && !model.requiresModelSelection),
      'NEEDS_CONNECTION',
      '请先在 AI 连接器接入自己的 API'
    );
    if (options.feedbackAttemptId) {
      assert(!options.visual, 'FORBIDDEN', '写作反馈不发送图片');
      feedbackAttempt(options.feedbackAttemptId);
    }
    if (options.visual) {
      const model = models.value.find((m) => m.id === modelId.value);
      assert(
        options.imageShareConsent === true && sharingAllowed.value,
        'IMAGE_CONSENT_REQUIRED',
        '图片请求缺本次授权'
      );
      assert(
        selectedMode.value === 'cloud' &&
          model?.source === 'byok' &&
          model?.capabilities?.vision &&
          model.visionAdapter === VISION_ADAPTER &&
          !streamEnabled.value &&
          learningClientPlatform() === 'h5',
        'VISION_UNSUPPORTED',
        '图片路径或型号尚未开放'
      );
      validateVisualInput([options.image], true, {
        questionKey: activeQuestion.value ? questionKey(activeQuestion.value) : null,
        source: activeQuestion.value?.source
      });
      assert(
        options.image.dataUrl === questionImage.value,
        'IMAGE_SOURCE_MISMATCH',
        '图片与本机当前题目提取版本不一致'
      );
    }
    // 输入框里完整的「停止当前任务」是独立的停止入口，不当作作答提交；其他文字仍按作答处理。
    const stopRequest =
      !options.visual && !options.feedbackAttemptId && /^(?:停止当前任务|结束当前任务)[。！!]?$/u.test(raw.trim());
    const answering = options.answering === true && !stopRequest;
    if (busy.value) {
      const requested = userDirective(raw, state.value, selectedConversationId.value, { answering });
      if (requested?.type !== 'task.stop') {
        error.value = '当前模型任务仍在执行，可以先取消请求或停止当前任务';
        return;
      }
      cancel();
    }
    error.value = '';
    const id = options.id || learningId('turn');
    const resumingMessage =
      options.chatEntry === true &&
      state.value.events.some(
        (event) =>
          event.id === `${id}:message` &&
          event.type === 'message.add' &&
          event.data?.conversationId === selectedConversationId.value
      );
    if (
      answering &&
      activeQuestion.value &&
      !resumingMessage &&
      !options.discussionOnly &&
      !options.feedbackAttemptId &&
      !options.visual
    )
      return submit(raw, true, id);
    if (!activeQuestion.value && raw.trim().length <= 40 && !options.feedbackAttemptId && !options.visual) {
      const action = { 换法: 'change_method', 只要提示: 'hint_only', 采用计划: 'adopt_plan', 交卷: 'submit' }[
        raw.trim()
      ];
      if (action) {
        if (action === 'submit') {
          notice('当前没有待交卷的原答，未执行；请使用作答区的交卷按钮。');
          return;
        }
        return dispatchLearningAction({
          type: action,
          messageId: [...(active.value?.messages || [])]
            .reverse()
            .find((message) => message.proposal?.type === 'plan.set')?.id
        });
      }
    }
    const startedFromMessage = !active.value;
    if (startedFromMessage) start(raw);
    if (options.presentationController && replyController === options.presentationController)
      reply.value.conversationId = selectedConversationId.value;
    commit(
      'message.add',
      { conversationId: selectedConversationId.value, role: 'user', content: raw },
      `${id}:message`
    );
    const completed = state.value.events.find((event) =>
      [
        `${id}:local-teaching`,
        `${id}:reply`,
        `${id}:challenge`,
        `${id}:offline`,
        `${id}:diagnostic`,
        `${id}:independent-check`
      ].includes(event.id)
    );
    if (completed) return completed.result;
    if (
      selectedMode.value === 'offline' &&
      activeQuestion.value?.sentenceExercise &&
      !batchTrainingActive.value &&
      !options.visual &&
      !options.feedbackAttemptId &&
      !options.discussionOnly &&
      /^(?:提示|给我提示|给点线索|带我一步步理解|句子提示|give me a hint|sentence hint)[。.!！]?$/iu.test(raw.trim())
    ) {
      if (active.value.stopped) {
        notice('已停止，请先继续任务。', `${id}:offline`);
        return;
      }
      const content = recordSentenceHelp(writingContext());
      notice(content, `${id}:offline`);
      return { sentenceHint: content };
    }
    if (
      canReadChatWritingReference.value &&
      !options.visual &&
      !options.feedbackAttemptId &&
      !options.discussionOnly &&
      /^(?:提示|给我提示|给点线索|带我一步步理解|读参考信件|读信件正文|读邮件参考|give me a hint|read (?:the )?(?:full letter|email reference|sample email))[。.!！]?$/iu.test(
        raw.trim()
      )
    ) {
      if (active.value.stopped) {
        notice('已停止，请先继续任务。', `${id}:offline`);
        return;
      }
      return readChatWritingReference(id);
    }
    const unfinishedChatOpening = state.value.events.some(
      (event) => event.id === `${id}:chat-ready` && event.data?.conversationId === selectedConversationId.value
    );
    if (/^(?:先修诊断|开始先修诊断)[。！!]?$/u.test(raw.trim())) return diagnosePrerequisite(id);
    if (/^独立检验原题[。！!]?$/u.test(raw.trim())) {
      assert(!active.value.stopped, 'STOPPED', '当前任务已停止，请先明确继续');
      const result = generateVariant();
      notice('请独立完成这道变式。', `${id}:independent-check`);
      return result;
    }
    if (active.value.journey && !options.visual && !options.feedbackAttemptId) {
      const request = raw.trim().replace(/[。！!]+$/u, '');
      if (/^(?:查看)?(?:今天|今日|本周|本模块)复盘$/u.test(request)) {
        const recap = request.includes('本周')
          ? weeklyRecap.value
          : request.includes('本模块')
            ? moduleRecap.value
            : dailyRecap.value;
        notice(
          recap?.submitted
            ? `已提交 ${recap.submitted} 题；可靠正确 ${recap.correct}；部分正确 ${recap.partial}；待核对 ${recap.pending}。\n${recap.modules.map((m) => `${m.label}：${m.next}`).join('\n')}`
            : '提交训练后即可复盘。',
          `${id}:offline`
        );
        return;
      }
      if (/^(?:完成|保存)(?:今天|今日|本周|本模块)复盘$/u.test(request)) {
        confirmRecap(
          journeyContext(),
          request.includes('本周') ? 'week' : request.includes('本模块') ? 'module' : 'day'
        );
        notice('本次复盘已保存。', `${id}:offline`);
        return;
      }
      if (/^(?:开始整批训练|继续今日学习|开始下一模块)$/u.test(request)) {
        assert(!active.value.stopped, 'STOPPED', '当前任务已停止，请先明确继续');
        const module = journey.value.current;
        if (module) startTraining(journeyContext(), module.id, module.id.startsWith('writing-') ? 1 : 5);
        notice(module ? `已打开${module.label}题组。` : '今日模块已提交，可以进行复盘。', `${id}:offline`);
        return;
      }
    }
    const opening =
      options.chatEntry === true &&
      selectedMode.value === 'offline' &&
      !options.visual &&
      !options.feedbackAttemptId &&
      !options.discussionOnly
        ? localChatOpening(raw)
        : null;
    if (!options.visual && !options.feedbackAttemptId && !options.discussionOnly) {
      const candidates = extractConversationEntries(state.value, selectedConversationId.value, `${id}:message`);
      if (candidates.length) {
        for (const op of candidates) commit(op.type, op.data, op.id);
        return { proposal: true };
      }
    }
    const directive = options.visual
      ? null
      : userDirective(raw, state.value, selectedConversationId.value, {
          answering: Boolean(activeQuestion.value && !options.discussionOnly && !stopRequest)
        });
    if (directive && ['profile.set', 'plan.set'].includes(directive.type)) {
      const { source: _source, conversationId: _conversationId, ...proposalData } = directive.data;
      commit(
        'message.add',
        {
          conversationId: selectedConversationId.value,
          role: 'assistant',
          content: '请确认这份建议，确认后才会保存。',
          proposal: { type: directive.type, data: proposalData }
        },
        `${id}:proposal`
      );
      return { proposal: true };
    }
    if (
      !directive &&
      !activeQuestion.value &&
      raw.trim().length <= 40 &&
      /^(?:请)?(?:交卷|采用|换(?:法|方法|教法)|只(?:要|给)?提示|切换教法|执行计划)/u.test(raw.trim())
    ) {
      notice('未识别此操作，未执行；请使用对应按钮。');
      return;
    }
    if (directive) {
      commit(directive.type, directive.data, `${id}:directive`);
      notice(
        directive.type === 'journey.configure'
          ? '训练节奏已保存，新题组按此节奏开始。'
          : directive.type === 'task.stop'
            ? '当前任务已停止。'
            : directive.type === 'strategy.auto'
              ? '已恢复自动教法。'
              : directive.type === 'task.resume'
                ? '已继续学习。'
                : '已切换教法。',
        `${id}:updated`
      );
      if (['task.stop', 'task.resume', 'strategy.auto', 'plan.set', 'journey.configure'].includes(directive.type))
        return;
      if (active.value.stopped) return;
    } else if (active.value.stopped) {
      notice('已停止，请先继续任务。', `${id}:stopped`);
      return;
    } else if (
      activeQuestion.value &&
      !(
        options.chatEntry === true &&
        (startedFromMessage ||
          unfinishedChatOpening ||
          opening?.replaceActive ||
          activeQuestion.value.id === `${id}_chat`)
      ) &&
      !options.visual &&
      !options.feedbackAttemptId &&
      !options.discussionOnly &&
      !activeQuestion.value.writingExercise
    ) {
      const result = submit(raw, false, `${id}:answer`, { chatEntry: options.chatEntry, poetry: options.poetry });
      if (
        (options.chatEntry === true && selectedMode.value === 'offline') ||
        (!result.clarification && (result.grade?.status === 'reliable' || selectedMode.value === 'offline'))
      )
        return result;
    }
    if (selectedMode.value === 'offline') {
      if (
        options.chatEntry === true &&
        !options.visual &&
        !options.feedbackAttemptId &&
        !options.discussionOnly &&
        (!activeQuestion.value ||
          startedFromMessage ||
          unfinishedChatOpening ||
          opening?.replaceActive ||
          activeQuestion.value.id === `${id}_chat`)
      ) {
        const finishOpening = () => {
          const segment =
            requestedTeachingMethod(state.value, selectedConversationId.value) === 'hint'
              ? localTeaching(activeQuestion.value, 'hint', 1)
              : null;
          notice(chatQuestionMessage(activeQuestion.value), `${id}:${segment ? 'chat-ready' : 'offline'}`);
          if (segment) deliverTeaching(segment, `${id}:local-teaching`);
          return { chatOpening: 'question', questionKey: questionKey(activeQuestion.value) };
        };
        if ((startedFromMessage || unfinishedChatOpening) && activeQuestion.value) return finishOpening();
        let question = localChatQuestion(`${id}_chat`, opening, selectedConversationId.value);
        if (question?.scienceExercise) question = availableScienceQuestion(question.id, question.scienceExercise.input);
        if (question) {
          const key = questionKey(question);
          if (!state.value.questions.some((q) => questionKey(q) === key))
            commit('question.add', { question }, `${id}:chat-question`);
          commit(
            'question.focus',
            { conversationId: selectedConversationId.value, questionKey: key },
            `${id}:chat-focus`
          );
          const tasks = latestPlanForDay(todaySummary.value.day)?.tasks || [];
          if (!tasks.some((task) => task.questionKey === key))
            commit(
              'plan.set',
              {
                tasks: [
                  ...tasks.map((task) => ({ ...task })),
                  { title: question.prompt, questionKey: key, condition: 'submitted' }
                ],
                reason: '按聊天中明确选择的知识点开始练习'
              },
              `${id}:chat-plan`
            );
          return finishOpening();
        }
        notice(opening.message || '请把题目发来，或告诉我想练的知识点。', `${id}:offline`);
        return { chatOpening: 'clarify' };
      }
      if (directive?.type === 'strategy.set' && directive.data.method === 'challenge') {
        const challenge = createArithmeticChallenge(`${id}_challenge`, activeQuestion.value);
        if (challenge) {
          if (!state.value.questions.some((q) => questionKey(q) === questionKey(challenge))) addQuestion(challenge);
          notice('试试这道进阶题。', `${id}:challenge`);
          return;
        }
      }
      const level = Math.min(3, Math.max(0, ...(active.value?.pendingHints || []).map((hint) => hint.level || 1)) + 1);
      const explanation =
        directive?.type === 'strategy.set'
          ? localTeaching(activeQuestion.value, activeStrategy.value.method, level)
          : null;
      if (explanation) {
        deliverTeaching(explanation, `${id}:local-teaching`);
        return;
      }
      notice('请选择 AI 助手后继续。', `${id}:offline`);
      return;
    }
    assert(sharingAllowed.value, 'CONSENT_REQUIRED', '请先确认当前上下文的数据流向');
    const requestController = options.presentationController || new AbortController();
    const mode = selectedMode.value,
      requestedModelId = modelId.value;
    const lifecycle = learningRepository.lifecycleRevision();
    const conversationId = selectedConversationId.value;
    const requestedQuestionKey = activeQuestion.value ? questionKey(activeQuestion.value) : null;
    const owner = state.value.owner;
    pendingCloudCall = mode === 'cloud' ? { id, owner, session: loginContext() } : null;
    const previousRequest = state.value.events.find((e) => e.id === `${id}:request`)?.data;
    const binding = previousRequest?.binding || learningId('binding');
    // 历史请求无输出标记时仍发旧请求，避免重试时改变已缓存请求的指纹。
    const feedbackOutputContract =
      mode === 'cloud' && options.feedbackAttemptId
        ? previousRequest
          ? previousRequest.feedbackOutputContract
          : WRITING_FEEDBACK_OUTPUT_CONTRACT
        : undefined;
    const presentationContract =
      mode === 'cloud' && !options.visual && !options.feedbackAttemptId
        ? previousRequest
          ? previousRequest.presentationContract
          : modelPresentationAvailable
            ? PRESENTATION_CONTRACT
            : undefined
        : undefined;
    const request = {
      id,
      owner,
      session: loginContext(),
      conversationId,
      questionKey: requestedQuestionKey,
      modelId: requestedModelId,
      model: models.value.find((m) => m.id === requestedModelId)?.model || requestedModelId,
      binding,
      lifecycle,
      ...(options.feedbackAttemptId ? { feedbackAttemptId: options.feedbackAttemptId } : {}),
      ...(feedbackOutputContract ? { feedbackOutputContract } : {}),
      ...(presentationContract ? { presentationContract } : {}),
      lockedMethod:
        directive?.type === 'strategy.set'
          ? directive.data.method
          : requestedTeachingMethod(state.value, conversationId)
    };
    if (options.visual) request.visualSource = options.image.source;
    const assertCurrent = () => {
      ensureSessionCurrent(request.session, requestController.signal);
      refresh();
      if (request.feedbackAttemptId) feedbackAttempt(request.feedbackAttemptId);
      assert(!requestController.signal.aborted, 'CANCELLED', '请求已取消，旧模型响应未写入');
      assert(
        loginContext() === request.session &&
          state.value.owner === owner &&
          selectedConversationId.value === conversationId &&
          (activeQuestion.value ? questionKey(activeQuestion.value) : null) === requestedQuestionKey &&
          learningRepository.lifecycleRevision() === lifecycle &&
          selectedMode.value === mode &&
          modelId.value === requestedModelId &&
          sharingAllowed.value &&
          (!request.visualSource || (questionImage.value === options.image.dataUrl && !streamEnabled.value)),
        'CONTEXT_CHANGED',
        '用户、题目、模型或共享授权已切换或变化，未写入旧模型响应'
      );
    };
    const useFeedback =
      options.feedbackAttemptId && activeQuestion.value?.vocabularyReview?.phase === 'usage'
        ? vocabularyUseFeedbackBasis(activeQuestion.value, state.value)
        : null;
    const dailyContext = dailyConversationContext(state.value, conversationId, Date.now(), { dayKey, effectiveGrade });
    const payload = {
      requestId: id,
      requestBinding: binding,
      modelId: modelId.value,
      shareConsent: sharingAllowed.value,
      ...(request.presentationContract ? { presentationContract: request.presentationContract } : {}),
      ...(request.feedbackOutputContract
        ? {
            feedbackAttemptId: request.feedbackAttemptId,
            feedbackOutputContract: request.feedbackOutputContract
          }
        : {}),
      ...(options.visual ? { images: [options.image], imageShareConsent: true } : {}),
      messages: dailyContext.messages,
      learningContext: {
        owner,
        snapshot: compactLearningProgress(state.value, conversationId),
        entrySource: { conversationId, messageId: request.messageId, length: raw.length },
        goal: active.value.goal,
        ...(active.value.studyProfile ? { studyProfile: active.value.studyProfile } : {}),
        ...(active.value.entryContract === SINGLE_QUESTION_CONTRACT
          ? { generalQAOnly: true, questionEntryContract: SINGLE_QUESTION_CONTRACT }
          : active.value.messages.some((m) => m.role === 'notice' && m.content.startsWith('当前重点支持考研英语写作；'))
            ? { generalQAOnly: true }
            : {}),
        task: active.value.task || normalizeLearningTask(),
        capabilities: { ...taskContext.value, visualization: null },
        profile: [
          ...activeEntryMemories(state.value)
            .filter((e) => !e.conversationId || e.conversationId === conversationId)
            .slice(active.value.journey ? -5 : -6),
          ...(active.value.journey
            ? [
                {
                  field: 'preference',
                  source: 'self_report',
                  scope: `对话 ${conversationId}`,
                  evidenceIds: [],
                  value: `${active.value.journey.mode === 'guided' ? '单题带练' : active.value.journey.mode === 'timed' ? '限时训练、统一交卷' : '整批训练、统一交卷'}；目标：${active.value.journey.title}；每天${active.value.journey.minutes}分钟；今日路线：${journey.value.modules.map((m) => `${m.label} ${m.status}`).join('，')}。请按此节奏反馈，题组由明确开始的宿主任务提供。`
                }
              ]
            : [])
        ].map(({ field, value, source, scope, evidenceIds }) => ({
          field,
          value: value.slice(0, 400),
          source,
          scope,
          evidenceIds: evidenceIds.slice(-4)
        })),
        strategy: activeStrategy.value,
        question: activeQuestion.value
          ? {
              prompt: activeQuestion.value.prompt,
              options: activeQuestion.value.options,
              scope: activeQuestion.value.scope,
              questionKey: questionKey(activeQuestion.value),
              source: activeQuestion.value.source,
              uncertainties: (activeQuestion.value.uncertainties || []).map(
                ({ field, reason, critical, resolved }) => ({
                  field,
                  reason,
                  critical,
                  resolved
                })
              ),
              rubric: activeQuestion.value.rubric || useFeedback?.rubric || null,
              ...(useFeedback
                ? {
                    vocabularyUse: {
                      contract: useFeedback.contract,
                      senseId: useFeedback.senseId,
                      senseVersion: useFeedback.senseVersion,
                      word: useFeedback.word,
                      meaning: useFeedback.meaning,
                      originPrompt: useFeedback.originPrompt
                    }
                  }
                : {})
            }
          : null,
        attempt: state.value.attempts
          .filter((a) => a.conversationId === conversationId && a.questionKey === active.value?.activeQuestionKey)
          .at(-1)
          ? (() => {
              const a = state.value.attempts
                .filter((a) => a.conversationId === conversationId && a.questionKey === active.value?.activeQuestionKey)
                .at(-1);
              return {
                id: a.id,
                answer: a.answer,
                hints: a.hints.map((h) => ({ level: h.level, content: h.content.slice(0, 500) })),
                grade: effectiveGrade(a)
              };
            })()
          : null,
        summary: compactLearningProgress(state.value, conversationId)
      }
    };
    controller = requestController;
    try {
      busy.value = true;
      streamPreview.value = '';
      if (mode === 'cloud') {
        assert(
          !streamEnabled.value || streamSupported.value,
          'STREAM_UNSUPPORTED',
          '当前模型或终端不支持所选流式模式；请主动选择非流式'
        );
        commit(
          'model.request',
          {
            conversationId,
            messageId: `${id}:message`,
            questionKey: requestedQuestionKey,
            requestId: id,
            modelId: requestedModelId,
            model: request.model,
            binding,
            lockedMethod: request.lockedMethod,
            ...(request.feedbackAttemptId ? { feedbackAttemptId: request.feedbackAttemptId } : {}),
            ...(request.feedbackOutputContract ? { feedbackOutputContract: request.feedbackOutputContract } : {}),
            ...(request.presentationContract ? { presentationContract: request.presentationContract } : {}),
            ...(request.visualSource ? { visualSource: request.visualSource } : {})
          },
          `${id}:request`
        );
      }
      assertCurrent();
      const result =
        mode === 'local'
          ? await callLocalConnector(localConnection.value, payload, {
              signal: requestController.signal,
              session: boundSession,
              platform: learningClientPlatform(),
              assertCurrent
            })
          : await generateLearningTurn(payload, {
              signal: requestController.signal,
              session: boundSession,
              expectedOwner: owner,
              stream: streamEnabled.value,
              expectedModel: request.model,
              assertCurrent,
              onPreview: (text) => {
                assertCurrent();
                previewReply(requestController, text);
              }
            });
      assertCurrent();
      streamPreview.value = '';
      if (mode === 'local' && result.success && localConnection.value) localConnection.value.status = 'model_verified';
      if (!result.success) {
        error.value = publicError(result);
        notice(publicError(result), `${id}:error`);
        return active.value?.entryContract === SINGLE_QUESTION_CONTRACT ? result : undefined;
      }
      applyModelResult(result.data, request, requestController.signal);
      if (active.value?.entryContract === SINGLE_QUESTION_CONTRACT) {
        void loadModels().catch(() => undefined);
        return result;
      }
    } catch (e) {
      if (
        controller === requestController &&
        loginContext() === request.session &&
        state.value.owner === owner &&
        selectedConversationId.value === conversationId
      )
        error.value = e.code === 'CANCELLED' ? '请求已取消，费用状态请查看模型用量' : publicError(e);
    } finally {
      if (controller === requestController) {
        busy.value = false;
        controller = null;
        pendingCloudCall = null;
        if (requestController.signal.reason !== 'CREDENTIALS_CHANGED') streamPreview.value = '';
      }
    }
  }
  function applyModelResult(data, request, signal) {
    const assertSession = () => ensureSessionCurrent(request.session, signal);
    assertSession();
    assert(
      request.presentationContract === PRESENTATION_CONTRACT
        ? data.contentBlocks?.version === 3
        : data.contentBlocks?.version !== 3,
      'INVALID_RESPONSE',
      '展示结果与本次请求不匹配，未保存'
    );
    if (data.contentBlocks !== undefined)
      data = { ...data, contentBlocks: mapContentBlocks(data.contentBlocks, safeLearningMessage) };
    const { id, conversationId, questionKey: requestedQuestionKey } = request;
    if (
      state.value.conversations.find((conversation) => conversation.id === conversationId)?.entryContract ===
      SINGLE_QUESTION_CONTRACT
    )
      assert(!data.question && !(data.tools || []).length, 'FORBIDDEN', '单题答疑不执行测评、档案或计划');
    assert(
      typeof data.message === 'string' &&
        data.message.length <= 8000 &&
        Array.isArray(data.tools || []) &&
        (data.tools || []).length <= 3,
      'INVALID_RESPONSE',
      '模型输出不合法'
    );
    let reading = null;
    if (request.feedbackAttemptId) {
      feedbackAttempt(request.feedbackAttemptId);
      assert(
        !data.question &&
          data.tools?.length === 1 &&
          data.tools[0].name === 'assess' &&
          data.tools[0].arguments?.attemptId === request.feedbackAttemptId,
        'FORBIDDEN',
        '写作反馈只评阅当前已保存原答'
      );
      if (activeQuestion.value?.vocabularyReview?.phase === 'usage')
        assert(
          data.tools[0].arguments.rubricId === vocabularyUseFeedbackBasis(activeQuestion.value, state.value).rubric.id,
          'FORBIDDEN',
          '词句反馈需要当前词义的全部维度与原答引用'
        );
    }
    if (request.visualSource) {
      assert(!(data.tools || []).length && !data.question, 'FORBIDDEN', '图片解读不执行判分、计划或建题');
      reading = normalizeSavedVisualReading(data.visualReading, request.visualSource);
    } else assert(!data.visualReading, 'FORBIDDEN', '没有图片授权的请求不能返回图片解读');
    const context = {
      conversationId,
      permissions: ['read', 'learn'],
      calls: 0,
      maxCalls: 3,
      deadline: Date.now() + 5000,
      origin: 'model',
      assertCurrent: assertSession,
      model: data.model || request.modelId,
      sourceMessageId: request.messageId,
      lockedMethod: request.lockedMethod,
      signal
    };
    try {
      for (const [index, call] of (data.tools || []).entries()) {
        assertSession();
        assert(MODEL_TOOL_NAMES.includes(call.name), 'FORBIDDEN', '模型工具未获授权');
        const outcome = executeLearningTool(learningRepository, { ...call, id: `${id}:tool:${index}` }, context);
        refresh();
        if (call.name === 'visualize')
          visualRequest.value = {
            id: `${id}:tool:${index}`,
            recipe: outcome.result,
            conversationId,
            questionKey: requestedQuestionKey,
            owner: state.value.owner,
            learningContext: writingContext(),
            context: recordContext()
          };
      }
    } catch (e) {
      refresh();
      const saved = state.value.events.filter(
        (event) =>
          event.id.startsWith(`${id}:tool:`) &&
          ['hint.add', 'strategy.set', 'assessment.assist', 'plan.set'].includes(event.type)
      ).length;
      // 只从实际保存的事件说明部分成功，不能显示模型事先声称的整体成功。
      if (saved) {
        // The original failure code is already in the tool receipt; show only verified saved facts.
        e.code = 'PARTIAL_OPERATION';
        e.message = t('ui.partialOperations', { v0: saved });
      }
      throw e;
    }
    // 不信任工具执行前生成的成功宣称；教学文本仅表达建议，实际状态在固定进度视图显示。
    const safeMessage = safeLearningMessage(reading ? visualReadingText(reading, currentLanguage.value) : data.message);
    assertSession();
    if (requestedQuestionKey) {
      // 普通模型回复不能证明没有泄露帮助；保守标记，不让模型自报“独立掌握”。
      deliverTeaching(
        {
          method: activeStrategy.value.method,
          content: safeMessage,
          ...(data.contentBlocks ? { contentBlocks: data.contentBlocks } : {}),
          helped: true,
          level: 1,
          ...(reading ? { visualReading: reading } : {})
        },
        `${id}:reply`,
        'model_reply'
      );
    } else
      commit(
        'message.add',
        {
          conversationId,
          role: 'assistant',
          content: safeMessage,
          ...(data.contentBlocks ? { contentBlocks: data.contentBlocks } : {})
        },
        `${id}:reply`
      );
    if (
      data.question &&
      (!requestedQuestionKey || ['variant', 'challenge'].includes(request.lockedMethod || activeStrategy.value.method))
    ) {
      addQuestion({
        ...data.question,
        id: `${id}_q`,
        version: 1,
        scope: 'generated',
        validation: null,
        source: { kind: 'model_generated', model: data.model, verified: false }
      });
    }
  }
  const questionImage = computed(() => {
    const source = activeQuestion.value?.source;
    if (source?.kind !== 'private_material') return null;
    const material = state.value.materials.find((m) => m.id === source.materialId);
    const segment = material?.segments.find((s) => s.id === source.segmentId);
    if (
      material?.extractionVersion !== source.extractionVersion ||
      segment?.extractionEventId !== source.extractionEventId
    )
      return null;
    return segment?.preview || null;
  });
  async function interpretQuestionImage(consent, options = {}) {
    refresh();
    assert(
      consent === true && sharingAllowed.value,
      'IMAGE_CONSENT_REQUIRED',
      '请明确允许本次页图和当前上下文发送至所选模型'
    );
    assert(
      learningClientPlatform() === 'h5',
      'PLATFORM_UNSUPPORTED',
      '当前端尚未验收模型页图连接，可先在资料中校对文本'
    );
    assert(
      !busy.value && activeQuestion.value && !active.value.stopped,
      'PRECONDITION',
      '请先打开当前题目并结束或取消在途请求'
    );
    const model = models.value.find((m) => m.id === modelId.value);
    assert(
      selectedMode.value === 'cloud' &&
        model?.source === 'byok' &&
        model?.capabilities?.vision &&
        model.visionAdapter === VISION_ADAPTER &&
        !streamEnabled.value,
      'VISION_UNSUPPORTED',
      '请选择声明图片协议的自带API及非流式模式；本地和平台图片路径尚未开放，不会自动切换'
    );
    const q = activeQuestion.value,
      source = q.source;
    assert(questionImage.value, 'IMAGE_SOURCE_UNAVAILABLE', '本题原页图或提取版本已不可用，请先重新校对资料');
    const image = {
      dataUrl: questionImage.value,
      source: Object.fromEntries(
        ['materialId', 'segmentId', 'page', 'extractionVersion', 'extractionEventId'].map((k) => [k, source[k]])
      )
    };
    validateVisualInput([image], consent, { source, questionKey: questionKey(q) });
    return send(
      '请辅助解读当前原页图，区分题干、选项、纸面作答、教师批注和参考答案候选，列出需要局部校对的关键疑义；本次不判分。',
      { ...options, visual: true, image, imageShareConsent: true }
    );
  }
  // 请求意图是记录；它不代表模型执行成功，也不计为作答或工具成功。
  const recoverableRequest = computed(() => {
    const event = state.value.events
      .filter(
        (e) =>
          e.type === 'model.request' && e.data.conversationId === selectedConversationId.value && !e.data.historyOnly
      )
      .at(-1);
    if (
      !event ||
      state.value.events.some((e) =>
        [`${event.data.requestId}:reply`, `${event.data.requestId}:dismiss`].includes(e.id)
      )
    )
      return null;
    return event.data;
  });
  const singleQuestionRetries = new Map();
  async function retrySingleQuestion() {
    const pending = recoverableRequest.value,
      context = recordContext(),
      session = loginContext();
    assert(
      pending && active.value?.entryContract === SINGLE_QUESTION_CONTRACT,
      'PRECONDITION',
      '当前没有待恢复的单题答疑'
    );
    const key = `${context}:${pending.requestId}`;
    if (singleQuestionRetries.has(key)) return singleQuestionRetries.get(key);
    assert(sharingAllowed.value, 'CONSENT_REQUIRED', '请先授权本次问题发送');
    const original = active.value.messages.find(
      (message) => message.id === pending.messageId && message.role === 'user'
    )?.content;
    assert(original, 'NOT_FOUND', '原问题已变化，未重新发送');
    const operation = (async () => {
      const recovered = await recoverModelResult();
      if (recovered.success) return { ...recovered, restored: true };
      if (!['failed', 'cancelled'].includes(recovered.status)) return recovered;
      ensureSessionCurrent(session);
      assert(
        recordContext() === context &&
          recoverableRequest.value?.requestId === pending.requestId &&
          selectedConversationId.value === pending.conversationId &&
          modelId.value === pending.modelId &&
          selectedMode.value === 'cloud' &&
          sharingAllowed.value &&
          !intakeBusy.value,
        'CONTEXT_CHANGED',
        '账户、模型、授权或原问题已变化，未重新发送'
      );
      error.value = '';
      return (
        (await send(original, { id: learningId('turn'), chatEntry: true, discussionOnly: true })) || {
          success: false,
          error: 'INVALID_RESPONSE'
        }
      );
    })().finally(() => singleQuestionRetries.delete(key));
    singleQuestionRetries.set(key, operation);
    return operation;
  }
  async function recoverModelResult() {
    refresh();
    const pending = recoverableRequest.value;
    assert(pending && !busy.value, 'PRECONDITION', '当前没有可读取的模型请求');
    assert(
      selectedMode.value === 'cloud' && modelId.value === pending.modelId,
      'CONSENT_REQUIRED',
      '请选择原模型以读取已完成结果'
    );
    const owner = state.value.owner,
      lifecycle = learningRepository.lifecycleRevision();
    const session = loginContext();
    const requestController = beginReply('chat', pending.requestId, pending.conversationId);
    controller = requestController;
    pendingCloudCall = { id: pending.requestId, owner, session };
    busy.value = true;
    streamPreview.value = '';
    const assertRecovery = () => {
      refresh();
      const eventIndex = state.value.events.findIndex((e) => e.id === `${pending.requestId}:request`);
      assert(
        controller === requestController &&
          loginContext() === session &&
          !requestController.signal.aborted &&
          state.value.owner === owner &&
          lifecycle === learningRepository.lifecycleRevision() &&
          selectedConversationId.value === pending.conversationId &&
          selectedMode.value === 'cloud' &&
          modelId.value === pending.modelId &&
          (active.value?.activeQuestionKey || null) === pending.questionKey &&
          active.value.messages.filter((m) => m.role === 'user').at(-1)?.id === pending.messageId &&
          eventIndex >= 0 &&
          state.value.events
            .slice(eventIndex + 1)
            .every(
              (e) =>
                e.id === `${pending.requestId}:error` ||
                e.id.startsWith(`${pending.requestId}:tool:`) ||
                e.id === `${pending.requestId}:reply`
            ),
        'CONTEXT_CHANGED',
        '学习上下文已变化，旧结果只保留在服务端，不应用旧工具'
      );
    };
    try {
      assertRecovery();
      const result = await fetchLearningResult(pending.requestId, {
        session: boundSession,
        expectedOwner: owner,
        signal: requestController.signal,
        assertCurrent: assertRecovery
      });
      assertRecovery();
      if (!result.success) {
        error.value = publicError(result);
        return result;
      }
      assert(
        result.data.requestId === pending.requestId &&
          result.data.requestBinding === pending.binding &&
          result.data.modelId === pending.modelId &&
          result.data.model === pending.model,
        'CONTEXT_CHANGED',
        '已完成结果与当前请求关联不一致'
      );
      applyModelResult(result.data, { ...pending, id: pending.requestId, session }, requestController.signal);
      error.value = '';
      return result;
    } catch (e) {
      if (
        controller === requestController &&
        loginContext() === session &&
        state.value.owner === owner &&
        selectedConversationId.value === pending.conversationId
      )
        error.value = publicError(e);
      throw e;
    } finally {
      if (controller === requestController) {
        busy.value = false;
        controller = null;
        pendingCloudCall = null;
        streamPreview.value = '';
        finishReply(
          requestController,
          active.value?.messages.find((message) => message.id === `${pending.requestId}:reply`)?.content || ''
        );
      }
    }
  }
  function cancel() {
    const wasPending = Boolean(controller || replyController);
    retryOperation++;
    visualRequest.value = null;
    const pending = pendingCloudCall;
    pendingCloudCall = null;
    controller?.abort();
    const presentation = replyController;
    presentation?.abort();
    if (presentation) finishReply(presentation);
    controller = null;
    busy.value = false;
    if (wasPending) error.value = '请求已取消，费用状态请查看模型用量';
    streamPreview.value = '';
    if (checkSession(boundSession) !== 'current') return;
    if (pending && pending.owner === state.value.owner && pending.session === loginContext()) {
      commit(
        'execution.record',
        { tool: 'model.cancel_request', version: '1', status: 'cancelled', errorCode: 'CLIENT_CANCELLED' },
        `${pending.id}:dismiss`
      );
      void cancelLearningTurn(pending.id, {
        session: boundSession,
        expectedOwner: pending.owner,
        assertCurrent: () => ensureSessionCurrent(pending.session)
      })
        .then((result) => {
          if (
            !result.success &&
            reply.value?.requestId === pending.id &&
            !reply.value.pending &&
            state.value.owner === pending.owner &&
            pending.session === loginContext()
          )
            error.value = '客户端已取消，服务端取消未确认；实际用量需查看模型用量状态';
        })
        .catch(() => {
          if (
            reply.value?.requestId === pending.id &&
            !reply.value.pending &&
            state.value.owner === pending.owner &&
            pending.session === loginContext()
          )
            error.value = '服务端取消未确认，实际用量需查看模型用量状态';
        });
    }
  }
  function cancelModelReads(kind, code = 'CANCELLED') {
    for (const [key, operation] of modelReads) {
      if (kind && key !== kind) continue;
      modelReads.delete(key);
      operation.cancelReason = Object.assign(
        new Error(code === 'CONTEXT_CHANGED' ? '用户已切换或本机记录已更换，未读取旧模型结果' : '模型读取已取消'),
        { code }
      );
      operation.cancel(operation.cancelReason);
      operation.controller.abort();
      const status = key === 'models' ? modelListState : key === 'discover' ? modelDiscoveryState : modelUsageState;
      status.value = { phase: 'idle', message: code === 'CANCELLED' ? '已取消读取，可以重新查看。' : '' };
    }
    if (!kind || kind === 'discover') modelDiscovery.value = null;
  }
  // 只读模型资源；取消这里的请求不取消或重放任何模型推理。
  function readModelResource(kind, input) {
    if (kind === 'discover' && !learningModelDiscoveryEnabled()) return fetchLearningModelDiscovery(input);
    if (kind === 'discover') input = { ...input };
    try {
      refresh();
    } catch (failure) {
      if (failure.code !== 'SESSION_UNAVAILABLE') resetModelResources();
      throw failure;
    }
    const context = recordContext();
    const session = ensureSessionCurrent();
    assert(context, 'CONTEXT_CHANGED', '本机记录上下文不可用，请重新核对');
    const binding =
      kind === 'discover' ? JSON.stringify([input?.profileId, input?.modelId, input?.refresh]) : undefined;
    const existing = modelReads.get(kind);
    if (existing?.context === context && existing.binding === binding) return existing.promise;
    if (kind === 'discover' && existing) cancelModelReads(kind, 'CONTEXT_CHANGED');
    const status = kind === 'models' ? modelListState : kind === 'discover' ? modelDiscoveryState : modelUsageState;
    const operation = { context, binding, controller: new AbortController() };
    const cancelled = new Promise((_resolve, reject) => (operation.cancel = reject));
    modelReads.set(kind, operation);
    modelResourceContext = context;
    status.value = {
      phase: 'loading',
      message:
        kind === 'models' ? '正在读取云模型列表…' : kind === 'discover' ? '正在读取模型能力…' : '正在读取模型用量…'
    };
    const validObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
    const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
    const numbers = (value, keys) =>
      validObject(value) && keys.every((key) => Number.isFinite(value[key]) && value[key] >= 0);
    const validCatalog = (data) =>
      validObject(data) &&
      Array.isArray(data.models) &&
      data.models.every(
        (model) =>
          validObject(model) &&
          ['id', 'provider'].every((key) => nonempty(model[key])) &&
          (nonempty(model.model) || (model.requiresModelSelection === true && model.model === '')) &&
          validObject(model.capabilities)
      ) &&
      new Set(data.models.map((model) => model.id)).size === data.models.length &&
      (data.presets === undefined ||
        (Array.isArray(data.presets) &&
          data.presets.every(
            (preset) =>
              validObject(preset) && ['id', 'provider', 'model', 'endpoint'].every((key) => nonempty(preset[key]))
          )));
    const validUsage = (data) =>
      data === null ||
      (validObject(data) &&
        numbers(data.entitlement, ['weeklyUnits', 'spent', 'reserved']) &&
        ['week', 'timezone', 'policyVersion'].every((key) => nonempty(data.entitlement[key])) &&
        numbers(data.cost, ['spent', 'reserved', 'pending']) &&
        (!data.byokBudget || numbers(data.byokBudget, ['used', 'limit', 'pendingCosts'])) &&
        (!data.resultCache ||
          (numbers(data.resultCache, ['entries', 'bytes']) &&
            numbers(data.resultCache.policy, ['maxEntries', 'maxBytes', 'ttlMs']))));
    const validDiscovery = (data) =>
      validObject(data) &&
      typeof data.complete === 'boolean' &&
      ['fresh', 'stale'].includes(data.cacheState) &&
      Array.isArray(data.sources) &&
      typeof data.fetchedAt === 'string' &&
      (input?.modelId === undefined
        ? data.mode === 'list' && Array.isArray(data.models)
        : data.mode === 'detail' && data.modelId === input.modelId && validObject(data.fields));
    const apply = (result) => {
      ensureSessionCurrent(session, operation.controller.signal);
      let selectionError = null;
      if (kind === 'discover') {
        modelDiscovery.value = result.success
          ? { profileId: input.profileId, modelId: input.modelId || null, data: result.data }
          : null;
        status.value = {
          phase: result.success ? 'ready' : 'error',
          code: result.success ? undefined : result.code,
          message: result.success ? '' : '模型能力读取未完成。'
        };
        return result;
      }
      if (kind === 'models') {
        modelPresentationAvailable =
          result.success &&
          Array.isArray(result.data.presentationContracts) &&
          result.data.presentationContracts.includes(PRESENTATION_CONTRACT);
        singleQuestionAvailable.value = Boolean(
          modelPresentationAvailable &&
          Array.isArray(result.data.questionEntryContracts) &&
          result.data.questionEntryContracts.includes(SINGLE_QUESTION_CONTRACT)
        );
        modelIntakeAvailable = result.success && result.data.intakeContract === 'model-intake-v1';
        modelIntakeContract.value =
          result.success && result.data.intakeContracts?.includes(MODEL_INTAKE_V2_CONTRACT)
            ? MODEL_INTAKE_V2_CONTRACT
            : modelIntakeAvailable
              ? 'model-intake-v1'
              : null;
        modelIntakeAvailable = Boolean(modelIntakeContract.value);
        modelIntakeScopeContract = result.success
          ? [...EXAM_SCOPE_CONTRACTS]
              .reverse()
              .find((contract) => result.data.intakeScopeContracts?.includes(contract)) || null
          : null;
        modelCoachMethods =
          result.success && Array.isArray(result.data.coachMethods)
            ? result.data.coachMethods.filter((method) => subjectCoachMethodByContract(method))
            : [];
        models.value = result.success ? result.data.models : [];
        modelPresets.value = result.success ? result.data.presets || [] : [];
        if (result.success && !preferencesDirty && result.data.preferences) {
          hydratingPreferences = true;
          try {
            const preferences = result.data.preferences;
            const selected = models.value.find(
              (model) =>
                model.id === preferences.selectedModelId &&
                model.source === 'byok' &&
                model.configured &&
                !model.requiresModelSelection
            );
            modelId.value = selected?.id || '';
            if (preferences.selectedModelId && !selected) selectionError = 'MODEL_NOT_FOUND';
            selectedMode.value = selected ? 'cloud' : 'offline';
            sharingAllowed.value = preferences.sharingAllowed === true;
            storageService.save(preferenceKey, preferences, true, boundSession);
          } finally {
            hydratingPreferences = false;
          }
        }
        if (result.success && modelId.value && !models.value.some((model) => model.id === modelId.value)) {
          hydratingPreferences = true;
          selectionError = 'MODEL_NOT_FOUND';
          modelId.value = '';
          selectedMode.value = 'offline';
          hydratingPreferences = false;
        }
      } else usage.value = result.success ? result.data : null;
      status.value = {
        selectionError,
        code: result.success ? undefined : result.code,
        phase: !result.success
          ? 'error'
          : kind === 'models'
            ? models.value.length
              ? 'ready'
              : 'empty'
            : usage.value
              ? 'ready'
              : 'empty',
        message: !result.success
          ? typeof result.message === 'string' && result.message.trim()
            ? publicError(result)
            : '读取未完成，请重试。'
          : kind === 'models'
            ? models.value.length
              ? `已读取 ${models.value.length} 个云模型，检查可用性需单独确认。`
              : '当前没有可选云模型。可以继续本地学习，或配置自带云端 API。'
            : usage.value
              ? '模型用量已读取。'
              : '当前没有可显示的模型用量。'
      };
      return result;
    };
    operation.promise = (async () => {
      try {
        const request =
          kind === 'models'
            ? fetchLearningModels
            : kind === 'discover'
              ? (options) => fetchLearningModelDiscovery(input, options)
              : fetchLearningUsage;
        let result = await Promise.race([
          request({
            signal: operation.controller.signal,
            session: boundSession,
            expectedOwner: getUserId() || undefined,
            assertCurrent: () => ensureSessionCurrent(session, operation.controller.signal)
          }),
          cancelled
        ]);
        if (
          operation.unavailable ||
          result.errorCode === 'SESSION_UNAVAILABLE' ||
          result.code === 'SESSION_UNAVAILABLE'
        )
          throw Object.assign(new Error('登录状态暂不可读，请重试'), { code: 'SESSION_UNAVAILABLE' });
        ensureSessionCurrent(session, operation.controller.signal);
        refresh();
        assert(recordContext() === context, 'CONTEXT_CHANGED', '用户已切换或本机记录已更换，未读取旧模型结果');
        if (modelReads.get(kind) !== operation) throw operation.cancelReason;
        if (
          result.success &&
          !(kind === 'models'
            ? validCatalog(result.data)
            : kind === 'discover'
              ? validDiscovery(result.data)
              : validUsage(result.data))
        )
          result = {
            success: false,
            code: 502,
            message:
              kind === 'models'
                ? '云模型列表响应不完整，请重试；不会自动选择模型。'
                : kind === 'discover'
                  ? '模型能力响应不完整，请重试。'
                  : '模型用量响应不完整，请重试。'
          };
        return apply(result);
      } catch (failure) {
        if (modelReads.get(kind) !== operation) throw operation.cancelReason || failure;
        if (failure.code === 'SESSION_UNAVAILABLE' || failure.errorCode === 'SESSION_UNAVAILABLE') {
          status.value = { phase: 'error', code: 'SESSION_UNAVAILABLE', message: '登录状态暂不可读，请重试' };
          return { success: false, code: 'SESSION_UNAVAILABLE' };
        }
        if (recordContext() !== context || failure.code === 'CONTEXT_CHANGED') {
          cancelModelReads(kind, 'CONTEXT_CHANGED');
          throw operation.cancelReason;
        }
        return apply({ success: false, code: 503, message: '读取服务暂不可用，请重试；本机学习记录保留。' });
      } finally {
        if (modelReads.get(kind) === operation) modelReads.delete(kind);
      }
    })();
    return operation.promise;
  }
  async function loadModels() {
    return readModelResource('models');
  }
  function loadModelDiscovery(input) {
    return readModelResource('discover', input);
  }
  // Ideas page: one suggestion request on the learner's own API. The reply is only
  // shown on that page; it never becomes a learning fact or starts a task.
  const ideasModelReady = computed(() => {
    const model = models.value.find((item) => item.id === modelId.value);
    return (
      state.value.owner !== 'guest' &&
      model?.source === 'byok' &&
      model.configured &&
      !model.requiresModelSelection &&
      sharingAllowed.value
    );
  });
  async function suggestIdeas(context) {
    const owner = state.value.owner,
      selected = modelId.value;
    assert(ideasModelReady.value, 'NEEDS_CONNECTION', '请先连接自己的 API 并允许发送学习内容');
    const requestId = learningId('ideas'),
      requestBinding = learningId('ideas');
    const result = await modelAction((options) =>
      generateLearningTurn(
        {
          modelId: selected,
          requestId,
          requestBinding,
          shareConsent: true,
          messages: [{ role: 'user', content: '请给出今天的学习灵感。' }],
          learningContext: { owner, ideas: context }
        },
        options
      )
    );
    assert(modelId.value === selected && sharingAllowed.value, 'CONTEXT_CHANGED', '模型或共享授权已变化，未采用旧建议');
    if (!result.success) return result;
    assert(
      result.data?.requestId === requestId &&
        result.data.requestBinding === requestBinding &&
        result.data.modelId === selected &&
        Array.isArray(result.data.ideas),
      'CONTEXT_CHANGED',
      '结果与本次请求不符'
    );
    return { success: true, requestId, model: result.data.model, ideas: result.data.ideas };
  }
  async function modelAction(action) {
    refresh();
    const context = recordContext();
    const session = ensureSessionCurrent();
    assert(context, 'CONTEXT_CHANGED', '登录会话不可用，请重新核对');
    const controller = new AbortController();
    modelActions.add(controller);
    try {
      const result = await action({
        session: boundSession,
        expectedOwner: state.value.owner,
        signal: controller.signal,
        assertCurrent: () => ensureSessionCurrent(session, controller.signal)
      });
      ensureSessionCurrent(session, controller.signal);
      assert(
        !controller.signal.aborted && recordContext() === context,
        'CONTEXT_CHANGED',
        '登录会话已变化，未采用旧操作结果'
      );
      return result;
    } finally {
      modelActions.delete(controller);
    }
  }
  async function testModel(id) {
    const origin = ensureSessionCurrent();
    const requestId = learningId('connection');
    const result = await modelAction((options) => testLearningModel(id, requestId, options));
    ensureSessionCurrent(origin);
    await loadModels();
    return { ...result, requestId };
  }
  async function recoverConnectionTest(id, requestId) {
    const result = await modelAction((options) => fetchLearningResult(requestId, options));
    if (result.success) assert(result.data.modelId === id, 'CONTEXT_CHANGED', '查询结果与连接不符');
    await loadModels();
    return { ...result, requestId };
  }
  async function runModelIntake(id, answer, recover = false, reset = false) {
    if (intakeBusy.value || busy.value) return { success: false, message: '请等待当前请求完成' };
    const origin = ensureSessionCurrent(),
      expected = recordContext();
    intakeBusy.value = true;
    const control =
      reply.value?.kind === 'intake' && reply.value.pending
        ? replyController
        : beginReply('intake', learningId('intake'));
    intakeController = control;
    let requestId;
    try {
      refresh();
      if (recover) {
        assert(state.value.intake?.modelId === id, 'CONTEXT_CHANGED', '模型连接已变化');
        if (state.value.intake.status === 'ready')
          return { success: true, data: state.value.intake.reply, reused: true };
        if (state.value.intake.finalFailure) return { success: false, status: 'failed', reused: true };
        requestId = state.value.intake.requestId;
      } else {
        const contract =
          reset || !state.value.intake || state.value.intake.acceptedConversationId
            ? modelIntakeContract.value
            : state.value.intake.contract;
        const scopeContract =
          reset || !state.value.intake || state.value.intake.acceptedConversationId
            ? modelIntakeScopeContract
            : state.value.intake.scopeContract;
        assert(
          sharingAllowed.value || (answer === undefined && (reset || !state.value.intake?.turns.length)),
          'CONSENT_REQUIRED',
          '请先允许发送本次建档回答'
        );
        requestId = learningId('intake');
        commit('intake.request', {
          modelId: id,
          requestId,
          explicit: true,
          ...(contract === MODEL_INTAKE_V2_CONTRACT ? { contract } : {}),
          ...(contract === MODEL_INTAKE_V2_CONTRACT && scopeContract ? { scopeContract } : {}),
          ...(contract === MODEL_INTAKE_V2_CONTRACT ? { binding: learningId('intake-binding') } : {}),
          ...(reset ? { reset: true } : {}),
          ...(answer !== undefined ? { answer } : {})
        });
      }
      reply.value.requestId = requestId;
      reply.value.id = `${requestId}:reply`;
      intakeError.value = '';
      const turns = state.value.intake.turns;
      const binding = state.value.intake.binding;
      const intakeOwner = state.value.owner;
      const intakeContext = {
        turns,
        ...(state.value.intake.scopeContract ? { scopeContract: state.value.intake.scopeContract } : {}),
        ...(state.value.intake.contract ? { contract: state.value.intake.contract } : {})
      };
      const result = await modelAction((options) => {
        ensureSessionCurrent(origin, control.signal);
        assert(
          recordContext() === expected && state.value.intake?.requestId === requestId,
          'CONTEXT_CHANGED',
          '建档上下文已变化，未发送旧回答'
        );
        assert(recover || sharingAllowed.value || !turns.length, 'CONSENT_REQUIRED', '请先允许发送本次建档回答');
        return recover
          ? fetchLearningResult(requestId, {
              ...options,
              signal: globalThis.AbortSignal.any([options.signal, control.signal])
            })
          : binding
            ? generateLearningTurn(
                {
                  modelId: id,
                  requestId,
                  requestBinding: binding,
                  shareConsent: true,
                  messages: turns.length
                    ? turns.flatMap((turn) => [
                        { role: 'assistant', content: turn.question },
                        { role: 'user', content: turn.answer }
                      ])
                    : [{ role: 'user', content: '请发出学习建档的第一问。' }],
                  learningContext: { owner: intakeOwner, intake: intakeContext }
                },
                {
                  ...options,
                  signal: globalThis.AbortSignal.any([options.signal, control.signal])
                }
              )
            : testLearningModel(id, requestId, {
                ...options,
                signal: globalThis.AbortSignal.any([options.signal, control.signal]),
                intake: intakeContext
              });
      });
      ensureSessionCurrent(origin);
      assert(!control.signal.aborted && intakeController === control, 'CANCELLED', '请求已取消');
      assert(recordContext() === expected, 'CONTEXT_CHANGED', '学习记录已变化');
      if (result.success) {
        if (!result.data || typeof result.data !== 'object')
          throw Object.assign(new Error('建档回复不完整'), { code: 'INTAKE_INVALID' });
        assert(
          binding
            ? result.data.requestId === requestId &&
                result.data.modelId === id &&
                result.data.requestBinding === binding
            : (!result.data.requestId || result.data.requestId === requestId) &&
                (!result.data.modelId || result.data.modelId === id),
          'CONTEXT_CHANGED',
          '建档回复不属于当前请求'
        );
        const reply = normalizeIntakeReply(
          {
            message: result.data.message,
            intake: result.data.intake,
            question: result.data.question,
            tools: result.data.tools
          },
          !turns.length,
          intakeContext
        );
        commit('intake.result', { requestId, modelId: id, reply, ...(binding ? { binding } : {}) });
        finishReply(control, reply.message);
        modelId.value = id;
        selectedMode.value = 'cloud';
      } else {
        commit('intake.failed', {
          requestId,
          final:
            result.error === 'INTAKE_INVALID' ||
            ['failed', 'cancelled'].includes(result.status) ||
            [404, 410].includes(result.code)
        });
        intakeError.value = intakeFailureMessage(result, state.value.intake.finalFailure);
      }
      return result;
    } catch (failure) {
      if (
        !control.signal.aborted &&
        intakeController === control &&
        recordContext() === expected &&
        requestId &&
        state.value.intake?.requestId === requestId
      ) {
        const invalid = failure.code === 'INTAKE_INVALID';
        commit('intake.failed', { requestId, final: invalid });
        intakeError.value = intakeFailureMessage(failure, invalid);
        if (invalid) return { success: false, error: 'INTAKE_INVALID', requestId, status: 'failed' };
      }
      throw failure;
    } finally {
      if (intakeController === control) {
        intakeController = null;
        intakeBusy.value = false;
      }
      finishReply(control);
    }
  }
  function intakeFailureMessage(failure, final) {
    if ([failure?.code, failure?.error].includes('INTAKE_INVALID'))
      return '模型回复格式不完整，未采用该回复。可重新建档；原回答已保留，请用请求编号反馈问题。';
    if ([404, 410].includes(failure?.code)) return '原请求没有可恢复的回复，查询已结束。可重新建档；原回答已保留。';
    if (final) return '原请求已失败或取消，查询已结束。可查看模型用量后重新建档；原回答已保留。';
    if (failure?.status === 'reserved') return '模型仍在处理，可稍后查询原请求；查询不会再次调用模型。';
    return `${publicError(failure)} 可查询原请求，查询不会再次调用模型。`;
  }
  function cancelModelIntake() {
    retryOperation++;
    const control = intakeController || (reply.value?.kind === 'intake' ? replyController : null);
    control?.abort();
    if (control) finishReply(control);
    intakeController = null;
    intakeBusy.value = false;
  }
  function restartModelIntake() {
    const intake = state.value.intake;
    const finished = intake?.status === 'ready' && intakeFinished(intake);
    assert(intake?.finalFailure === true || finished, 'PRECONDITION', '请先查询原请求状态');
    return runModelIntake(intake.modelId, undefined, false, finished);
  }
  async function beginModelIntake(id, { newGoal = false } = {}) {
    if (reply.value?.pending) return { success: false, message: '请等待当前请求完成' };
    const control = beginReply('intake', learningId('intake'));
    try {
      return await beginModelIntakeTurn(id, control, newGoal);
    } finally {
      finishReply(control);
    }
  }
  async function beginModelIntakeTurn(id, control, newGoal) {
    if (!['ready', 'remote'].includes(accountRecordState.value)) await readAccountRecords();
    assert(!control.signal.aborted, 'CANCELLED', '请求已取消');
    if (accountRecordState.value !== 'ready')
      return { success: false, message: '账号已有学习记录，请先在数据面板确认采用云端记录' };
    if (DEV_TEST && modelIntakeContract.value !== MODEL_INTAKE_V2_CONTRACT) return loadModels();
    idleRecords();
    const intake = state.value.intake;
    if (
      !newGoal &&
      (state.value.conversations.some((conversation) => conversation.coach?.profile || conversation.studyProfile) ||
        state.value.profile.length ||
        state.value.attempts.length ||
        state.value.events.some((event) => ['coach.answer', 'training.complete'].includes(event.type)) ||
        (intake?.status === 'ready' && intakeFinished(intake)))
    )
      return testModel(id);
    const catalog = await loadModels();
    assert(!control.signal.aborted, 'CANCELLED', '请求已取消');
    if (!catalog.success) return catalog;
    if (!modelIntakeAvailable) return { success: false, code: 426, error: 'INTAKE_UNAVAILABLE' };
    if (
      intake &&
      !intake.acceptedConversationId &&
      ['pending', 'failed'].includes(intake.status) &&
      !intake.finalFailure &&
      intake.modelId !== id
    )
      return {
        success: false,
        error: 'CONTEXT_CHANGED',
        message: '请先查询原建档请求，再使用其他模型',
        requestId: intake.requestId
      };
    if (state.value.intake?.modelId === id && !state.value.intake.acceptedConversationId) {
      if (state.value.intake.status === 'ready') return Promise.resolve({ success: true });
      if (state.value.intake.finalFailure === true) return restartModelIntake();
      return recoverModelIntake();
    }
    return runModelIntake(id);
  }
  function answerModelIntake(answer) {
    return runModelIntake(state.value.intake?.modelId, answer);
  }
  function recoverModelIntake() {
    return runModelIntake(state.value.intake?.modelId, undefined, true);
  }
  function acceptModelIntake() {
    idleRecords();
    const selected = state.value.intake?.modelId;
    const subjectMethod = subjectCoachMethodForIntake(state.value.intake, modelCoachMethods);
    const conversation = commit('intake.accept', {
      explicit: true,
      ...(subjectMethod ? { coachMethod: subjectMethod.contract } : {})
    });
    selectedConversationId.value = conversation.id;
    modelId.value = selected;
    selectedMode.value = 'cloud';
    return conversation;
  }
  async function loadUsage() {
    return readModelResource('usage');
  }
  async function saveModel(profile, consent) {
    const origin = ensureSessionCurrent();
    const result = await modelAction((options) => saveLearningModel(profile, consent, options));
    ensureSessionCurrent(origin);
    if (result.success || result.error) {
      cancelModelReads('discover', 'CONTEXT_CHANGED');
      modelDiscoveryState.value = { phase: 'idle', message: '' };
      await loadModels();
    }
    return result;
  }
  async function removeModel(id) {
    const origin = ensureSessionCurrent();
    const result = await modelAction((options) => deleteLearningModel(id, options));
    ensureSessionCurrent(origin);
    if (result.success) {
      cancelModelReads('discover', 'CONTEXT_CHANGED');
      modelDiscoveryState.value = { phase: 'idle', message: '' };
      await loadModels();
    }
    return result;
  }
  function importText(input) {
    const material = parsePastedMaterial(input, learningId('material'));
    return commit('material.add', { material });
  }
  function requireAttach() {
    assert(active.value?.coach && !busy.value, 'BUSY', '请回到当前带练，等待请求结束');
    assert(!active.value.stopped, 'STOPPED', '当前学习已停止');
  }
  // 前置断言全部通过才写入；两笔 commit 同步执行、之间无 await，事件不会插入，因此不存在
  // 「资料已保存但未绑定」的半写入。忙碌时一个字都不写。
  function attachMaterial(material) {
    requireAttach();
    const saved = commit('material.add', { material });
    // 同指纹重传时 material.add 只登记别名、不新增资料，必须用它的返回值解析规范 id。
    const materialId = saved.id || material.id;
    // 不带 day：绑定本身与日期无关，带上反而会在跨本地午夜的瞬间让第二笔被拒，
    // 在第一笔已经落盘之后制造一个可避免的失败窗口。
    const bound = commit('coach.material', {
      materialId,
      conversationId: active.value.id,
      explicit: true
    });
    return { ...bound, id: materialId };
  }
  function attachText(input) {
    requireAttach();
    return attachMaterial(parsePastedMaterial(input, learningId('material')));
  }
  async function importFile(input) {
    assert(!materialBusy.value && !materialConnectionBusy.value, 'BUSY', '资料正在处理或检查连接');
    refresh();
    if (input.materialId) {
      assert(
        state.value.materials.some((m) => m.id === input.materialId),
        'DELETED_DATA',
        '该资料已删除，请重新选择文件导入'
      );
      const material = state.value.materials.find((m) => m.id === input.materialId);
      if (material.original?.connectorOrigin)
        assert(
          materialConnection.value &&
            new URL(materialConnection.value.endpoint).origin === material.original.connectorOrigin,
          'TARGET_MISMATCH',
          '当前连接器不是保存原件的目标，未发送续页或重试请求'
        );
    }
    const context = prepareMaterialAction();
    assert(
      input.actionContext === undefined || input.actionContext === context,
      'CONTEXT_CHANGED',
      '记录或资料授权已变化，请重新选择；正文未发送'
    );
    const connection = materialConnection.value ? JSON.parse(JSON.stringify(materialConnection.value)) : null;
    materialBusy.value = true;
    materialImportContext = context;
    materialProgress.value = null;
    materialImportState.value = { phase: 'processing' };
    const requestController = new AbortController();
    materialController = requestController;
    materialRequestContext = context;
    const signal = requestController.signal;
    const checkContext = () => {
      assert(!signal.aborted, 'CANCELLED', '资料处理已取消');
      assert(materialContext() === context, 'CONTEXT_CHANGED', '账户、记录或资料授权已变更，旧资料结果未写入');
    };
    try {
      const result = await parseConnectedMaterial(connection, input, {
        session: boundSession,
        platform: learningClientPlatform(),
        signal: materialController.signal,
        uploadId: learningId(
          connection?.capabilities?.uploadMaintenance?.available
            ? 'upload_' + connection.capabilities.uploadMaintenance.generation
            : 'upload'
        ),
        assertCurrent: checkContext,
        onUploadIntent: (entry) => {
          checkContext();
          pendingUploads.value = pendingUploadJournal.add(entry, state.value.owner, boundSession);
        },
        onUploadSaved: (id) => {
          checkContext();
          pendingUploads.value = pendingUploadJournal.remove(id, state.value.owner, boundSession);
        },
        onProgress: (progress) => {
          checkContext();
          materialProgress.value = progress;
        },
        onBatch: (material) => {
          checkContext();
          material = JSON.parse(JSON.stringify(material));
          assert(
            !(state.value.materialDeletions || []).some(
              (d) =>
                d.originalStatus === 'pending' &&
                d.original?.fileId === material.original?.connectorFileId &&
                d.original?.connectorOrigin === material.original?.connectorOrigin
            ),
            'DELETE_PENDING',
            '请先完成这份原件的删除，再确认重新导入；其他资料可继续使用'
          );
          // 重新上传是新的明确动作；迟到的旧提取仍被原墓碑拦截。
          const existing = state.value.materials.find(
            (m) =>
              m.fingerprint === material.fingerprint &&
              m.original?.connectorOrigin === material.original?.connectorOrigin &&
              m.original?.storageId === material.original?.storageId
          );
          if (existing) material.id = existing.id;
          else if (
            (state.value.materialDeletions || []).some((d) =>
              (d.materialIds || [d.materialId]).includes(material.id)
            ) ||
            state.value.materials.some((m) => m.id === material.id)
          )
            material.id = learningId('material');
          const prior = state.value.events.find(
            (event) =>
              event.type === 'material.add' &&
              event.data.material.id === material.id &&
              operationFingerprint(event.data.material) === operationFingerprint(material)
          );
          return commit('material.add', { material }, prior?.id || learningId('extraction'));
        }
      });
      checkContext();
      const outcomeMaterials = new Map();
      result.results.forEach((material) => {
        const saved = state.value.materials.find(
          (item) =>
            item.fingerprint === material.fingerprint &&
            item.original?.connectorOrigin === material.original?.connectorOrigin &&
            item.original?.storageId === material.original?.storageId
        );
        const current = saved || material;
        outcomeMaterials.set(current.id, current);
      });
      const segments = [...outcomeMaterials.values()].flatMap((material) => material.segments);
      const failedPages = segments.filter((segment) => segment.status === 'failed').length;
      const extractedSegments = segments.filter(
        (segment) => segment.status !== 'failed' && segment.content?.trim()
      ).length;
      materialImportState.value = {
        phase: result.nextPage || failedPages ? 'partial' : 'saved',
        failedPages,
        extractedSegments
      };
      return result;
    } catch (failure) {
      if (materialContext() === context) materialImportState.value = { phase: signal.aborted ? 'cancelled' : 'failed' };
      throw failure;
    } finally {
      if (materialController === requestController) {
        materialBusy.value = false;
        materialController = null;
        materialRequestContext = null;
      }
    }
  }

  function uploadLinked(receipt, entry) {
    return (
      receipt.fileId &&
      state.value.materials.find(
        (material) =>
          material.original?.connectorFileId === receipt.fileId &&
          material.original?.connectorOrigin === entry.connectorOrigin
      )
    );
  }
  async function uploadAction(id, consent, close = false) {
    assert(consent === true, 'CONSENT_REQUIRED', '请明确确认核对或取消本次导入');
    assert(!materialBusy.value && !busy.value && !syncBusy.value, 'BUSY', '请等待当前动作结束');
    refresh();
    const entry = pendingUploads.value.find((item) => item.id === id);
    assert(entry, 'NOT_FOUND', '导入待办不存在');
    const context = prepareMaterialAction(),
      owner = state.value.owner;
    const connection = materialConnection.value ? JSON.parse(JSON.stringify(materialConnection.value)) : null;
    materialBusy.value = true;
    const requestController = new AbortController();
    materialController = requestController;
    materialRequestContext = context;
    const signal = requestController.signal;
    const check = () =>
      assert(
        !signal.aborted && materialContext() === context,
        'CONTEXT_CHANGED',
        '账户、记录或资料授权已变化，导入待办保留'
      );
    try {
      let receipt = await requestUploadRecovery(connection, 'upload-receipt', entry, {
        session: boundSession,
        platform: learningClientPlatform(),
        signal,
        assertCurrent: check
      });
      check();
      const linked = uploadLinked(receipt, entry);
      if (close) {
        assert(!linked, 'HAS_SAVED_MATERIAL', '这份原件已关联保存资料，请使用资料删除范围预览；待办保留');
        receipt = await requestUploadRecovery(connection, 'close-upload', entry, {
          session: boundSession,
          platform: learningClientPlatform(),
          signal,
          assertCurrent: check
        });
        check();
      }
      if (linked || receipt.state === 'closed')
        pendingUploads.value = pendingUploadJournal.remove(id, owner, boundSession);
      return { ...receipt, ...(linked ? { state: 'linked', materialId: linked.id } : {}), entry, context };
    } finally {
      if (materialController === requestController) {
        materialBusy.value = false;
        materialController = null;
        materialRequestContext = null;
      }
    }
  }
  const inspectUpload = (id, consent) => uploadAction(id, consent);
  const closeUpload = (id, consent) => uploadAction(id, consent, true);
  async function recoverUpload(id, consent) {
    const receipt = await inspectUpload(id, consent);
    if (receipt.state === 'linked') return receipt;
    assert(
      receipt.state === 'stored' && receipt.fileId,
      'ORIGINAL_UNAVAILABLE',
      '原件尚未收到或已不可用；可核对并取消登记，未重新上传'
    );
    assert(materialContext() === receipt.context, 'CONTEXT_CHANGED', '资料授权已变化，请重新确认恢复');
    const result = await importFile({
      name: '恢复的私人原件',
      size: receipt.entry.size,
      fileId: receipt.fileId,
      storageId: receipt.entry.storageId,
      startPage: 1,
      allowRecognition: receipt.entry.recognitionAllowed,
      recognitionEngine: receipt.entry.recognitionEngine,
      actionContext: receipt.context
    });
    assert(materialContext() === receipt.context, 'CONTEXT_CHANGED', '资料授权已变化，导入待办保留');
    pendingUploads.value = pendingUploadJournal.remove(id, state.value.owner, boundSession);
    return result;
  }

  function previewPendingRemoval(id) {
    idleRecords();
    refresh();
    const entry = pendingUploads.value.find((item) => item.id === id);
    assert(entry, 'NOT_FOUND', '导入待办不存在');
    assert(recordContext(), 'CONTEXT_CHANGED', '本机记录上下文不可用，请重新核对');
    return {
      owner: state.value.owner,
      context: recordContext(),
      entry: JSON.parse(JSON.stringify(entry)),
      fingerprint: operationFingerprint(entry)
    };
  }
  function forgetPendingUpload(preview, consent) {
    assert(consent === true, 'CONSENT_REQUIRED', '请明确确认仅移除本机待办，远端原件未核验');
    idleRecords();
    refresh();
    const entry = pendingUploads.value.find((item) => item.id === preview?.entry?.id);
    assert(
      preview?.owner === state.value.owner &&
        preview.context &&
        preview.context === recordContext() &&
        entry &&
        operationFingerprint(entry) === preview.fingerprint,
      'CONTEXT_CHANGED',
      '账户、记录或定位待办已变化，请重新预览'
    );
    pendingUploads.value = pendingUploadJournal.remove(entry.id, state.value.owner, boundSession);
    return { localRemoved: true, originalStatus: 'unverified' };
  }
  function restorePendingLocator(content, consent) {
    assert(consent === true, 'CONSENT_REQUIRED', '请明确确认恢复无正文定位待办');
    idleRecords();
    refresh();
    assert(recordContext(), 'CONTEXT_CHANGED', '本机记录上下文不可用，请重新核对');
    assert(typeof content === 'string' && content.length <= 2500, 'RESOURCE_LIMIT', '定位登记超过资源上限');
    let locator;
    try {
      locator = JSON.parse(content);
    } catch {
      assert(false, 'INVALID_LOCATOR', '定位登记JSON不合法');
    }
    assert(
      locator &&
        Object.keys(locator).length === 3 &&
        locator.format === 'wenli-upload-locator-v1' &&
        locator.owner === state.value.owner &&
        locator.entry &&
        Object.keys(locator.entry).length === 7,
      'INVALID_LOCATOR',
      '定位登记结构或账户不匹配，未恢复'
    );
    const existing = pendingUploads.value.find((item) => item.id === locator.entry.id);
    if (existing) {
      assert(
        operationFingerprint(existing) === operationFingerprint(locator.entry),
        'CONFLICT',
        '同编号定位信息不同，原待办保留'
      );
      return { restored: false, alreadyPresent: true };
    }
    pendingUploads.value = pendingUploadJournal.add(locator.entry, state.value.owner, boundSession);
    return { restored: true, originalStatus: 'unverified' };
  }
  async function uploadMaintenanceAction(preview, consent) {
    assert(consent === true, 'CONSENT_REQUIRED', '请明确确认核对或整理导入登记');
    idleRecords();
    refresh();
    if (preview)
      assert(
        preview.owner === state.value.owner && preview.context === materialContext(),
        'CONTEXT_CHANGED',
        '账户或资料授权已变化，请重新预览'
      );
    const context = prepareMaterialAction(),
      owner = state.value.owner;
    const connection = materialConnection.value ? JSON.parse(JSON.stringify(materialConnection.value)) : null;
    materialBusy.value = true;
    const requestController = new AbortController();
    materialController = requestController;
    materialRequestContext = context;
    const signal = requestController.signal;
    let result;
    const assertCurrent = () => {
      ensureSessionCurrent(undefined, signal);
      assert(materialContext() === context, 'CONTEXT_CHANGED', '账户或资料授权已变化，维护回执未采用');
    };
    try {
      result = await requestUploadMaintenance(connection, preview, {
        session: boundSession,
        platform: learningClientPlatform(),
        signal,
        assertCurrent
      });
      assert(
        !signal.aborted && materialContext() === context,
        'CONTEXT_CHANGED',
        '账户或资料授权已变化，维护回执未采用'
      );
    } finally {
      if (materialController === requestController) {
        materialBusy.value = false;
        materialController = null;
        materialRequestContext = null;
      }
    }
    materialConnection.value.capabilities.uploadMaintenance.generation = result.generation;
    return preview
      ? result
      : { ...result, owner, context: materialContext(), operationId: result.requestId || learningId('maintenance') };
  }
  const previewUploadMaintenance = (consent) => uploadMaintenanceAction(null, consent);
  const compactUploadReceipts = (preview, consent) => uploadMaintenanceAction(preview, consent);

  function cancelMaterial() {
    materialController?.abort();
    materialConnectionController?.abort();
  }
  function previewMaterialDeletion(materialId) {
    idleRecords();
    return learningRepository.previewMaterialDeletion(materialId);
  }
  async function retryOriginalDeletion(deletionId, consent) {
    assert(consent, 'CONSENT_REQUIRED', '原件删除需确认');
    idleRecords();
    const current = refresh();
    const deletion = (current.materialDeletions || []).find((d) => d.deletionId === deletionId);
    assert(deletion, 'NOT_FOUND', '删除任务不存在');
    if (deletion.originalStatus !== 'pending') return { status: deletion.originalStatus };
    const context = prepareMaterialAction();
    materialBusy.value = true;
    const requestController = new AbortController();
    materialController = requestController;
    const signal = requestController.signal;
    materialRequestContext = context;
    const check = () => {
      ensureSessionCurrent();
      assert(
        !signal.aborted && materialContext() === context,
        'CONTEXT_CHANGED',
        '账户、记录或授权已变化，旧删除回执未写入'
      );
    };
    try {
      await deleteConnectedMaterial(materialConnection.value, deletion.original, {
        session: boundSession,
        platform: learningClientPlatform(),
        signal,
        assertCurrent: check
      });
      check();
      commit(
        'material.original-deleted',
        { deletionId, fileId: deletion.original.fileId },
        learningId('original_deleted')
      );
      return { status: 'deleted' };
    } catch (error) {
      check();
      return { status: 'pending', message: error.message };
    } finally {
      if (materialController === requestController) {
        materialBusy.value = false;
        materialController = null;
        materialRequestContext = null;
      }
    }
  }
  async function deleteMaterial(preview, consent) {
    idleRecords();
    const result = learningRepository.deleteMaterial(preview, consent, learningId('material_delete'));
    refresh();
    uni.$emit('conversationLearningUpdated');
    const deletion = state.value.materialDeletions.find((d) => d.materialId === preview.materialId);
    const original = await retryOriginalDeletion(deletion.deletionId, true);
    return { ...result.result, original };
  }
  function structureQuestion(materialId, input) {
    const material = state.value.materials.find((m) => m.id === materialId);
    assert(material, 'NOT_FOUND', '资料不存在');
    return addQuestion(questionFromMaterial(material, input, learningId('private_q')));
  }
  function structureObjective(materialId, input) {
    idleRecords();
    assert(active.value && !active.value.stopped, 'PRECONDITION', '请先开始或明确继续学习任务');
    const material = state.value.materials.find((m) => m.id === materialId);
    return addQuestion(
      createMaterialObjectiveQuestion(learningId('material_q'), material, input),
      'independent_correct'
    );
  }
  function correctQuestion(q, patch, reason) {
    return addQuestion(correctMaterialQuestion(q, patch, reason));
  }
  function setRubric(criteria) {
    idleRecords();
    const question = activeQuestion.value;
    assert(question?.answerType === 'subjective' && !question.validation, 'PRECONDITION', '评分维度仅用于当前主观题');
    const rubric = normalizeRubric({
      id: learningId('rubric'),
      version: 1,
      source: { kind: 'user_defined', reference: null },
      criteria
    });
    // 生成新题版本，历史评估始终绑定原维度，不重写已发生的作答。
    return correctQuestion(
      question,
      { prompt: question.prompt, rubric, rubricRevisionOf: questionKey(question) },
      '用户设置或修正评分维度；历史版本保留'
    );
  }
  function correctAssessment(attemptId, reason) {
    const id = learningId('correction');
    const result = commit('assessment.correct', { attemptId, reason, outcome: null }, id);
    const question = state.value.attempts.find((attempt) => attempt.id === attemptId)?.questionKey;
    const attempts = state.value.attempts.filter((attempt) => attempt.questionKey === question);
    const review = deriveConversationReview(attempts, state.value.reviews);
    if (review)
      commit(
        'review.rebuild',
        {
          attemptId: review.evidenceIds.at(-1),
          due: Math.max(Date.now() + 1000, review.due),
          rating: review.rating,
          policy: review.policy,
          evidenceIds: review.evidenceIds,
          correctionId: id
        },
        `${id}:review`
      );
    return result;
  }
  function generateVariant() {
    assert(!busy.value && !active.value?.stopped, 'PRECONDITION', '请先结束请求或明确继续已停止的任务');
    const original = activeQuestion.value?.prerequisite
      ? state.value.questions.find((q) => questionKey(q) === activeQuestion.value.prerequisite.originalQuestionKey)
      : activeQuestion.value;
    assert(original, 'PRECONDITION', '请先选择原题');
    const variantId = learningId('variant');
    if (original.sentenceExercise) return startSentenceTask(writingContext());
    if (original.scienceExercise) return startScience(writingContext(), original.scienceExercise.input);
    if (original.writingExercise) {
      writingAttempt();
      return addQuestion(
        createWritingQuestion(
          variantId,
          selectedConversationId.value,
          writingGenre(original),
          nextWritingTask(state.value, selectedConversationId.value, writingGenre(original)),
          questionKey(original)
        )
      );
    }
    const materialVariant = createMaterialObjectiveVariant(variantId, original, state.value);
    if (materialVariant) return addQuestion(materialVariant, 'independent_correct');
    const algebra =
      createConditionVariant(variantId, original) ||
      createPrerequisiteVariant(variantId, original, activeQuestion.value) ||
      createAlgebraVariant(variantId, original) ||
      createFractionVariant(variantId, original, activeStrategy.value.difficulty) ||
      createExactArithmeticVariant(variantId, original, activeStrategy.value.difficulty);
    if (algebra) return addQuestion(algebra);
    const originalGoal = /^计算 ([+-]?\d{1,5}) ([+×*]) ([+-]?\d{1,5})。$/.exec(original.prompt);
    assert(
      original.source?.kind === 'executable' && originalGoal,
      'CAPABILITY_UNAVAILABLE',
      '当前有限验题器不支持此原题变式，需模型生成后独立复核'
    );
    const q = createArithmeticQuestion(
      learningId('variant'),
      `${originalGoal[1]} ${originalGoal[2]} ${originalGoal[3]}`,
      activeStrategy.value.difficulty,
      original
    );
    assert(q, 'CAPABILITY_UNAVAILABLE', '当前有限验题器不支持此变式，需模型生成后独立复核');
    return addQuestion(q);
  }
  function diagnosePrerequisite(id = learningId('diagnose')) {
    assert(!busy.value && !active.value?.stopped, 'PRECONDITION', '请先结束请求或明确继续已停止的任务');
    const q = createPrerequisiteQuestion(
      `${id}_question`,
      activeQuestion.value,
      state.value.attempts,
      selectedConversationId.value
    );
    assert(q, 'CAPABILITY_UNAVAILABLE', '当前原题没有受支持的可靠错答或未完整作答依据；不会生成无依据的小题');
    const result = addQuestion(q, 'independent_correct');
    notice('先练习这个基础步骤。', `${id}:diagnostic`);
    return result;
  }
  function focus(question, conversationId, kind = null) {
    const target = state.value.questions.find((q) => questionKey(q) === question);
    const notice = target?.writingExercise || target?.scienceExercise || target?.vocabularyReview;
    if (notice) {
      assert(!conversationId || conversationId === notice.conversationId, 'FORBIDDEN', '任务属于另一对话');
      conversationId = notice.conversationId;
      if (!kind && notice.phase === 'retest') kind = 'review';
    }
    conversationId ||= selectedConversationId.value;
    if (!conversationId) conversationId = start('继续学习').id;
    selectedConversationId.value = conversationId;
    commit('question.focus', { conversationId, questionKey: question, kind });
  }
  function exportData() {
    return learningRepository.exportData();
  }
  async function checkLocalConnection() {
    const connection = localConnection.value;
    assert(connection, 'PRECONDITION', '请先配置本地连接器');
    const context = recordContext();
    const session = ensureSessionCurrent();
    const controller = new AbortController();
    localConnectionController?.abort();
    localConnectionController = controller;
    try {
      const result = await testLocalConnector(connection, {
        session: boundSession,
        platform: learningClientPlatform(),
        signal: controller.signal,
        assertCurrent: () => ensureSessionCurrent(session, controller.signal)
      });
      assert(
        !controller.signal.aborted && recordContext() === context && localConnection.value === connection,
        'CONTEXT_CHANGED',
        '账户或连接已变更，未采用旧检查结果'
      );
      localConnection.value.status = 'connector_verified';
      localConnection.value.capabilities = result.capabilities;
      return result;
    } finally {
      if (localConnectionController === controller) localConnectionController = null;
    }
  }
  async function checkMaterialConnection() {
    assert(!materialBusy.value && !materialConnectionBusy.value, 'BUSY', '资料正在处理或检查连接');
    const connection = materialConnection.value;
    const context = materialContext();
    const session = ensureSessionCurrent();
    assert(context, 'CONTEXT_CHANGED', '本机记录上下文不可用，未发起检查');
    const snapshot = connection ? JSON.parse(JSON.stringify(connection)) : null;
    const controller = new AbortController();
    materialConnectionController = controller;
    materialConnectionRequestContext = context;
    materialConnectionBusy.value = true;
    if (connection) delete connection.status;
    try {
      const result = await testMaterialConnector(snapshot, {
        session: boundSession,
        platform: learningClientPlatform(),
        signal: controller.signal,
        assertCurrent: () => ensureSessionCurrent(session, controller.signal)
      });
      assert(materialContext() === context, 'CONTEXT_CHANGED', '账户、记录或资料授权已变更，未采用旧检查结果');
      assert(!controller.signal.aborted, 'CANCELLED', '资料连接检查已取消，尚未发送资料');
      connection.status = 'connector_verified';
      connection.capabilities = {
        ...result.ocrEngines,
        uploadRecovery: result.uploadRecovery,
        uploadMaintenance: result.uploadMaintenance
      };
      return result;
    } catch (failure) {
      assert(materialContext() === context, 'CONTEXT_CHANGED', '账户、记录或资料授权已变更，未采用旧检查结果');
      throw failure;
    } finally {
      if (materialConnectionController === controller) {
        materialConnectionBusy.value = false;
        materialConnectionController = null;
        materialConnectionRequestContext = null;
      }
    }
  }
  function previewRestore(content) {
    assert(!busy.value && !materialBusy.value && !syncBusy.value, 'BUSY', '请等待当前任务结束后恢复');
    assert(!historyBusy.value, 'BUSY', '历史校验仍在执行，可先取消');
    assert(typeof content === 'string' && content.length <= 12000000, 'RESOURCE_LIMIT', '备份超过资源上限');
    let value;
    try {
      value = JSON.parse(content);
    } catch {
      /* 原恢复器返回结构错误。 */
    }
    if (value?.format === HISTORY_PACKAGE || content.length > 1500000 || value?.events?.length > 500)
      return runHistory((options) => learningRepository.previewHistoryRestore(content, options));
    return learningRepository.previewRestore(content);
  }
  async function runHistory(prepare) {
    assert(!historyBusy.value, 'BUSY', '历史校验仍在执行，可先取消');
    const controller = new AbortController();
    historyController = controller;
    try {
      historyBusy.value = true;
      historyProgress.value = null;
      const context = recordContext(),
        revision = state.value.revision;
      const session = ensureSessionCurrent();
      const assertCurrent = () => ensureSessionCurrent(session, controller.signal);
      historyRequestContext = { context, revision };
      const result = await prepare({
        signal: controller.signal,
        assertCurrent,
        onProgress: (progress) => {
          assertCurrent();
          if (!controller.signal.aborted && recordContext() === context && state.value.revision === revision)
            historyProgress.value = progress;
        }
      });
      assert(!controller.signal.aborted, 'CANCELLED', '历史校验已取消，当前记录保留');
      assert(
        context && recordContext() === context && state.value.revision === revision,
        'CONTEXT_CHANGED',
        '账户或记录已变化，请重新校验历史'
      );
      return result;
    } finally {
      if (historyController === controller) {
        historyBusy.value = false;
        historyController = null;
        historyRequestContext = null;
        historyProgress.value = null;
      }
    }
  }
  function cancelHistory() {
    historyController?.abort();
    learningRepository.cancelPreview();
  }
  function restoreData(content, preview) {
    assert(!busy.value && !materialBusy.value && !syncBusy.value, 'BUSY', '请等待当前任务结束后恢复');
    assert(preview?.owner === state.value.owner, 'OWNER_MISMATCH', '账户已切换，请重新预览');
    assert(!historyBusy.value, 'BUSY', '请等待历史校验完成');
    const result = preview.history
      ? learningRepository.restoreHistory(content, preview)
      : learningRepository.restoreData(content, preview);
    state.value = result.state;
    selectedConversationId.value = state.value.conversations.at(-1)?.id || null;
    uni.$emit('conversationLearningUpdated');
    return result;
  }
  function rollbackRecords() {
    assert(!busy.value && !materialBusy.value && !syncBusy.value, 'BUSY', '请等待当前任务结束后撤销');
    state.value = learningRepository.rollback();
    selectedConversationId.value = state.value.conversations.at(-1)?.id || null;
    uni.$emit('conversationLearningUpdated');
  }
  function resetLocalData(session) {
    return storageService.resetLocalData(session, { assertWritable: () => learningRepository.assertWriteAccess() });
  }
  function deleteData() {
    cancelHistory();
    cancel();
    cancelMaterial();
    cancelSync();
    state.value = learningRepository.deleteData();
    selectedConversationId.value = null;
    syncConflict.value = null;
  }
  function migrateLegacy() {
    state.value = learningRepository.migrateLegacy();
    return state.value;
  }
  function idleRecords(options) {
    ensureSessionCurrent(undefined, undefined, options);
    assert(!busy.value && !materialBusy.value && !syncBusy.value && !historyBusy.value, 'BUSY', '请等待或取消当前任务');
  }
  function previewGuestMigration() {
    idleRecords();
    return runHistory((options) => learningRepository.previewGuestMigration(options));
  }
  function migrateGuest(preview, consent) {
    idleRecords();
    const result = learningRepository.migrateGuest(preview, consent);
    refresh();
    selectedConversationId.value = state.value.conversations.at(-1)?.id || null;
    uni.$emit('conversationLearningUpdated');
    return result;
  }
  function syncCancelledMessage(kind) {
    return kind === 'read'
      ? '已取消读取账号学习记录，本机记录保留。'
      : kind === 'delete'
        ? '已取消等待删除结果，本机记录保留；云端是否已删除仍需核对，取消不能撤销已完成的删除。'
        : kind === 'adopt'
          ? '已取消采用云端记录，本机记录保留；请待请求收尾后再重试。'
          : '同步已取消，本机记录保留；已发送批次可能已保存云端，请待请求收尾后再明确重试。';
  }
  async function runSync(action, kind, message) {
    idleRecords();
    learningRepository.prepareAsyncAction();
    const request = {
      controller: new AbortController(),
      context: recordContext(),
      owner: state.value.owner,
      session: ensureSessionCurrent(),
      feedback: true,
      kind
    };
    assert(request.context, 'CONTEXT_CHANGED', '本机记录上下文不可用，未发起云端操作');
    syncRequest = request;
    syncController = request.controller;
    syncBusy.value = true;
    syncProgress.value = null;
    syncState.value = {
      phase: 'loading',
      kind,
      context: request.context,
      message:
        kind === 'read'
          ? '正在读取账号学习记录，本机记录保持。'
          : kind === 'delete'
            ? '正在请求删除云端学习副本，服务端结果尚未确认；本机记录保留。'
            : kind === 'adopt'
              ? '正在重新读取并核对云端冲突副本，采用前本机记录保留。'
              : '正在同步学习记录，本机记录保留；可取消等待，已发送批次可能已保存云端。'
    };
    let applied = false;
    try {
      const assertCurrent = () => ensureSessionCurrent(request.session, request.controller.signal);
      const next = await action(request.controller.signal, assertCurrent);
      assertCurrent();
      assert(!request.controller.signal.aborted, 'CANCELLED', syncCancelledMessage(kind));
      assert(
        next.owner === request.owner && getUserId() === request.owner,
        'OWNER_MISMATCH',
        '账户已变化，未显示旧操作结果'
      );
      // 同步自身的提交会推进记录生命周期；先结束请求绑定，再更新当前界面。
      request.context = null;
      applied = true;
      syncState.value = { phase: 'success', kind, context: recordContext(), message };
      state.value = next;
      if (!active.value) selectedConversationId.value = state.value.conversations.at(-1)?.id || null;
      uni.$emit('conversationLearningUpdated');
      return state.value;
    } catch (failure) {
      if (request.feedback && syncRequest === request) {
        if (applied) syncState.value.message = `${message}页面更新未完成，请重新打开核对。`;
        else if (recordContext() === request.context)
          syncState.value = {
            phase: request.controller.signal.aborted ? 'cancelled' : 'error',
            kind,
            context: request.context,
            message: request.controller.signal.aborted ? syncCancelledMessage(kind) : publicError(failure)
          };
        else syncState.value = { phase: 'idle', message: '', context: null, kind: null };
      }
      throw failure;
    } finally {
      if (syncRequest === request) {
        syncRequest = null;
        syncBusy.value = false;
        syncController = null;
        syncProgress.value = null;
        try {
          refresh();
        } catch (failure) {
          error.value = publicError(failure);
          if (applied && request.feedback) syncState.value.message = `${message}本机记录暂不能重读，请重新打开核对。`;
        }
        if (applied && kind === 'sync') {
          try {
            ensureSessionCurrent(request.session);
            // 同步已撤销旧目录；只重读当前账号元数据，不探测或调用模型。
            void loadModels().catch(() => {
              // 读取状态由模型目录维护；失败不改写已经完成的同步结果。
            });
          } catch {
            // 账号已切换或暂不可读时，不替新会话发起旧操作的后续读取。
          }
        }
      }
    }
  }
  async function readAccountRecords() {
    refresh();
    if (state.value.owner === 'guest' || state.value.revision > 0) return Promise.resolve(true);
    if (DEV_TEST) {
      const session = ensureSessionCurrent();
      await learningWriteLease.waitUntilWritable(state.value.owner);
      ensureSessionCurrent(session);
    }
    if (accountReadPromise) return accountReadPromise;
    const context = recordContext(),
      session = boundSession;
    accountRead.value = { phase: 'loading', context };
    const pending = runSync(
      async (signal, assertCurrent) => {
        const local = learningRepository.read();
        const remote = await readLearningSnapshot({ session, signal, timezone: local.timezone });
        assertCurrent();
        assert(
          recordContext() === context && learningRepository.read().revision === local.revision,
          'CONTEXT_CHANGED',
          '本机记录已变化，未采用旧账号读取结果'
        );
        // Only the existing preview archive is saved; learning facts wait for explicit adoption.
        if (remote.revision > 0) learningRepository.captureSyncConflict(remote, []);
        accountRead.value = { phase: remote.revision > 0 ? 'remote' : 'ready', context };
        return local;
      },
      'read',
      '已读取账号学习记录，本机内容未替换。'
    )
      .then(() => accountRecordState.value === 'ready')
      .catch((failure) => {
        if (recordContext() === context) accountRead.value = { phase: 'error', context };
        throw failure;
      })
      .finally(() => {
        if (accountReadPromise === pending) accountReadPromise = null;
      });
    accountReadPromise = pending;
    return pending;
  }
  function syncRecords(consent) {
    return runSync(
      (signal, assertCurrent) =>
        synchronizeLearning(learningRepository, consent, undefined, {
          signal,
          assertCurrent,
          onProgress: (progress) => {
            assertCurrent();
            if (!signal.aborted) syncProgress.value = progress;
          }
        }),
      'sync',
      '本次同步完成，已按服务端事实重算；本机后续新增记录可再次同步。'
    );
  }
  function cancelSync({ clearFeedback = false } = {}) {
    if (clearFeedback) {
      if (syncRequest) syncRequest.feedback = false;
      syncState.value = { phase: 'idle', message: '', context: null, kind: null };
    } else if (syncRequest?.context && recordContext() === syncRequest.context)
      syncState.value = {
        phase: 'cancelled',
        kind: syncRequest.kind,
        context: syncRequest.context,
        message: syncCancelledMessage(syncRequest.kind)
      };
    syncController?.abort();
  }
  function deleteCloudRecords(consent) {
    assert(consent, 'CONSENT_REQUIRED', '删除云端学习副本需要明确确认');
    return runSync(
      async (signal, assertCurrent) => {
        const owner = learningRepository.read().owner;
        const context = recordContext();
        syncProgress.value = { phase: '删除云端学习副本', calls: 1 };
        const result = await learningRequest(
          '/learning-sync',
          { action: 'delete' },
          { session: boundSession, expectedOwner: owner, signal, assertCurrent }
        );
        assertCurrent();
        assert(learningRepository.read().owner === owner, 'OWNER_MISMATCH', '账户已切换，未显示旧账户删除结果');
        assert(!signal.aborted, 'CANCELLED', '删除确认已取消；云端是否已删除需重新查询');
        assert(recordContext() === context, 'CONTEXT_CHANGED', '学习记录已变化，未显示旧删除回执；云端结果仍需核对');
        assert(result.success && result.data?.deleted === true, 'DELETE_FAILED', result.message || '云端删除未确认');
        assert(
          result.data.modelResultCacheDeleted === true,
          'DELETE_INCOMPLETE',
          '学习副本已删除，但服务端未确认教学结果缓存清除；请升级后端并重试'
        );
        return learningRepository.read();
      },
      'delete',
      '服务端已确认清除学习副本和教学结果缓存；费用事实与本机记录保留，后续主动同步或模型调用会产生新副本。'
    );
  }
  function adoptCloudRecords(preview, consent) {
    return runSync(
      (signal, assertCurrent) =>
        adoptRemoteConflict(learningRepository, preview, consent, undefined, {
          signal,
          assertCurrent,
          onProgress: (progress) => {
            assertCurrent();
            if (!signal.aborted) syncProgress.value = progress;
          }
        }),
      'adopt',
      '已采用云端记录，原本机冲突副本仍保留。'
    );
  }
  function restoreConflictLocal(preview) {
    idleRecords();
    state.value = learningRepository.restoreConflictLocal(preview);
    selectedConversationId.value = state.value.conversations.at(-1)?.id || null;
    refresh();
    syncState.value = {
      phase: 'success',
      kind: 'local',
      context: recordContext(),
      message: '已恢复本机冲突副本，云端未变更。'
    };
    uni.$emit('conversationLearningUpdated');
  }
  function clearSyncConflict(preview) {
    idleRecords();
    assert(preview, 'PRECONDITION', '请先核对当前冲突副本');
    learningRepository.clearSyncConflict(preview);
    accountRead.value = { phase: 'pending', context: null };
    syncConflict.value = null;
    syncState.value = {
      phase: 'success',
      kind: 'archive',
      context: recordContext(),
      message: '冲突归档已移除，可重新同步；当前本机与云端记录保留。'
    };
  }
  const exposed = {
    startCoach,
    coachSave,
    attachMaterial,
    attachText,
    requestCoach,
    coachReview,
    coachPractice,
    ensureSessionCurrent,
    recordReadState,
    accountRecordState,
    readAccountRecords,
    reloadRecords,
    searchRecords,
    recordFilters: RECORD_SEARCH_FILTERS,
    openRecord,
    startFocusedStudy,
    openInsightReview,
    locatedRecord,
    dismissLocatedRecord,
    state,
    active,
    activeQuestion,
    canReadChatWritingReference,
    timeline,
    conversationLocation,
    locateConversation,
    summary,
    todaySummary,
    scopedSummary,
    journey,
    journeySummary,
    journeyContext,
    configureJourney,
    trainingGroup,
    trainingResult,
    batchTrainingActive,
    startTraining,
    submitTraining,
    selectTraining,
    openTrainingFeedback,
    dailyRecap,
    journeyInsights,
    startWeakness,
    weeklyRecap,
    moduleRecap,
    confirmRecap,
    planNextTraining,
    configureReminder,
    configureStudyReminder,
    reminderQueue,
    reminderReceipt,
    openReminder,
    notificationContext,
    prepareNotificationConsent,
    attachNotifications,
    taskContext,
    teachingProgress,
    visualRequest,
    writingContext,
    startWriting,
    submitSentence,
    recordSentenceHelp,
    startSentenceTask,
    sentenceCanSubmit,
    sentenceRetest,
    scheduleSentenceRetest,
    recordWritingHelp,
    readWritingReference,
    openVocabulary,
    submitVocabulary,
    oatutorContext,
    startOatutor,
    oatutorAction,
    vocabularyTaskFor,
    startVocabularyTask,
    vocabularyCanSubmit,
    recordDiagramHelp,
    recordScienceHelp,
    startScience,
    scienceCanSubmit,
    writingCanSubmit,
    observeCalendar,
    calendarTime,
    confirmProfile,
    scienceRetest,
    scheduleScienceRetest,
    writingRetest,
    scheduleWritingRetest,
    requestWritingFeedback,
    requestVocabularyFeedback,
    currentPlan,
    selectedConversationId,
    canComputeReference,
    computeReferenceContext,
    requestComputeReference,
    canCheckGrammar,
    requestGrammarHelp,
    activeStrategy,
    canDiagnose,
    diagnosticProgress,
    diagnosePrerequisite,
    busy,
    error,
    coachError,
    coachProfileDraft,
    needsConnection,
    connectionGuide,
    selectModel,
    setSharingAllowed,
    openModelConnector,
    modelErrorPresentation,
    modelPreferenceState,
    retryState,
    models,
    modelListState,
    modelUsageState,
    modelDiscovery,
    modelDiscoveryState,
    cancelModelReads,
    questionImage,
    interpretQuestionImage,
    modelPresets,
    testModel,
    dispatchLearningAction,
    recoverConnectionTest,
    beginModelIntake,
    restartModelIntake,
    cancelModelIntake,
    answerModelIntake,
    recoverModelIntake,
    acceptModelIntake,
    intakeBusy,
    intakeError,
    modelIntakeContract,
    checkLocalConnection,
    checkMaterialConnection,
    modelId,
    usage,
    selectedMode,
    streamEnabled,
    streamSupported,
    streamPlatform,
    streamPreview,
    reply,
    recoverableRequest,
    recoverModelResult,
    retrySingleQuestion,
    localConnection,
    materialConnection,
    // 文件确认使用实际账户/记录生命周期；普通作答不会使已选文件失效。
    recordContext,
    prepareMaterialAction,
    materialContext,
    sharingAllowed,
    refresh,
    start,
    startSingleQuestion,
    singleQuestionAvailable,
    setRhythm,
    send,
    submit,
    cancel,
    commit,
    loadModels,
    suggestIdeas,
    ideasModelReady,
    loadUsage,
    loadModelDiscovery,
    saveModel,
    removeModel,
    importText,
    previewMaterialDeletion,
    deleteMaterial,
    retryOriginalDeletion,
    structureQuestion,
    structureObjective,
    correctQuestion,
    setRubric,
    correctAssessment,
    generateVariant,
    focus,
    exportData,
    previewRestore,
    historyBusy,
    historyProgress,
    cancelHistory,
    restoreData,
    rollbackRecords,
    deleteData,
    resetLocalData,
    migrateLegacy,
    importFile,
    materialBusy,
    pendingUploads,
    inspectUpload,
    recoverUpload,
    closeUpload,
    previewPendingRemoval,
    forgetPendingUpload,
    restorePendingLocator,
    previewUploadMaintenance,
    compactUploadReceipts,
    materialProgress,
    materialImportState,
    materialConnectionBusy,
    cancelMaterial,
    syncRecords,
    syncBusy,
    syncState,
    syncProgress,
    syncConflict,
    isSyncConflictCurrent: (preview) => learningRepository.isSyncConflictCurrent(preview),
    cancelSync,
    deleteCloudRecords,
    adoptCloudRecords,
    restoreConflictLocal,
    clearSyncConflict,
    exportSyncConflict: (side) => learningRepository.exportSyncConflict(side),
    previewGuestMigration,
    migrateGuest
  };
  // 未登记的动作按最严格的 write 处理：会话检查只会更严，不会变松。
  // 完整性由 tests/unit/session-round7.spec.js 在 CI 里断言，不再用运行时抛错来承担。

  for (const [name, action] of Object.entries(exposed)) {
    if (
      typeof action !== 'function' ||
      action === ensureSessionCurrent ||
      ['cancelHistory', 'cancelMaterial', 'cancelModelReads', 'cancelSync'].includes(name)
    )
      continue;
    const run = (...args) => {
      const effect = CONVERSATION_ACTION_EFFECTS[name] || 'write';
      const check = (session) =>
        ensureSessionCurrent(session, undefined, { readOnly: effect === 'read' || name === 'cancel' });
      const session = check();
      const revocation = sessionRevocation.signal;
      const tracksRetry = [
        'requestCoach',
        'restartModelIntake',
        'recoverModelIntake',
        'recoverModelResult',
        'retrySingleQuestion',
        'testModel'
      ].includes(name);
      const retryTicket = tracksRetry ? ++retryOperation : null;
      const trackResult = (value) => {
        if (tracksRetry && retryTicket === retryOperation) {
          const failure = value?.success === false;
          const presentation = failure ? modelErrorPresentation(value) : null;
          retryState.value = {
            ...retryState.value,
            operation: name,
            phase: failure ? 'failed' : 'succeeded',
            errorCode: failure ? value.error || value.errorCode || presentation.code : null,
            message: presentation?.message || '已收到结果'
          };
        }
        return value;
      };
      if (tracksRetry) retryState.value = { phase: 'running', operation: name, errorCode: null, message: '正在处理' };
      operationSessions.push(session);
      try {
        const result = action(...args);
        // This explicitly confirmed action owns the revocation it returns. Its
        // initial session check and storage lock still reject stale confirmations.
        if (name === 'resetLocalData') return result;
        if (result?.then) {
          let rejectRevoked;
          const revoked = new Promise((_resolve, reject) => {
            rejectRevoked = () =>
              reject(Object.assign(new Error('登录会话已变化，旧操作已撤销'), { code: 'CONTEXT_CHANGED' }));
            if (revocation.aborted) rejectRevoked();
            else revocation.addEventListener('abort', rejectRevoked, { once: true });
          });
          return Promise.race([result, revoked])
            .then(
              (value) => {
                check(session);
                return trackResult(value);
              },
              (failure) => {
                check(session);
                if (tracksRetry && retryTicket === retryOperation) {
                  const presentation = modelErrorPresentation(failure);
                  retryState.value = {
                    phase: 'failed',
                    operation: name,
                    errorCode: failure.code || presentation.code,
                    message: presentation.message
                  };
                }
                throw failure;
              }
            )
            .finally(() => revocation.removeEventListener('abort', rejectRevoked));
        }
        check(session);
        return result;
      } catch (failure) {
        check(session);
        if (name === 'requestCoach') {
          retryState.value = {
            phase: 'failed',
            errorCode: failure.code || 'MODEL_FAILED',
            message: modelErrorPresentation(failure).message
          };
          coachError.value = retryState.value.message;
        }
        throw failure;
      } finally {
        operationSessions.pop();
      }
    };
    exposed[name] = action.constructor.name === 'AsyncFunction' ? async (...args) => run(...args) : run;
  }
  sessionReady = true;
  ensureSessionCurrent(undefined, undefined, { readOnly: true });
  return exposed;
});
