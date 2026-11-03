<template>
  <WritingCoach
    v-if="writingCoachActive"
    :materials-open="showMaterial"
    :connection-label="emptyConnectionLabel"
    :connection-action="emptyConnectionAction"
    :connection-tone="connectionTone"
    :presentation="presentation"
    @advanced="openAIConnectors"
    @general="beginGeneralQuestion"
  />
  <LearningShell
    v-else
    active="learning"
    :dismiss-overlay="dismissOverlay"
    :notice="cancellationNotice"
    :style="{ '--muse-composer-height': `${composerHeight || 80}px` }"
    :title="$t('pages.learning')"
    @materials="showMaterial = true"
    @connections="openAIConnectors"
    @new="newConversation"
  >
    <!-- #ifdef MP-WEIXIN -->
    <PrivacyPopup />
    <!-- #endif -->
    <template #controls>
      <BaseButton
        class="connection-pill"
        :aria-expanded="showConnections"
        variant="quiet"
        icon="shapes"
        icon-only
        label="AI 连接器"
        title="AI 连接器"
        @tap="openAIConnectors"
      />
    </template>
    <template #composer>
      <MuseComposer
        id="learning-composer"
        v-model="draft"
        :get-voice-context="dictationContext"
        class="composer"
        :stop-label="t('learning.cancelRequest')"
        :attachment-label="t('learning.import')"
        :placeholder="
          learning.batchTrainingActive
            ? t('learning.kkk')
            : learning.activeQuestion?.writingExercise
              ? t('learning.ki2', { v0: learningText(activeWritingGenre.label) })
              : learning.active
                ? t('learning.kqa')
                : t('learning.chatPlaceholder')
        "
        :label="
          learning.batchTrainingActive
            ? t('learning.k95')
            : learning.activeQuestion?.writingExercise
              ? t('learning.kkv', { v0: learningText(activeWritingGenre.label) })
              : t('learning.kai')
        "
        :maxlength="
          learning.activeQuestion?.writingExercise || learning.activeQuestion?.vocabularyReview?.phase === 'usage'
            ? writingAnswerLimit(learning.activeQuestion)
            : 8000
        "
        :busy="learning.busy || learning.reply?.pending"
        :disabled="!!learning.active?.stopped || learning.accountRecordState !== 'ready'"
        @attach="showMaterial = !showMaterial"
        @stop="learning.cancel()"
        @submit="send"
        @height="composerHeight = $event"
      >
        <template v-if="learning.active" #actions>
          <MusePresentationControl :presentation="presentation" />
          <BaseButton
            v-if="learning.active"
            variant="quiet"
            :disabled="learning.busy"
            @tap="run(() => learning.dispatchLearningAction({ type: 'change_method' }))"
            >换法</BaseButton
          >
          <BaseButton v-if="learning.active" variant="quiet" :disabled="learning.busy" @tap="sendDirective('提示')"
            >只要提示</BaseButton
          >
          <BaseButton
            v-if="learning.active && !learning.active.stopped"
            variant="quiet"
            icon="pause"
            icon-only
            label="停止当前任务"
            :disabled="learning.busy"
            @tap="sendDirective('停止当前任务')"
          />
          <BaseButton
            v-if="learning.active"
            variant="quiet"
            icon="user"
            icon-only
            :label="t('tutor.intake.title')"
            :aria-expanded="showIntake"
            :disabled="learning.busy"
            @tap="showIntake = !showIntake"
          />
          <BaseButton
            v-if="learning.active"
            variant="quiet"
            icon="chart"
            icon-only
            :label="t('tutor.archive.title')"
            :aria-expanded="showInsights"
            @tap="showInsights = !showInsights"
          />
        </template>
      </MuseComposer>
    </template>
    <view
      ref="learningRoot"
      class="learning-page"
      :class="{ 'with-insights': showInsights }"
      :style="composerHeight ? { '--learning-composer-height': `${composerHeight}px` } : undefined"
    >
      <MuseModelControl @connect="openAIConnectors" />
      <MuseModelFeedback
        :failure="modelFailure"
        :state="learning.retryState"
        :busy="learning.busy"
        @action="handleModelAction"
      />
      <BaseCard v-if="learning.accountRecordState !== 'ready'" class="panel">
        <text :role="learning.accountRecordState === 'error' ? 'alert' : 'status'">{{ accountRecordMessage }}</text>
        <BaseButton
          v-if="['pending', 'error'].includes(learning.accountRecordState)"
          :disabled="learning.syncBusy"
          variant="quiet"
          @tap="run(readAccountRecords)"
          >重试读取</BaseButton
        >
        <BaseButton v-if="learning.accountRecordState === 'remote'" variant="quiet" @tap="openAccountData">
          查看已同步记录
        </BaseButton>
      </BaseCard>
      <LearningInsights v-if="showInsights" compact class="chat-insights" />
      <LearningProfileDraft
        v-if="showIntake && learning.active"
        :key="`${learning.recordContext()}:${learning.selectedConversationId}`"
        :goal="learning.active.goal"
        :busy="learning.busy"
        @cancel="showIntake = false"
        @confirm="confirmProfileDraft"
      />
      <!-- #ifdef H5 -->
      <text v-if="!learningWriteProtectionSupported" class="warning">{{ t('learning.k59') }}</text>
      <!-- #endif -->
      <BaseCard v-if="showConnections" class="panel" padding="none">
        <text class="section-title">{{ t('tutor.model.title') }}</text>
        <text class="subtle"
          >{{ t('learning.k3v')
          }}{{
            learning.selectedMode === 'offline'
              ? t('learning.kp6')
              : learning.selectedMode === 'local'
                ? t('learning.kb2')
                : t('learning.ktn')
          }}
        </text>
        <view class="button-row">
          <BaseButton v-if="legacyLearningEnabled" variant="quiet" @tap="setMode('offline')">{{
            t('learning.k1e')
          }}</BaseButton>
          <BaseButton
            data-test="model-list-read"
            :disabled="learning.modelListState.phase === 'loading'"
            :aria-disabled="learning.modelListState.phase === 'loading'"
            variant="quiet"
            @tap="loadModels"
          >
            {{ learning.modelListState.phase === 'loading' ? t('learning.k15') : t('learning.kfo') }}
          </BaseButton>
          <BaseButton
            v-if="learning.modelListState.phase === 'loading'"
            variant="quiet"
            @tap="learning.cancelModelReads('models')"
            >{{ t('learning.klz') }}</BaseButton
          >
          <!-- #ifdef H5 || MP-WEIXIN || APP-PLUS -->
          <BaseButton v-if="legacyLearningEnabled" variant="quiet" @tap="localForm = !localForm">{{
            t('learning.kl4')
          }}</BaseButton>
          <!-- #endif -->
        </view>
        <view
          v-if="learning.modelListState.message"
          class="material-status"
          :class="{ warning: learning.modelListState.phase === 'error' }"
          :role="learning.modelListState.phase === 'error' ? 'alert' : 'status'"
          aria-live="polite"
          :aria-busy="learning.modelListState.phase === 'loading'"
          data-test="model-list-status"
        >
          <BaseEmpty
            v-if="learning.modelListState.phase === 'loading'"
            state="loading"
            :title="t('ui.loading')"
            mascot-size="small"
          />
          <BaseEmpty
            v-if="learning.modelListState.phase === 'error'"
            state="error"
            :title="publicError(learning.modelListState.message)"
            mascot-size="small"
          /><text v-else>{{ learningText(learning.modelListState.message) }}</text>
        </view>
        <BaseButton
          v-if="learning.modelListState.phase === 'error' && learning.modelListState.code === 401"
          variant="quiet"
          @tap="loginForModels"
          >{{ t('learning.kn6') }}</BaseButton
        >
        <BaseButton v-else-if="learning.modelListState.phase === 'error'" variant="quiet" @tap="loadModels">{{
          t('learning.kul')
        }}</BaseButton>
        <view v-for="model in visibleModels" :key="model.id" class="model-row">
          <text>
            {{ model.provider }} / {{ model.model }} ·
            {{ model.source === 'byok' ? t('learning.kgc') : t('learning.kab') }}
          </text>
          <text class="subtle">{{
            learningText(connectionStatusLabel(model.configured === false ? 'unconfigured' : model.connectionStatus))
          }}</text>
          <text v-if="model.terms" class="subtle">{{ model.terms }}</text>
          <text v-if="model.privacy" class="subtle">{{ model.privacy }}</text>
          <BaseButton
            :disabled="learning.modelListState.phase === 'loading' || model.configured === false"
            :aria-disabled="learning.modelListState.phase === 'loading' || model.configured === false"
            variant="quiet"
            @tap="selectModel(model.id)"
          >
            {{ learning.modelId === model.id ? t('learning.ke4') : t('learning.k3y') }}
          </BaseButton>
          <BaseButton
            :disabled="learning.modelListState.phase === 'loading' || model.configured === false"
            :aria-disabled="learning.modelListState.phase === 'loading' || model.configured === false"
            variant="quiet"
            @tap="testModel(model.id)"
            >{{ t('learning.k1p') }}</BaseButton
          >
          <BaseButton
            v-if="model.source === 'byok'"
            :disabled="learning.modelListState.phase === 'loading'"
            :aria-disabled="learning.modelListState.phase === 'loading'"
            variant="quiet"
            @tap="removeModel(model.id)"
            >{{ t('learning.kfm') }}</BaseButton
          >
        </view>
        <BaseCheckbox
          class="consent"
          :model-value="learning.sharingAllowed"
          @update:model-value="run(() => learning.setSharingAllowed(!learning.sharingAllowed))"
        >
          {{ t('learning.kao') }}</BaseCheckbox
        >
        <BaseCheckbox
          :disabled="learning.busy || !learning.streamSupported"
          :aria-disabled="learning.busy || !learning.streamSupported"
          :model-value="learning.streamEnabled"
          @update:model-value="learning.streamEnabled = !learning.streamEnabled"
        >
          {{ t('learning.kgm') }}</BaseCheckbox
        >
        <BaseButton variant="quiet" @tap="byokForm = !byokForm">{{ t('learning.k9r') }}</BaseButton>
        <view v-if="byokForm" class="form">
          <view class="button-row">
            <BaseButton v-for="preset in connectionPresets" :key="preset.id" variant="quiet" @tap="usePreset(preset)">
              {{ preset.provider }} · {{ preset.model }}
            </BaseButton>
          </view>
          <BaseInput v-model="profile.id" :placeholder="t('learning.kbe')" maxlength="60" :label="t('learning.kbe')" />
          <BaseInput
            v-model="profile.provider"
            :placeholder="t('learning.kdp')"
            maxlength="80"
            :label="t('learning.kdp')"
          />
          <BaseInput
            v-model="profile.model"
            :placeholder="t('learning.k52')"
            maxlength="120"
            :label="t('learning.k52')"
          />
          <BaseInput
            v-model="profile.endpoint"
            :placeholder="t('learning.k82')"
            :label="t('learning.kk4')"
            @blur="profile.endpoint = completeModelEndpoint(profile.endpoint)"
          />
          <BaseInput
            v-model="profile.apiKey"
            :maxlength="MODEL_API_KEY_MAX_LENGTH"
            :placeholder="t('learning.kba')"
            :label="t('learning.kba')"
            type="password"
          />
          <text class="subtle">{{ t('learning.krr') }}</text>
          <text class="subtle">{{ t('learning.kly') }}</text>
          <BaseCheckbox :model-value="profile.stream" @update:model-value="profile.stream = !profile.stream">
            {{ t('learning.keh') }}</BaseCheckbox
          >
          <BaseCheckbox :model-value="profile.vision" @update:model-value="profile.vision = !profile.vision">
            {{ t('learning.kke') }}</BaseCheckbox
          >
          <BaseCheckbox v-model="vaultConsent">{{ t('learning.k32') }}</BaseCheckbox>
          <BaseButton variant="quiet" @tap="saveModel">{{ t('learning.kh2') }}</BaseButton>
        </view>
        <view v-if="legacyLearningEnabled && localForm" class="form">
          <BaseInput v-model="localEndpoint" :placeholder="t('learning.kat')" :label="t('learning.kat')" />
          <BaseInput v-model="localModel" :placeholder="t('learning.kpl')" :label="t('learning.kpl')" />
          <BaseInput v-model="localToken" :placeholder="t('learning.k4v')" :label="t('learning.k4v')" type="password" />
          <text class="subtle">{{ t('learning.kv4') }}</text>
          <!-- #ifdef MP-WEIXIN -->
          <text class="subtle">{{ t('learning.khz') }}</text>
          <!-- #endif -->
          <BaseButton variant="quiet" @tap="connectLocal">{{ t('learning.kk5') }}</BaseButton>
          <text v-if="learning.localConnection?.status" class="subtle">
            {{ learning.localConnection.status === 'model_verified' ? t('learning.k80') : t('learning.k57')
            }}{{ t('learning.k29') }}</text
          >
        </view>
        <view class="button-row">
          <BaseButton
            :disabled="learning.modelUsageState.phase === 'loading'"
            :aria-disabled="learning.modelUsageState.phase === 'loading'"
            variant="quiet"
            @tap="loadUsage"
          >
            {{ learning.modelUsageState.phase === 'loading' ? t('learning.kbc') : t('learning.kod') }}
          </BaseButton>
          <BaseButton
            v-if="learning.modelUsageState.phase === 'loading'"
            variant="quiet"
            @tap="learning.cancelModelReads('usage')"
            >{{ t('learning.kfd') }}</BaseButton
          >
        </view>
        <view
          v-if="learning.modelUsageState.message"
          class="material-status"
          :class="{ warning: learning.modelUsageState.phase === 'error' }"
          :role="learning.modelUsageState.phase === 'error' ? 'alert' : 'status'"
          aria-live="polite"
          :aria-busy="learning.modelUsageState.phase === 'loading'"
          data-test="model-usage-status"
        >
          <BaseEmpty
            v-if="learning.modelUsageState.phase === 'loading'"
            state="loading"
            :title="t('ui.loading')"
            mascot-size="small"
          />
          <BaseEmpty
            v-if="learning.modelUsageState.phase === 'error'"
            state="error"
            :title="publicError(learning.modelUsageState.message)"
            mascot-size="small"
          /><text v-else>{{ learningText(learning.modelUsageState.message) }}</text>
        </view>
        <BaseButton
          v-if="learning.modelUsageState.phase === 'error' && learning.modelUsageState.code === 401"
          variant="quiet"
          @tap="loginForModels"
          >{{ t('learning.kn6') }}</BaseButton
        >
        <BaseButton v-else-if="learning.modelUsageState.phase === 'error'" variant="quiet" @tap="loadUsage">{{
          t('learning.kdl')
        }}</BaseButton>
        <view v-if="learning.usage" class="subtle">
          <text
            >{{ t('learning.k9q')
            }}{{
              learning.usage.entitlement.weeklyUnits -
              learning.usage.entitlement.spent -
              learning.usage.entitlement.reserved
            }}
          </text>
          <text
            >{{ t('learning.k8o') }}{{ learning.usage.cost.spent }}{{ t('learning.k5')
            }}{{ learning.usage.cost.reserved }}{{ t('learning.k9d') }}{{ learning.usage.cost.pending
            }}{{ t('learning.kbd') }}</text
          >
          <text v-if="learning.usage.byokBudget"
            >{{ t('learning.k36') }}{{ learning.usage.byokBudget.used }} / {{ learning.usage.byokBudget.limit
            }}{{ t('learning.kt6') }}{{ learning.usage.byokBudget.pendingCosts }}{{ t('learning.kbd') }}</text
          >
        </view>
      </BaseCard>
      <view v-if="learning.active" class="conversation-area">
        <view class="conversation-toolbar">
          <view>
            <text class="conversation-title">{{ learning.active?.goal }}</text>
          </view>
          <BaseButton :disabled="learning.busy" :aria-disabled="learning.busy" variant="quiet" @tap="newConversation">
            <BaseIcon name="plus" tone="ink-3" />
            <text>{{ t('learning.k34') }}</text>
          </BaseButton>
        </view>
        <view
          v-if="conversationStopped"
          id="learning-stop-state"
          tabindex="-1"
          role="region"
          :aria-label="t('learning.keb')"
          class="button-row"
          ><AnimatedAvatar :size="48" />
          <text class="warning">{{ t('learning.keb') }}</text>
          <BaseButton
            :disabled="learning.busy"
            :aria-disabled="learning.busy"
            variant="primary"
            @tap="sendDirective('继续当前任务')"
            >{{ t('learning.kad') }}</BaseButton
          >
        </view>
        <view v-if="conversationMessages.length > 50" class="conversation-toolbar">
          <BaseButton
            :disabled="messageStart === 0"
            :aria-disabled="messageStart === 0"
            variant="quiet"
            @tap="messageStart = Math.max(0, messageStart - 50)"
            >{{ t('learning.k6q') }}</BaseButton
          >
          <text class="subtle"
            >{{ t('learning.kqd') }}{{ messageStart + 1 }}–{{
              Math.min(messageStart + 50, conversationMessages.length)
            }}
            / {{ conversationMessages.length }}</text
          >
          <BaseButton
            :disabled="messageStart + 50 >= conversationMessages.length"
            :aria-disabled="messageStart + 50 >= conversationMessages.length"
            variant="quiet"
            @tap="messageStart = Math.min(conversationMessages.length - 50, messageStart + 50)"
            >{{ t('learning.ku5') }}</BaseButton
          >
          <BaseButton variant="quiet" @tap="messageStart = Math.max(0, conversationMessages.length - 50)">{{
            t('learning.kaz')
          }}</BaseButton>
          <BaseButton v-if="learning.activeQuestion" variant="quiet" @tap="locateQuestionMessages">{{
            t('learning.kae')
          }}</BaseButton>
        </view>
        <view
          v-for="chapter in visibleChapters"
          :id="`learning-day-${chapter.day}`"
          :key="chapter.day"
          class="conversation-day"
          :aria-label="t('learning.kse', { v0: chapter.day })"
          tabindex="-1"
        >
          <view class="conversation-day-heading">
            <text>{{ chapter.day }}</text>
            <view class="conversation-day-rule" aria-hidden="true" />
          </view>
          <view v-if="chapter.groups.length" class="chapter-modules" :aria-label="t('learning.k1l')">
            <BaseButton
              v-for="group in chapter.groups"
              :key="group.id"
              :disabled="learning.busy"
              :aria-disabled="learning.busy"
              variant="quiet"
              @tap="learning.locateConversation(learning.active?.id, chapter.day, group.id)"
            >
              <text>{{ learningText(group.label) }}</text>
              <text class="chapter-module-count"
                >{{ group.questionKeys.length }}{{ t('learning.kg5')
                }}{{ group.submittedBy ? t('learning.kbr') : t('learning.knj') }}</text
              >
              <BaseIcon name="arrow-right" tone="ink-3" />
            </BaseButton>
          </view>
          <BaseBubble
            v-for="message in chapter.messages"
            :id="message.id"
            :key="message.id"
            :data-reply-pending="message.pending ? 'true' : undefined"
            class="message"
            :class="[message.role, { 'sentence-hint-target': message.id === sentenceHintTargetId }]"
            :tabindex="message.id === sentenceHintTargetId ? -1 : undefined"
            :author="message.role === 'user' ? 'user' : 'assistant'"
            :group="message.groupPosition"
            :rich="message.rich && !message.id.endsWith(':reply')"
            avatar
            :avatar-src="message.role === 'user' ? userAvatar : ''"
            :avatar-identity="message.id"
            :avatar-business="{ busy: !!message.pending, producing: !!message.pending && !!message.content }"
          >
            <template v-if="message.groupTime" #time>{{ message.groupTime }}</template>
            <text v-if="sentenceAnswersByFeedback[message.id]" class="message-content sentence-saved-answer" selectable
              >{{ t('learning.kcd') }}{{ sentenceAnswersByFeedback[message.id] }}</text
            >
            <LearningProposalCard
              v-if="message.proposal?.data && ['profile.set', 'plan.set'].includes(message.proposal.type)"
              :proposal="message.proposal"
              :status="proposalStatus(learning.state, message.id)"
              :busy="learning.busy || conversationStopped"
              @resolve="resolveProposal(message, $event)"
            />
            <LearningMessage
              v-else-if="message.role !== 'user'"
              :content-blocks="message.contentBlocks"
              :presentation="presentation.mode"
              :pending="!!message.pending"
              :content="message.role === 'notice' ? learningText(message.content) : message.content"
            />
            <text v-else class="message-content" selectable>{{ message.content }}</text>
            <BaseButton
              v-if="message.id === lastEditableMessage?.id"
              icon="edit"
              icon-only
              variant="quiet"
              label="修改回答"
              @tap="editLastMessage"
            />
          </BaseBubble>
        </view>
        <view id="learning-chat-latest" tabindex="-1" />
        <view
          v-if="learning.active && !learning.activeQuestion && !conversationStopped && chatTopics.length"
          class="button-row chat-topics"
          :aria-label="t('learning.chatTopics')"
        >
          <BaseButton v-for="topic in chatTopics" :key="topic" variant="quiet" @tap="draft = t(topic)">{{
            t(topic)
          }}</BaseButton>
        </view>

        <BaseCard
          v-if="learning.locatedRecord?.attemptId"
          id="learning-record-original"
          tabindex="-1"
          class="record-original"
          :aria-label="t('learning.records.original')"
          :title="t('learning.records.original')"
          :subtitle="learning.locatedRecord.day"
        >
          <view class="form">
            <text class="message-content" selectable>{{ learning.locatedRecord.prompt }}</text>
            <text class="message-content" selectable data-test="located-original-answer">{{
              learning.locatedRecord.answer
            }}</text>
            <view class="button-row">
              <BaseTag :tone="learning.locatedRecord.grade?.status === 'reliable' ? 'violet' : 'neutral'">{{
                t(
                  `learning.feedback.${learning.locatedRecord.grade?.status === 'reliable' ? learning.locatedRecord.grade.outcome : 'pending'}`
                )
              }}</BaseTag>
              <BaseTag v-if="learning.locatedRecord.helped" tone="neutral">{{ t('learning.feedback.helped') }}</BaseTag>
              <BaseButton
                v-if="essayForAttempt(learning.locatedRecord.attemptId)"
                variant="quiet"
                icon="file-text"
                @tap="openStudentArtifact(learning, essayForAttempt(learning.locatedRecord.attemptId))"
                >打开文档</BaseButton
              >
              <BaseButton variant="quiet" @tap="learning.dismissLocatedRecord()">{{
                t('learning.records.close')
              }}</BaseButton>
            </view>
          </view>
        </BaseCard>
        <BaseCard
          v-if="learning.activeQuestion && !learning.batchTrainingActive"
          id="active-learning-question"
          tabindex="-1"
          class="question-block"
          surface="paper"
          padding="large"
        >
          <view class="lesson-card-heading"
            ><BaseIcon name="edit" /><text>{{ t('tutor.card.question') }}</text
            ><AnimatedAvatar :size="48"
          /></view>
          <text class="subtle">
            {{
              learning.activeQuestion.source?.kind === 'user_input'
                ? t('learning.chatProvidedQuestion')
                : learning.activeQuestion.scope === 'generated'
                  ? t('learning.kax')
                  : t('learning.kil')
            }}
            ·
            {{ learning.activeQuestion.validation ? t('learning.k1b') : t('learning.k4h') }}
          </text>
          <BaseCard
            v-for="(reading, index) in quizOriginalView.readings"
            :key="index"
            class="question-block"
            data-test="quiz-original-reading"
            padding="none"
          >
            <text class="subtle">{{ learningText(reading.label) }}</text>
            <text class="message-content" selectable>{{ reading.text }}</text>
          </BaseCard>
          <text class="question-prompt" selectable>{{ learning.activeQuestion.prompt }}</text>
          <BaseCard
            v-if="quizOriginalView.target"
            class="question-block"
            data-test="quiz-original-target"
            padding="none"
          >
            <text class="subtle">{{ t('learning.k3t') }}</text>
            <text class="message-content" selectable>{{ quizOriginalView.target }}</text>
          </BaseCard>
          <BaseCard
            v-if="quizOriginalView.source || quizOriginalView.license"
            class="question-block"
            data-test="quiz-original-source"
            padding="none"
          >
            <text v-if="quizOriginalView.source" class="subtle" selectable
              >{{ t('learning.kc') }}{{ quizOriginalView.source }}{{ t('learning.kbs') }}</text
            >
            <text v-if="quizOriginalView.license" class="subtle" selectable
              >{{ t('learning.k1r') }}{{ quizOriginalView.license }}{{ t('learning.kbs') }}</text
            >
          </BaseCard>
          <text
            v-if="learning.activeQuestion.source?.kind === 'existing_bank' && !learning.activeQuestion.quizOriginal"
            class="subtle"
            data-test="quiz-original-partial"
            >{{ t('learning.k6v') }}</text
          >
          <text v-if="learning.activeQuestion.prerequisite" class="subtle" :aria-label="t('learning.ky')" selectable>
            {{ learning.activeQuestion.prerequisite.reason }}
          </text>
          <view v-if="learning.activeQuestion.prerequisite" class="question-meta"
            ><text class="subtle">{{ t('learning.kr2') }}{{ learning.diagnosticProgress?.text }}</text></view
          ><view v-if="learning.questionImage" class="question-meta"
            ><text class="subtle">{{ t('learning.knb') }}</text></view
          >

          <NumberLine
            v-if="
              !conversationStopped &&
              learning.activeStrategy.method === 'diagram' &&
              conversationMessages.some(
                (m) => m.method === 'diagram' && m.questionKey === learning.active.activeQuestionKey
              )
            "
            :question="learning.activeQuestion"
          />
          <VelocityTimeGraph
            v-if="learning.activeQuestion.scienceExercise?.input.template === 'velocity_time_graph'"
            :points="learning.activeQuestion.scienceExercise.input.points"
            :visible="labVisible"
          />
          <view v-if="choiceOptions.length" class="choice-options">
            <BaseOptions
              :options="answerOptions"
              :model-value="multipleChoices ? selectedChoices : selectedChoices[0] || ''"
              :multiple="multipleChoices"
              :label="t('learning.answerOptions')"
              :disabled="learning.busy || conversationStopped"
              @update:model-value="updateChoiceDraft"
            />
            <BaseCheckbox
              v-if="!learning.activeQuestion.scienceExercise"
              data-test="multiple-answers"
              :model-value="multipleChoices"
              :disabled="learning.busy || conversationStopped"
              @update:model-value="toggleMultipleChoices"
              >{{ t('learning.multiple') }}</BaseCheckbox
            >
          </view>
          <template v-else
            ><text v-for="(option, index) in learning.activeQuestion.options || []" :key="index">{{
              option
            }}</text></template
          >
          <text v-for="(issue, index) in learning.activeQuestion.uncertainties || []" :key="index" class="warning">
            {{ issue.resolved ? t('learning.kb4') : t('learning.ku9') }}：{{ issue.field }}
            {{ issue.reason }}
          </text>
          <view v-if="learning.activeQuestion.rubric" class="form">
            <text class="subtle">{{ t('learning.kbm') }}</text>
            <text v-for="criterion in learning.activeQuestion.rubric.criteria" :key="criterion.id" class="subtle">
              {{ learningText(criterion.name) }}（{{ criterion.maxScore }}{{ t('learning.kc1')
              }}{{ learning.activeQuestion.writingExercise ? '' : `：${criterion.description}` }}
            </text>
          </view>

          <view v-if="rubricAssessment" class="form" :aria-label="t('learning.kr0')">
            <text v-if="rubricAssessment.vocabularyUse" class="warning">{{ t('learning.kj9') }}</text>
            <text v-else class="warning"
              >{{ t('learning.kmr')
              }}{{ rubricAssessment.score === null ? t('learning.ki1') : rubricAssessment.score }} /
              {{ rubricAssessment.maxScore }}
            </text>
            <RubricEvidence
              :attempt="rubricAttempt"
              :assessment="rubricAssessment"
              :context-key="learning.recordContext()"
            />
          </view>

          <text
            v-if="
              (learning.activeQuestion.scienceExercise?.phase === 'retest' && !learning.scienceCanSubmit()) ||
              (learning.activeQuestion.writingExercise?.phase === 'retest' && !learning.writingCanSubmit()) ||
              (learning.activeQuestion.vocabularyReview?.phase === 'retest' && !learning.vocabularyCanSubmit())
            "
            class="subtle"
            >{{
              (
                learning.activeQuestion.scienceExercise?.dueDay ||
                learning.activeQuestion.writingExercise?.dueDay ||
                learning.activeQuestion.vocabularyReview?.dueDay
              )
                .slice(5)
                .replace('-', '/')
            }}{{ t('learning.kd5') }}</text
          >
          <view v-if="latestAnswer" class="answer-feedback" role="status"
            ><YoziMascot
              :key="latestAnswer.id"
              :pose="answerMascot.pose"
              :play="answerMascot.play"
              size="small"
            /><BaseTag :tone="answerMascot.tone">{{ t(answerMascot.label) }}</BaseTag></view
          ><BaseButton
            v-if="essayForAttempt(latestAnswer?.id)"
            variant="quiet"
            icon="file-text"
            :data-essay-artifact="essayForAttempt(latestAnswer.id).id"
            @tap="openStudentArtifact(learning, essayForAttempt(latestAnswer.id))"
            >打开文档</BaseButton
          ><view class="question-actions"
            ><view class="question-secondary" role="group" :aria-label="t('learning.questionActions')"
              ><BaseChip
                action
                surface="glass"
                :disabled="learning.busy || learning.active?.stopped"
                :aria-disabled="learning.busy || learning.active?.stopped"
                @tap="sendDirective(learning.canReadChatWritingReference ? '读参考信件' : '提示')"
                >{{
                  learning.canReadChatWritingReference ? t('learning.readSampleEmail') : t('learning.hint')
                }}</BaseChip
              ><BaseChip
                v-if="showConnections || !learning.activeQuestion.validation"
                action
                surface="glass"
                :disabled="learning.busy || learning.active?.stopped"
                :aria-disabled="learning.busy || learning.active?.stopped"
                @tap="recordHint"
                >{{ t('learning.k8') }}</BaseChip
              ><BaseChip
                action
                surface="glass"
                :disabled="learning.busy || conversationStopped"
                @tap="sendDirective('直接讲解')"
                >{{ t('learning.chatExplain') }}</BaseChip
              ><template v-if="learning.activeQuestion.prerequisite"
                ><BaseChip
                  :disabled="learning.busy"
                  :aria-disabled="learning.busy"
                  action
                  surface="glass"
                  @tap="learning.focus(learning.activeQuestion.prerequisite.originalQuestionKey)"
                  >{{ t('learning.kpe') }}</BaseChip
                ><BaseChip
                  :disabled="learning.busy || conversationStopped"
                  :aria-disabled="learning.busy || conversationStopped"
                  action
                  surface="glass"
                  @tap="sendDirective('独立检验原题')"
                  >{{ t('learning.k3z') }}</BaseChip
                ></template
              >
              <BaseChip
                v-if="!learning.activeQuestion.prerequisite && learning.canDiagnose"
                :disabled="learning.busy || conversationStopped"
                :aria-disabled="learning.busy || conversationStopped"
                action
                surface="glass"
                @tap="sendDirective('开始先修诊断')"
                >{{ t('learning.kmm') }}</BaseChip
              ><template v-if="learning.questionImage"
                ><BaseChip
                  :disabled="learning.busy || conversationStopped"
                  :aria-disabled="learning.busy || conversationStopped"
                  action
                  surface="glass"
                  @tap="interpretImage"
                  >{{ t('learning.k3r') }}</BaseChip
                ></template
              >
              <template v-if="learning.canComputeReference"
                ><BaseChip
                  :disabled="learning.busy || conversationStopped"
                  :aria-disabled="learning.busy || conversationStopped"
                  action
                  surface="glass"
                  @tap="computeReference"
                  >{{ t('learning.ktu') }}</BaseChip
                ></template
              >
              <template v-if="learning.canCheckGrammar"
                ><BaseChip
                  :disabled="learning.busy || conversationStopped"
                  :aria-disabled="learning.busy || conversationStopped"
                  action
                  surface="glass"
                  @tap="checkGrammar"
                  >{{ t('learning.kfw') }}</BaseChip
                ></template
              >
              <view
                v-if="learning.activeQuestion.writingExercise && rubricAttempt"
                class="question-action-group"
                role="group"
                :aria-label="t('learning.kki')"
                ><BaseChip
                  :disabled="learning.busy || conversationStopped"
                  :aria-disabled="learning.busy || conversationStopped"
                  action
                  surface="glass"
                  @tap="run(() => learning.requestWritingFeedback())"
                  >{{ t('learning.k72') }}</BaseChip
                ><BaseChip
                  :disabled="learning.busy || conversationStopped"
                  :aria-disabled="learning.busy || conversationStopped"
                  action
                  surface="glass"
                  @tap="variant"
                  >{{ t('learning.khe') }}</BaseChip
                ><BaseChip
                  :disabled="learning.busy || conversationStopped || !!learning.writingRetest"
                  :aria-disabled="learning.busy || conversationStopped || !!learning.writingRetest"
                  action
                  surface="glass"
                  @tap="planWritingRetest"
                >
                  {{
                    learning.writingRetest
                      ? t('learning.kf0', { v0: learning.writingRetest.day.slice(5).replace('-', '/') })
                      : t('learning.k2m')
                  }}
                </BaseChip></view
              >
              <view
                v-if="learning.activeQuestion.vocabularyReview?.phase === 'usage' && rubricAttempt"
                class="question-action-group"
                role="group"
                :aria-label="t('learning.kcl')"
                ><BaseChip
                  :disabled="learning.busy || conversationStopped"
                  :aria-disabled="learning.busy || conversationStopped"
                  action
                  surface="glass"
                  @tap="run(() => learning.requestVocabularyFeedback())"
                  >{{ t('learning.k72') }}</BaseChip
                ></view
              >
              <view
                v-if="learning.activeQuestion.scienceExercise && rubricAttempt"
                class="question-action-group"
                role="group"
                :aria-label="t('learning.k4y')"
                ><BaseChip
                  :disabled="learning.busy || conversationStopped || !!learning.scienceRetest"
                  :aria-disabled="learning.busy || conversationStopped || !!learning.scienceRetest"
                  action
                  surface="glass"
                  @tap="run(() => learning.scheduleScienceRetest())"
                >
                  {{
                    learning.scienceRetest
                      ? t('learning.kf0', { v0: learning.scienceRetest.day.slice(5).replace('-', '/') })
                      : t('learning.k2m')
                  }}
                </BaseChip></view
              >
              <BaseChip
                v-if="
                  !learning.activeQuestion.writingExercise &&
                  !learning.activeQuestion.vocabularyReview &&
                  !learning.activeQuestion.sentenceExercise
                "
                action
                surface="glass"
                @tap="variant"
                >{{ t('learning.k35') }}</BaseChip
              ><BaseChip
                v-if="
                  (showConnections || !learning.activeQuestion.validation) &&
                  !learning.activeQuestion.scienceExercise &&
                  !learning.activeQuestion.vocabularyReview &&
                  !learning.activeQuestion.sentenceExercise
                "
                action
                surface="glass"
                @tap="editQuestion"
                >{{ t('learning.k0') }}</BaseChip
              ><BaseChip
                v-if="
                  learning.activeQuestion.answerType === 'subjective' &&
                  !learning.activeQuestion.validation &&
                  !learning.activeQuestion.vocabularyReview
                "
                :disabled="learning.busy || learning.materialBusy || learning.syncBusy"
                :aria-disabled="learning.busy || learning.materialBusy || learning.syncBusy"
                action
                surface="glass"
                @tap="editRubric"
                >{{ t('learning.kbm') }}</BaseChip
              ></view
            ><BaseButton
              v-if="
                learning.activeQuestion && !learning.batchTrainingActive && !learning.activeQuestion.sentenceExercise
              "
              :disabled="
                learning.busy ||
                !draft.trim() ||
                conversationStopped ||
                !learning.scienceCanSubmit() ||
                !learning.writingCanSubmit() ||
                !learning.vocabularyCanSubmit()
              "
              :aria-disabled="
                learning.busy ||
                !draft.trim() ||
                conversationStopped ||
                !learning.scienceCanSubmit() ||
                !learning.writingCanSubmit() ||
                !learning.vocabularyCanSubmit()
              "
              variant="primary"
              @tap="submitExplicit"
              >{{ t('learning.submitAnswer') }}</BaseButton
            ></view
          ><view v-if="showRubric" class="form" :aria-label="t('learning.kce')">
            <view v-for="(criterion, index) in rubricCriteria" :key="criterion.id" class="form">
              <BaseInput
                v-model="criterion.name"
                :placeholder="t('learning.kd1')"
                :label="t('learning.k3l', { v0: index + 1 })"
              />
              <BaseInput
                v-model="criterion.description"
                class="field"
                :placeholder="t('learning.klk')"
                :label="t('learning.k55', { v0: index + 1 })"
                multiline
              />
              <BaseInput
                v-model.number="criterion.maxScore"
                type="number"
                :placeholder="t('learning.k9j')"
                :label="t('learning.k28', { v0: index + 1 })"
              />
              <BaseButton
                :disabled="rubricCriteria.length === 1"
                :aria-disabled="rubricCriteria.length === 1"
                variant="quiet"
                @tap="rubricCriteria.splice(index, 1)"
                >{{ t('learning.k54') }}</BaseButton
              >
            </view>
            <view class="button-row">
              <BaseButton
                :disabled="rubricCriteria.length >= 6"
                :aria-disabled="rubricCriteria.length >= 6"
                variant="quiet"
                @tap="addRubricCriterion"
                >{{ t('learning.k7d') }}</BaseButton
              >
              <BaseButton variant="quiet" @tap="saveRubric">{{ t('learning.ksw') }}</BaseButton>
              <BaseButton variant="quiet" @tap="showRubric = false">{{ t('learning.knr') }}</BaseButton>
            </view>
          </view> </BaseCard
        ><view v-if="hasConversationAttempts || learning.active?.journey" class="lesson-card-heading"
          ><BaseIcon name="check" /><text>{{ t('tutor.card.recap') }}</text></view
        ><LearningOverview
          v-if="hasConversationAttempts || learning.active?.journey"
          :show-navigation="false"
          :inline="true"
          :conversation-id="learning.active?.id"
        /><view v-if="learning.active?.journey || showJourney" id="learning-journey-workspace" tabindex="-1"
          ><LearningJourney ref="journeyPanel" :inline="true"
        /></view>
        <view v-if="hasConversationAttempts && !learning.active?.journey && !showJourney" class="button-row">
          <BaseButton variant="quiet" @tap="showJourney = true">{{ t('learning.chatPlanReview') }}</BaseButton>
        </view>
        <view v-if="learning.recoverableRequest && !learning.busy" class="button-row">
          <text class="subtle">{{ t('learning.kp2') }}</text>
          <BaseButton variant="quiet" @tap="run(() => learning.recoverModelResult())">{{
            t('learning.khs')
          }}</BaseButton>
          <BaseButton
            v-if="learning.active?.entryContract === SINGLE_QUESTION_CONTRACT"
            variant="quiet"
            :disabled="!learning.sharingAllowed"
            @tap="retryQuestion"
            >重新生成讲解</BaseButton
          >
        </view>
        <view v-if="learning.error && !cancellationNotice" id="learning-request-error" tabindex="-1">
          <BaseEmpty v-if="publicError(learning.error, null)" state="error" :title="publicError(learning.error)" />
          <MuseModelFeedback
            v-else
            :failure="modelFailure || { error: learning.retryState?.errorCode || 'MODEL_FAILED' }"
            :busy="learning.busy"
            @action="handleModelAction"
          />
        </view>
        <OatutorPractice
          v-if="learning.activeQuestion?.oatutorExercise?.role === 'main'"
          :question="learning.activeQuestion"
          :state="learning.state"
          :context="learning.oatutorContext()"
          :visible="labVisible"
          :stopped="!!conversationStopped"
          :busy="learning.busy || learning.materialBusy || learning.syncBusy || learning.historyBusy"
          :action="learning.oatutorAction"
          :start-task="learning.startOatutor"
        />
        <SentenceBuilder
          v-if="learning.activeQuestion?.sentenceExercise"
          :question="learning.activeQuestion"
          :state="learning.state"
          :context="labContext"
          :visible="labVisible"
          :stopped="!!conversationStopped"
          :busy="learning.busy || learning.materialBusy || learning.syncBusy || learning.historyBusy"
          :ready="learning.sentenceCanSubmit()"
          :retest="learning.sentenceRetest"
          :submit-order="learning.submitSentence"
          :record-help="learning.recordSentenceHelp"
          :next-task="learning.startSentenceTask"
          :schedule-retest="learning.scheduleSentenceRetest"
        />
      </view>
      <LearningLab
        v-if="
          learning.activeQuestion &&
          !learning.batchTrainingActive &&
          !learning.activeQuestion?.sentenceExercise &&
          !learning.activeQuestion?.oatutorExercise &&
          ![DENSITY_TRANSFER_CONTRACT, PRESSURE_TRANSFER_CONTRACT].includes(
            learning.activeQuestion?.scienceExercise?.contract
          )
        "
        :state="learning.state"
        :conversation-id="learning.selectedConversationId"
        :context="labContext"
        :visible="labVisible"
        :stopped="!!learning.active?.stopped"
        :busy="learning.busy || learning.materialBusy || learning.syncBusy || learning.historyBusy"
        :record-writing-help="recordWritingPracticeHelp"
        :read-writing-reference="readWritingPracticeReference"
        :open-vocabulary="openWritingVocabulary"
        :submit-vocabulary="submitWritingVocabulary"
        :vocabulary-task-for="learning.vocabularyTaskFor"
        :start-vocabulary-task="startWritingVocabularyTask"
        :record-diagram-help="recordDiagramPracticeHelp"
        :record-science-help="recordSciencePracticeHelp"
        :question="learning.activeQuestion"
        :request="learning.visualRequest"
        :icon-color="iconColor"
        @question="openLabQuestion"
        @writing="startIndependentWriting"
        @science="startIndependentScience"
      />
      <DensityPractice
        v-if="
          [DENSITY_TRANSFER_CONTRACT, PRESSURE_TRANSFER_CONTRACT].includes(
            learning.activeQuestion?.scienceExercise?.contract
          )
        "
        :question="learning.activeQuestion"
        :context="labContext"
        :visible="labVisible"
        :stopped="!!learning.active?.stopped"
        :busy="learning.busy || learning.materialBusy || learning.syncBusy || learning.historyBusy"
        :record-help="recordSciencePracticeHelp"
        @science="startIndependentScience"
      />
      <view v-if="showConnections && learning.active" class="today-layout in-session">
        <BaseCard class="rhythm-panel" padding="none">
          <view class="rhythm-heading">
            <text class="section-title">{{ t('learning.k7b') }}</text>
          </view>
          <view class="rhythm-options">
            <BaseChip
              v-for="rhythm in learningRhythms"
              :key="rhythm.id"
              :class="{ chosen: selectedRhythm === rhythm.id }"
              :disabled="learning.busy"
              :aria-disabled="learning.busy"
              :model-value="selectedRhythm === rhythm.id"
              @update:model-value="chooseRhythm(rhythm.id)"
            >
              <BaseIcon :name="rhythm.icon" tone="ink-3" />
              <view class="rhythm-copy">
                <text class="rhythm-name">{{ learningText(rhythm.label) }}</text>
              </view>
              <BaseIcon v-if="selectedRhythm === rhythm.id" name="check" tone="ink-3" />
            </BaseChip>
          </view>
          <text v-if="rhythmFeedback" class="subtle" role="status">{{ learningText(rhythmFeedback) }}</text>
        </BaseCard>
      </view>
      <view class="workspace-tools">
        <view v-if="showConnections" class="button-row">
          <BaseButton :aria-expanded="showMaterial" variant="quiet" @tap="showMaterial = !showMaterial">
            <BaseIcon name="folder" tone="ink-3" />{{ t('learning.kkt') }}</BaseButton
          >
          <BaseButton :aria-expanded="showProfile" variant="quiet" @tap="showProfile = !showProfile">{{
            t('learning.k81')
          }}</BaseButton>
          <BaseButton :aria-expanded="showData" variant="quiet" @tap="showData = !showData">{{
            t('learning.ksr')
          }}</BaseButton>
        </view>
        <BaseCard v-if="showData" class="panel" padding="none">
          <text class="section-title">{{ t('learning.ksr') }}</text>
          <text class="subtle">{{ t('learning.kq9') }}</text>
          <view class="button-row">
            <BaseButton variant="quiet" @tap="exportRecords">{{ t('learning.k3a') }}</BaseButton>
            <BaseButton
              v-if="legacyLearningEnabled"
              :aria-expanded="showRestore"
              variant="quiet"
              @tap="showRestore = !showRestore"
              >{{ t('learning.k61') }}</BaseButton
            >
            <BaseButton
              :disabled="recordActionsBusy"
              :aria-disabled="recordActionsBusy"
              variant="quiet"
              @tap="syncRecords"
              >{{ t('learning.k13') }}</BaseButton
            >
            <BaseButton v-if="learning.syncBusy" variant="quiet" @tap="learning.cancelSync">
              {{ learning.syncState.kind === 'delete' ? t('learning.kgp') : t('learning.k8i') }}
            </BaseButton>
            <BaseButton
              v-if="learning.state.owner !== 'guest'"
              :disabled="recordActionsBusy"
              :aria-disabled="recordActionsBusy"
              variant="quiet"
              @tap="previewGuestRecords"
              >{{ t('learning.k9z') }}</BaseButton
            >
            <BaseButton variant="quiet" @tap="deleteRecords">{{ t('learning.knu') }}</BaseButton>
            <BaseButton
              v-if="learning.state.owner !== 'guest'"
              :disabled="recordActionsBusy"
              :aria-disabled="recordActionsBusy"
              variant="quiet"
              @tap="deleteCloudRecords"
              >{{ t('learning.krc') }}</BaseButton
            >
          </view>
          <view
            v-if="learning.syncState.message"
            class="material-status"
            :class="{ warning: learning.syncState.phase === 'error' }"
            :role="learning.syncState.phase === 'error' ? 'alert' : 'status'"
            aria-live="polite"
            :aria-busy="learning.syncState.phase === 'loading'"
            data-test="record-sync-status"
          >
            <BaseEmpty
              v-if="learning.syncState.phase === 'loading'"
              class="feedback-loading"
              state="loading"
              :title="t('ui.loading')"
              mascot-size="small"
            />
            <BaseEmpty
              v-if="learning.syncState.phase === 'error'"
              state="error"
              :title="publicError(learning.syncState.message)"
              mascot-size="small"
            /><text v-else>{{ learningText(learning.syncState.message) }}</text>
          </view>
          <view
            v-if="recordPreviewStatus.message"
            class="material-status"
            :class="{ warning: recordPreviewStatus.phase === 'error' }"
            :role="recordPreviewStatus.phase === 'error' ? 'alert' : 'status'"
            aria-live="polite"
            :aria-busy="recordPreviewStatus.phase === 'loading'"
            data-test="record-preview-status"
          >
            <BaseEmpty
              v-if="recordPreviewStatus.phase === 'loading'"
              state="loading"
              :title="t('ui.loading')"
              mascot-size="small"
            />
            <BaseEmpty
              v-if="recordPreviewStatus.phase === 'error'"
              state="error"
              :title="learningText(recordPreviewStatus.message)"
              mascot-size="small"
            /><text v-else>{{ learningText(recordPreviewStatus.message) }}</text>
          </view>
          <view v-if="recordPreviewBusy || learning.historyBusy">
            <text v-if="learning.historyProgress" class="subtle"
              >{{ t('learning.kgn') }}{{ learning.historyProgress.completed }} /
              {{ learning.historyProgress.total }}</text
            >
            <BaseButton variant="quiet" @tap="cancelRecordPreview">{{ t('learning.k86') }}</BaseButton>
          </view>
          <text v-if="learning.syncBusy && learning.syncProgress" class="subtle" role="status"
            >{{ learning.syncProgress.phase }} · {{ learning.syncProgress.calls }}{{ t('learning.k65') }}</text
          >
          <view
            v-if="learning.syncBusy && syncOperationProgress"
            class="material-progress"
            role="progressbar"
            :aria-label="t('learning.k6m')"
            aria-valuemin="0"
            :aria-valuemax="syncOperationProgress.total"
            :aria-valuenow="syncOperationProgress.completed"
            :aria-valuetext="
              '云端已接收 ' +
              syncOperationProgress.completed +
              ' / ' +
              syncOperationProgress.total +
              ' 个操作，完整结果仍需核对'
            "
            data-test="record-sync-progress"
          >
            <view
              class="material-progress-fill"
              :style="{ transform: 'scaleX(' + syncOperationProgress.percentage / 100 + ')' }"
            />
          </view>
          <text v-if="learning.syncBusy && syncOperationProgress" class="subtle" role="status"
            >{{ t('learning.keq') }}{{ syncOperationProgress.completed }} / {{ syncOperationProgress.total
            }}{{ t('learning.kmp') }}</text
          >
          <view v-if="guestPreview" class="form">
            <text class="subtle" role="status"
              >{{ t('learning.kc3') }}{{ guestPreview.imported }}{{ t('learning.ke2') }}{{ guestPreview.reused
              }}{{ t('learning.k2q') }}{{ guestPreview.mergedPlans }}{{ t('learning.k9f')
              }}{{ guestPreview.pendingReferences }}{{ t('learning.kq2') }}</text
            >
            <text class="subtle">{{ t('learning.kk7') }}</text>
            <BaseButton
              :disabled="recordActionsBusy || !guestPreview.imported"
              :aria-disabled="recordActionsBusy || !guestPreview.imported"
              variant="quiet"
              @tap="migrateGuestRecords"
              >{{ t('learning.kou') }}</BaseButton
            >
          </view>
          <view v-if="learning.syncConflict" class="form">
            <text class="section-title">{{ t('learning.kg0') }}</text>
            <text class="subtle"
              >{{ t('learning.kgw') }}{{ learning.syncConflict.localEvents }}{{ t('learning.knd')
              }}{{ learning.syncConflict.remoteEvents }}{{ t('learning.kmq') }}</text
            >
            <view class="button-row">
              <BaseButton variant="quiet" @tap="exportConflict('local')">{{ t('learning.kay') }}</BaseButton>
              <BaseButton variant="quiet" @tap="exportConflict('remote')">{{ t('learning.key') }}</BaseButton>
              <BaseButton
                :disabled="recordActionsBusy"
                :aria-disabled="recordActionsBusy"
                variant="quiet"
                @tap="resolveConflict('remote')"
                >{{ t('learning.k51') }}</BaseButton
              >
              <BaseButton
                :disabled="recordActionsBusy"
                :aria-disabled="recordActionsBusy"
                variant="quiet"
                @tap="resolveConflict('local')"
                >{{ t('learning.kkq') }}</BaseButton
              >
              <BaseButton
                :disabled="recordActionsBusy"
                :aria-disabled="recordActionsBusy"
                variant="quiet"
                @tap="removeConflict"
                >{{ t('learning.k1o') }}</BaseButton
              >
            </view>
          </view>
          <view v-if="legacyLearningEnabled && showRestore" class="form">
            <!-- #ifdef H5 -->
            <view class="button-row">
              <BaseButton
                :disabled="recordActionsBusy"
                :aria-disabled="recordActionsBusy"
                variant="quiet"
                @tap="chooseBackupFile"
                >{{ t('learning.kbz') }}</BaseButton
              >
              <BaseButton
                v-if="recordFileBusy && !desktopHost"
                variant="quiet"
                @tap="cancelRecordFile('已取消选择或读取备份，原输入和记录保留。', 'cancelled')"
                >{{ t('learning.kv9') }}</BaseButton
              >
            </view>
            <view
              v-if="recordFileStatus.message"
              class="material-status"
              :class="{ warning: recordFileStatus.phase === 'error' }"
              :role="recordFileStatus.phase === 'error' ? 'alert' : 'status'"
              aria-live="polite"
              :aria-busy="recordFileBusy"
              data-test="record-file-status"
            >
              <BaseEmpty v-if="recordFileBusy" state="loading" :title="t('ui.loading')" mascot-size="small" />
              <BaseEmpty
                v-if="recordFileStatus.phase === 'error'"
                state="error"
                :title="learningText(recordFileStatus.message)"
                mascot-size="small"
              /><text v-else>{{ learningText(recordFileStatus.message) }}</text>
            </view>
            <text class="subtle">{{ t('learning.k9b') }}</text>
            <!-- #endif -->
            <BaseInput
              v-if="backupText.length <= HISTORY_LIMITS.pageCharacters || backupExpanded"
              v-model="backupText"
              class="field"
              :placeholder="t('learning.khj')"
              :maxlength="12000000"
              :label="t('learning.kny')"
              multiline
            />
            <view
              v-if="backupText.length > HISTORY_LIMITS.pageCharacters"
              class="material-status material-status--stack"
              data-test="record-large-backup"
            >
              <text class="subtle" role="status"
                >{{ t('learning.kj7') }}{{ backupText.length }}{{ t('learning.k8l') }}</text
              >
              <BaseButton variant="quiet" @tap="backupExpanded = !backupExpanded">
                {{ backupExpanded ? t('learning.kkc') : t('learning.k6p') }}
              </BaseButton>
              <BaseButton variant="quiet" @tap="backupText = ''">{{ t('learning.kis') }}</BaseButton>
            </view>
            <BaseButton
              :disabled="recordActionsBusy || !backupText.trim()"
              :aria-disabled="recordActionsBusy || !backupText.trim()"
              variant="quiet"
              @tap="previewRecords"
              >{{ t('learning.k1d') }}</BaseButton
            >

            <view v-if="restorePreview">
              <text class="subtle" role="status"
                >{{ t('learning.k56') }}{{ restorePreview.imported }}{{ t('learning.ke2') }}{{ restorePreview.reused
                }}{{ t('learning.k3d') }}{{ restorePreview.pendingReferences }}{{ t('learning.kjd')
                }}{{ restorePreview.pendingReviews }}{{ t('learning.ktq') }}</text
              >
              <BaseButton
                :disabled="recordActionsBusy || !restorePreview.imported"
                :aria-disabled="recordActionsBusy || !restorePreview.imported"
                variant="quiet"
                @tap="restoreRecords"
                >{{ t('learning.k7h') }}</BaseButton
              >
            </view>
            <BaseButton variant="quiet" @tap="rollbackRecords">{{ t('learning.kam') }}</BaseButton>
          </view>
        </BaseCard>
        <BaseCard v-if="showMaterial" id="material-intake" class="form panel" padding="none">
          <view class="material-heading"
            ><text class="section-title">{{ t('learning.kkt') }}</text
            ><BaseButton
              variant="quiet"
              icon-only
              icon="close"
              :label="t('learning.closeMaterials')"
              @tap="showMaterial = false"
          /></view>
          <BaseInput
            v-model="materialText"
            class="field"
            :placeholder="t('learning.ka1')"
            maxlength="50000"
            :label="t('learning.k8a')"
            multiline
          />
          <BaseButton
            :disabled="!materialText.trim() || materialActionBusy"
            :aria-disabled="!materialText.trim() || materialActionBusy"
            variant="quiet"
            @tap="importText"
            >{{ t('learning.ktv') }}</BaseButton
          >
          <!-- #ifdef H5 || MP-WEIXIN || APP-PLUS -->
          <BaseButton
            v-if="legacyLearningEnabled"
            :aria-expanded="showMaterialSettings"
            variant="quiet"
            @tap="showMaterialSettings = !showMaterialSettings"
            >{{ t('learning.krw') }}</BaseButton
          >
          <view v-if="legacyLearningEnabled && showMaterialSettings">
            <BaseInput
              v-model="materialEndpoint"
              :disabled="materialActionBusy"
              :placeholder="t('learning.k4p')"
              :label="t('learning.kme')"
            />
            <BaseInput
              v-model="materialToken"
              :disabled="materialActionBusy"
              :placeholder="t('learning.k4v')"
              :label="t('learning.k8b')"
              type="password"
            />
            <view class="button-row">
              <BaseButton
                :disabled="materialActionBusy"
                :aria-disabled="materialActionBusy"
                variant="quiet"
                @tap="connectMaterial"
              >
                {{ learning.materialConnectionBusy ? t('learning.kcu') : t('learning.kz') }}
              </BaseButton>
              <BaseButton v-if="learning.materialConnectionBusy" variant="quiet" @tap="learning.cancelMaterial">{{
                t('learning.kek')
              }}</BaseButton>
            </view>
            <view
              v-if="learning.materialConnectionBusy"
              class="material-status"
              role="status"
              aria-live="polite"
              data-test="material-connection-pending"
            >
              <BaseEmpty state="loading" :title="t('ui.loading')" mascot-size="small" />
              <text>{{ t('learning.kl3') }}</text>
            </view>
            <text v-if="learning.materialConnection?.status" class="subtle">{{ t('learning.k1i') }}</text>
            <text v-if="appleReadinessMessage" class="subtle" role="status" data-test="apple-readiness-status">{{
              learningText(appleReadinessMessage)
            }}</text>
            <BaseCheckbox v-model="allowMaterialRecognition">{{ t('learning.k4q') }}</BaseCheckbox>
            <view data-test="ocr-engine-choice" class="row wrap">
              <BaseChip
                :model-value="materialRecognitionEngine === 'tesseract'"
                @update:model-value="materialRecognitionEngine = 'tesseract'"
              >
                {{ allowMaterialRecognition ? t('learning.k6') : t('learning.kjx') }}
              </BaseChip>
              <BaseChip
                v-if="allowMaterialRecognition"
                :disabled="!appleVisionAvailable"
                :aria-disabled="!appleVisionAvailable"
                :model-value="materialRecognitionEngine === 'apple-vision'"
                @update:model-value="materialRecognitionEngine = 'apple-vision'"
                >{{ t('learning.kp5') }}</BaseChip
              >
              <BaseChip
                :disabled="!doclingAvailable"
                :aria-disabled="!doclingAvailable"
                data-test="docling-choice"
                :model-value="materialRecognitionEngine === 'docling'"
                @update:model-value="materialRecognitionEngine = 'docling'"
                >{{ t('learning.kqo') }}</BaseChip
              >
            </view>
            <text v-if="materialRecognitionEngine === 'docling'" class="subtle">{{ t('learning.kd0') }}</text>
          </view>
          <BaseButton
            :disabled="materialFileChoiceBusy"
            :aria-disabled="materialFileChoiceBusy"
            variant="quiet"
            @tap="chooseMaterialFile"
            >{{ t('learning.kqw') }}</BaseButton
          >
          <view
            v-if="appFileBusy && !learning.materialBusy"
            class="material-status"
            role="status"
            aria-live="polite"
            data-test="material-app-file-pending"
          >
            <BaseEmpty state="loading" :title="t('ui.loading')" mascot-size="small" />
            <text>{{ selectedAppFile ? t('learning.k4z') : t('learning.kst') }}</text>
            <BaseButton v-if="!selectedAppFile" variant="quiet" @tap="cancelAppFile">{{
              t('learning.kj2')
            }}</BaseButton>
          </view>
          <view v-if="clientPlatform === 'app' && selectedAppFile" data-test="app-selected-file" class="button-row">
            <text class="subtle">{{ selectedAppFile.name }} · {{ selectedAppFile.size }}{{ t('learning.kh1') }}</text>
            <BaseButton
              :disabled="appFileBusy || learning.materialBusy"
              :aria-disabled="appFileBusy || learning.materialBusy"
              variant="quiet"
              @tap="parseSelectedAppFile"
              >{{ t('learning.knq') }}</BaseButton
            >
            <BaseButton variant="quiet" @tap="cancelAppFile">{{ t('learning.k7r') }}</BaseButton>
          </view>
          <!-- #endif -->
          <view
            v-if="clientFilePhase && clientFilePhase !== 'import'"
            class="material-status"
            role="status"
            aria-live="polite"
            data-test="material-file-pending"
          >
            <BaseEmpty v-if="clientFilePhase === 'read'" state="loading" :title="t('ui.loading')" mascot-size="small" />
            <text>{{
              clientFilePhase === 'choose'
                ? t('learning.kst')
                : clientFilePhase === 'confirm'
                  ? t('learning.k5g')
                  : t('learning.k4z')
            }}</text>
            <BaseButton variant="quiet" @tap="cancelClientFile">{{ t('learning.k7r') }}</BaseButton>
          </view>
          <view
            v-if="learning.materialImportState"
            class="material-status material-status--stack"
            role="status"
            aria-live="polite"
            data-test="material-import-state"
          >
            <view class="material-status-heading">
              <BaseEmpty
                v-if="learning.materialImportState.phase === 'processing'"
                state="loading"
                :title="t('ui.loading')"
                mascot-size="small"
              />
              <text>{{ learningText(materialImportLabel) }}</text>
            </view>
            <view
              v-if="materialPageProgress"
              class="material-progress"
              role="progressbar"
              :aria-label="t('learning.kth')"
              aria-valuemin="0"
              :aria-valuemax="materialPageProgress.total"
              :aria-valuenow="materialPageProgress.completed"
              :aria-valuetext="'已处理 ' + materialPageProgress.completed + ' / ' + materialPageProgress.total + ' 页'"
            >
              <view
                class="material-progress-fill"
                :style="{ transform: 'scaleX(' + materialPageProgress.percentage / 100 + ')' }"
              />
            </view>
            <text v-if="materialPageProgress" class="subtle"
              >{{ t('learning.k3q') }}{{ materialPageProgress.completed }} / {{ materialPageProgress.total
              }}{{ t('learning.ke1') }}</text
            >
            <text
              v-if="['failed', 'cancelled', 'partial'].includes(learning.materialImportState.phase)"
              class="subtle"
              >{{ t('learning.k3e') }}</text
            >
            <BaseButton
              v-if="learning.materialImportState.phase === 'processing' && learning.materialBusy"
              variant="quiet"
              @tap="learning.cancelMaterial"
              >{{ t('learning.kfs') }}</BaseButton
            >
          </view>
          <view
            v-if="materialFeedback"
            class="material-status material-status--stack"
            :class="{ 'material-status--error': materialFeedback.kind === 'error' }"
            :role="materialFeedback.kind === 'error' ? 'alert' : 'status'"
            aria-live="polite"
            data-test="material-feedback"
          >
            <BaseEmpty
              v-if="materialFeedback.kind === 'error'"
              state="error"
              :title="learningText(materialFeedback.message)"
              mascot-size="small"
            /><text v-else>{{ learningText(materialFeedback.message) }}</text>
          </view>
          <view
            v-if="!learning.state.materials.length && !materialActionBusy"
            class="material-empty"
            data-test="material-empty"
          >
            <text>{{ t('learning.klw') }}</text>
          </view>
          <BaseButton :aria-expanded="showImportTools" variant="quiet" @tap="showImportTools = !showImportTools">{{
            t('learning.kdb')
          }}</BaseButton>
          <view v-if="showImportTools">
            <BaseButton
              :disabled="
                learning.materialBusy ||
                learning.busy ||
                learning.syncBusy ||
                !learning.materialConnection?.capabilities?.uploadMaintenance?.available
              "
              :aria-disabled="
                learning.materialBusy ||
                learning.busy ||
                learning.syncBusy ||
                !learning.materialConnection?.capabilities?.uploadMaintenance?.available
              "
              variant="quiet"
              @tap="previewUploadMaintenance"
              >{{ t('learning.kef') }}</BaseButton
            >
            <view v-if="uploadMaintenancePreview" data-test="upload-maintenance-preview">
              <text
                >{{ t('learning.kug') }}{{ uploadMaintenancePreview.closedCount }}{{ t('learning.kpg')
                }}{{ uploadMaintenancePreview.openCount }}{{ t('learning.kpp')
                }}{{ uploadMaintenancePreview.maxReceipts }}{{ t('learning.kc7') }}</text
              >
              <text class="subtle">{{ t('learning.k47') }}</text>
              <text v-if="uploadMaintenancePreview.pending"
                >{{ t('learning.k4s') }}{{ uploadMaintenancePreview.plannedCount }}{{ t('learning.kc7') }}</text
              >
              <BaseButton
                :disabled="
                  learning.materialBusy ||
                  learning.busy ||
                  learning.syncBusy ||
                  (!uploadMaintenancePreview.pending && !uploadMaintenancePreview.closedCount)
                "
                :aria-disabled="
                  learning.materialBusy ||
                  learning.busy ||
                  learning.syncBusy ||
                  (!uploadMaintenancePreview.pending && !uploadMaintenancePreview.closedCount)
                "
                variant="quiet"
                @tap="compactUploadReceipts"
                >{{ t('learning.kkb') }}</BaseButton
              >
            </view>
            <BaseButton variant="quiet" @tap="showLocator = !showLocator">{{ t('learning.ks') }}</BaseButton>
            <view v-if="showLocator" data-test="upload-locator-panel">
              <text class="subtle">{{ t('learning.kdg') }}</text>
              <BaseInput
                v-model="locatorText"
                class="field"
                maxlength="2500"
                :placeholder="t('learning.kqj')"
                :label="t('learning.kk1')"
                multiline
              />
              <BaseButton
                :disabled="!locatorText || learning.materialBusy || learning.busy || learning.syncBusy || appFileBusy"
                :aria-disabled="
                  !locatorText || learning.materialBusy || learning.busy || learning.syncBusy || appFileBusy
                "
                variant="quiet"
                @tap="restorePendingLocator"
                >{{ t('learning.k70') }}</BaseButton
              >
              <view v-if="pendingRemovalPreview" data-test="pending-upload-removal">
                <text
                  >{{ t('learning.kh4') }}{{ pendingRemovalPreview.entry.connectorOrigin }} ·
                  {{ pendingRemovalPreview.entry.id }}</text
                >
                <BaseButton variant="quiet" @tap="downloadPendingLocator">{{ t('learning.k67') }}</BaseButton>
                <BaseCheckbox v-model="pendingRemovalAcknowledged" data-test="locator-removal-ack">{{
                  t('learning.ke')
                }}</BaseCheckbox>
                <BaseButton
                  :disabled="
                    !pendingRemovalAcknowledged ||
                    learning.materialBusy ||
                    learning.busy ||
                    learning.syncBusy ||
                    appFileBusy
                  "
                  :aria-disabled="
                    !pendingRemovalAcknowledged ||
                    learning.materialBusy ||
                    learning.busy ||
                    learning.syncBusy ||
                    appFileBusy
                  "
                  variant="quiet"
                  @tap="forgetPendingUpload"
                  >{{ t('learning.kfi') }}</BaseButton
                >
              </view>
            </view>
            <view v-for="entry in learning.pendingUploads" :key="entry.id" class="model-row" data-test="pending-upload">
              <text>{{ t('learning.kpr') }}{{ entry.id.slice(-8) }} · {{ entry.size }}{{ t('learning.kn0') }}</text>
              <text class="subtle">{{ entry.connectorOrigin }}</text>
              <BaseButton
                :disabled="learning.materialBusy || learning.busy || learning.syncBusy || appFileBusy"
                :aria-disabled="learning.materialBusy || learning.busy || learning.syncBusy || appFileBusy"
                variant="quiet"
                @tap="pendingUploadAction(entry, 'inspect')"
                >{{ t('learning.kt3') }}</BaseButton
              >
              <BaseButton
                :disabled="learning.materialBusy || learning.busy || learning.syncBusy || appFileBusy"
                :aria-disabled="learning.materialBusy || learning.busy || learning.syncBusy || appFileBusy"
                variant="quiet"
                @tap="pendingUploadAction(entry, 'recover')"
                >{{ t('learning.kaj') }}</BaseButton
              >
              <BaseButton
                :disabled="learning.materialBusy || learning.busy || learning.syncBusy || appFileBusy"
                :aria-disabled="learning.materialBusy || learning.busy || learning.syncBusy || appFileBusy"
                variant="quiet"
                @tap="pendingUploadAction(entry, 'close')"
                >{{ t('learning.ksa') }}</BaseButton
              >
              <BaseButton
                :disabled="learning.materialBusy || learning.busy || learning.syncBusy || appFileBusy"
                :aria-disabled="learning.materialBusy || learning.busy || learning.syncBusy || appFileBusy"
                variant="quiet"
                @tap="exportPendingLocator(entry)"
                >{{ t('learning.kiv') }}</BaseButton
              >
            </view>
          </view>
          <BaseCard
            v-for="material in learning.state.materials"
            :key="material.id"
            class="model-row material-reading-card"
            padding="large"
          >
            <view class="lesson-card-heading"
              ><BaseIcon name="book-open" /><text>{{ t('tutor.card.material') }}</text></view
            ><text>{{ material.name }} · {{ material.segments.length }}{{ t('learning.kfh') }}</text>
            <text v-if="material.recognitionEngine === 'apple-vision'" class="subtle">{{ t('learning.klo') }}</text>
            <text v-if="material.recognitionEngine === 'docling'" class="subtle">{{ t('learning.kku') }}</text>
            <BaseButton
              v-if="material.segments.some((segment) => segment.status === 'failed')"
              :disabled="materialActionBusy"
              :aria-disabled="materialActionBusy"
              variant="quiet"
              @tap="retryMaterial(material)"
              >{{ t('learning.kuy') }}</BaseButton
            >
            <BaseButton
              v-if="material.nextPage"
              :disabled="materialActionBusy"
              :aria-disabled="materialActionBusy"
              variant="quiet"
              @tap="resumeMaterial(material)"
              >{{ t('learning.kip') }}</BaseButton
            >
            <BaseButton variant="quiet" @tap="selectMaterial(material)">{{ t('learning.koo') }}</BaseButton>
            <BaseButton
              :disabled="learning.busy || learning.materialBusy || learning.syncBusy"
              :aria-disabled="learning.busy || learning.materialBusy || learning.syncBusy"
              variant="quiet"
              @tap="deleteMaterial(material)"
              >{{ t('learning.kkz') }}</BaseButton
            >
          </BaseCard>
          <view
            v-for="deletion in (learning.state.materialDeletions || []).filter((d) => d.originalStatus === 'pending')"
            :key="deletion.deletionId"
            class="model-row"
          >
            <text>{{ t('learning.kpo') }}{{ deletion.original.fileId.slice(0, 12) }}</text>
            <BaseButton
              :disabled="learning.materialBusy || learning.syncBusy || learning.busy"
              :aria-disabled="learning.materialBusy || learning.syncBusy || learning.busy"
              variant="quiet"
              @tap="retryOriginalDeletion(deletion)"
              >{{ t('learning.kj5') }}</BaseButton
            >
          </view>
          <view v-if="selectedMaterial" class="form">
            <view class="button-row">
              <BaseButton
                v-for="(segment, index) in currentEditorMaterial?.segments || []"
                :key="segment.id"
                variant="quiet"
                @tap="selectSegment(segment)"
              >
                {{
                  segment.page ? t('learning.ku8') + segment.page + t('learning.kky') : t('learning.k1n') + (index + 1)
                }}
              </BaseButton>
            </view>
            <MaterialLayout
              v-if="selectedSegment?.extractionVersion === MATERIAL_LAYOUT_CONTRACT"
              :segment="selectedSegment"
            />
            <image
              v-else-if="selectedSegment?.preview"
              :src="selectedSegment.preview"
              mode="widthFix"
              class="source-preview"
            />
            <text
              v-if="selectedSegment?.extractionVersion !== MATERIAL_LAYOUT_CONTRACT"
              class="subtle source-excerpt"
              selectable
              >{{ selectedSegment?.content.slice(0, 300) }}</text
            >
            <text v-if="materialEditorSourceChanged" class="warning" role="status">{{ t('learning.k66') }}</text>
            <view class="form" data-test="material-objective">
              <view class="button-row">
                <BaseChip
                  v-for="(label, kind) in objectiveKinds"
                  :key="kind"
                  :data-test="'objective-kind-' + kind"
                  :model-value="objectiveKind === kind"
                  @update:model-value="objectiveKind = kind"
                >
                  {{ learningText(label) }}
                </BaseChip>
              </view>
              <view v-if="objectiveFields.fields.length" class="form">
                <text class="subtle">{{ t('learning.kds') }}{{ learningText(objectiveFromLabel) }}</text>
                <view class="button-row" :aria-label="learningText(objectiveFromLabel)">
                  <BaseChip
                    v-for="field in objectiveFields.fields"
                    :key="field.key"
                    class="objective-field"
                    data-test="objective-field-from"
                    :model-value="objectiveFrom === field.key"
                    @update:model-value="objectiveFrom = field.key"
                  >
                    {{ field.key }}：{{ field.value }}
                  </BaseChip>
                </view>
                <template v-if="objectiveKind !== 'literal'">
                  <text class="subtle">{{ t('learning.kds') }}{{ learningText(objectiveToLabel) }}</text>
                  <view class="button-row" :aria-label="learningText(objectiveToLabel)">
                    <BaseChip
                      v-for="field in objectiveFields.fields"
                      :key="field.key"
                      class="objective-field"
                      data-test="objective-field-to"
                      :model-value="objectiveTo === field.key"
                      @update:model-value="objectiveTo = field.key"
                    >
                      {{ field.key }}：{{ field.value }}
                    </BaseChip>
                  </view>
                </template>
              </view>
              <BaseButton
                class="primary"
                data-test="start-objective"
                :disabled="Boolean(objectiveUnavailable)"
                :aria-disabled="Boolean(objectiveUnavailable)"
                variant="primary"
                @tap="structureObjective"
                >{{ t('learning.kb0') }}</BaseButton
              >
              <text v-if="objectiveUnavailable" class="subtle" data-test="objective-unavailable" role="status">
                {{ learningText(objectiveUnavailable) }}
              </text>
            </view>
            <BaseInput
              v-model="privatePrompt"
              class="field"
              :placeholder="t('learning.kmw')"
              :label="t('learning.kmw')"
              multiline
            />
            <BaseInput v-model="privateAnswer" :placeholder="t('learning.kqg')" :label="t('learning.k9c')" />
            <BaseInput v-model="importedUserAnswer" :placeholder="t('learning.k6l')" :label="t('learning.kne')" />
            <BaseInput v-model="teacherAnnotation" :placeholder="t('learning.k4a')" :label="t('learning.kgk')" />
            <BaseCheckbox v-model="privateConditionsConfirmed">{{ t('learning.k84') }}</BaseCheckbox>
            <BaseButton
              :disabled="materialEditorSourceChanged"
              :aria-disabled="materialEditorSourceChanged"
              variant="quiet"
              @tap="structurePrivateQuestion"
              >{{ t('learning.kfg') }}</BaseButton
            >
          </view>
        </BaseCard>
        <BaseCard v-if="showProfile" class="form panel" padding="none">
          <text class="section-title">{{ t('learning.k81') }}</text>
          <text class="field-label">{{ t('learning.k2i') }}</text>
          <view class="button-row" :aria-label="t('learning.kal')">
            <BaseChip
              v-for="option in foundationOptions"
              :key="option"
              :class="{ chosen: !customFoundation && foundation === option }"
              :model-value="!customFoundation && foundation === option"
              @update:model-value="
                customFoundation = false;
                foundation = option;
              "
            >
              {{ learningText(option) }}
            </BaseChip>
            <BaseChip
              :model-value="customFoundation"
              @update:model-value="
                customFoundation = true;
                foundation = '';
              "
              >{{ t('learning.k2w') }}</BaseChip
            >
          </view>
          <BaseInput
            v-if="customFoundation"
            v-model="foundation"
            :placeholder="t('learning.k2i')"
            :label="t('learning.kal')"
          />
          <BaseButton
            :disabled="!foundation.trim()"
            :aria-disabled="!foundation.trim()"
            variant="quiet"
            @tap="saveFoundation"
            >{{ t('learning.ktj') }}</BaseButton
          >
          <text class="field-label">{{ t('learning.kux') }}</text>
          <view class="button-row" :aria-label="t('learning.kmx')">
            <BaseChip
              v-for="option in timezoneOptions"
              :key="option.value"
              :class="{ chosen: !customTimezone && timezone === option.value }"
              :model-value="!customTimezone && timezone === option.value"
              @update:model-value="
                customTimezone = false;
                timezone = option.value;
              "
            >
              {{ learningText(option.label) }}
            </BaseChip>
            <BaseChip :model-value="customTimezone" @update:model-value="customTimezone = true">{{
              t('learning.k2w')
            }}</BaseChip>
          </view>
          <BaseInput
            v-if="customTimezone"
            v-model="timezone"
            :placeholder="t('learning.kc2')"
            :label="t('learning.kum')"
          />
          <BaseButton variant="quiet" @tap="saveTimezone">{{ t('learning.ka8') }}</BaseButton>
          <text class="field-label">{{ t('learning.ksz') }}</text>
          <view class="button-row" :aria-label="t('learning.ksz')">
            <BaseChip
              v-for="option in planOptions"
              :key="option"
              :class="{ chosen: planLines.split('\n').includes(option) }"
              :model-value="planLines.split('\n').includes(option)"
              @update:model-value="togglePlanTask(option)"
            >
              {{ learningText(option) }}
            </BaseChip>
            <BaseButton :aria-expanded="showPlanText" variant="quiet" @tap="showPlanText = !showPlanText">{{
              t('learning.kt0')
            }}</BaseButton>
          </view>
          <BaseInput
            v-if="showPlanText"
            :model-value="planLines"
            class="field"
            :placeholder="t('learning.k5b')"
            :label="t('learning.kp9')"
            multiline
            @input="planLines = textInputValue($event)"
          />
          <BaseButton
            :disabled="!planLines.trim()"
            :aria-disabled="!planLines.trim()"
            variant="quiet"
            @tap="savePlan"
            >{{ t('learning.k7i') }}</BaseButton
          >
          <text v-for="entry in learning.state.profile" :key="entry.id" class="subtle">
            {{ { foundation: t('learning.kbh'), preference: t('learning.k7b') }[entry.field] || t('learning.kqv') }}：{{
              entry.source === 'observed' ? learningText(entry.value) : entry.value
            }}
          </text>
        </BaseCard>
      </view>
      <view v-if="learning.error && !cancellationNotice && !learning.active" id="learning-request-error" tabindex="-1">
        <BaseEmpty state="error" :title="publicError(learning.error)" mascot-size="small" />
      </view>
      <text v-if="!learning.error && feedback" class="feedback" role="status">{{ learningText(feedback) }}</text>
    </view>
    <CustomModal
      :key="dialogState.id"
      :visible="dialogState.visible"
      :title="dialogState.title === '提示' ? t('ui.dialogTitle') : learningText(dialogState.title)"
      :content="learningText(dialogState.content)"
      :editable="dialogState.editable"
      :placeholder-text="learningText(dialogState.placeholderText)"
      :confirm-text="dialogState.confirmText === '确定' ? t('ui.confirm') : learningText(dialogState.confirmText)"
      :cancel-text="dialogState.cancelText === '取消' ? t('ui.cancel') : learningText(dialogState.cancelText)"
      :show-cancel="dialogState.showCancel"
      :type="dialogState.type"
      :is-dark="theme.isDark"
      @confirm="dialogState.confirm"
      @cancel="dialogState.cancel"
      @closed="dialogState.closed"
    />
  </LearningShell>
</template>
<script setup>
import { ENTRY_EVENTS } from '../../../laf-backend/functions/_shared/learning-entries.js';
import BaseTag from '@/components/base/base-tag/base-tag.vue';
import BaseBubble from '@/components/base/base-bubble/base-bubble.vue';
import BaseOptions from '@/components/base/base-options/base-options.vue';
import YoziMascot from '@/components/base/yozi-mascot/yozi-mascot.vue';
import AnimatedAvatar from '@/components/base/animated-avatar/animated-avatar.vue';
import { visibleReply, cancelledNotice, studentAvatar } from '@/services/learning/shell-navigation.js';
import { answerFeedback, answerOptionState } from '@/components/business/learning/learning-feedback.js';
import './messages.js';
import { learningText } from '@/i18n/learning.js';
import {
  MODEL_CONNECTION_PRESETS,
  MODEL_API_KEY_MAX_LENGTH,
  visibleModelChoices,
  completeModelEndpoint
} from '../../../laf-backend/functions/_shared/ai-providers/model-endpoints.js';
import MuseModelControl from '@/components/business/learning/muse-model-control.vue';
import MuseModelFeedback from '@/components/business/learning/muse-model-feedback.vue';
import { modelErrorPresentation } from '../../../laf-backend/functions/_shared/model-errors.js';
import { publicError, t } from '@/i18n/index.js';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseCard from '@/components/base/base-card/base-card.vue';
import BaseEmpty from '@/components/base/base-empty/base-empty.vue';
import BaseCheckbox from '@/components/base/base-checkbox/base-checkbox.vue';
import BaseInput from '@/components/base/base-input/base-input.vue';
import BaseChip from '@/components/base/base-chip/base-chip.vue';

import { workspaceDrafts } from '@/services/learning/workspace-drafts.js';
import { bindLearningKeyboard } from '@/services/learning/keyboard-controls.js';
import { isDesktopRuntime } from '@/services/desktop/runtime.js';
// #ifdef H5
import {
  saveDesktopLearningFile,
  readDesktopLearningBackup,
  chooseDesktopMaterialFile,
  readDesktopMaterialFile,
  discardDesktopMaterialFile
} from '@/services/desktop/learning-files.js';
import { chooseBrowserLearningBackup } from '@/services/learning/record-files.js';
// #endif
import { learningWriteProtectionSupported } from '@/services/learning/learning-write-lease.js';
import { HISTORY_LIMITS } from '../../../laf-backend/functions/_shared/learning-history.js';
import { ref, shallowRef, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { DEV_TEST } from '@/config/build-channel.js';
import { onShow, onHide, onLoad, onBackPress } from '@dcloudio/uni-app';
import LearningShell from '@/components/business/learning/learning-shell.vue';
import WritingCoach from '@/pages/learning/components/writing-coach.vue';
import {
  studentEssaySources,
  openStudentArtifact,
  createLearningArtifacts
} from '@/services/learning/learning-artifacts.js';
import MuseComposer from '@/components/business/learning/muse-composer.vue';
import MusePresentationControl from '@/components/business/learning/muse-presentation-control.vue';
import { useLearningPresentation } from '@/composables/useLearningPresentation.js';
import { SINGLE_QUESTION_CONTRACT } from '../../../laf-backend/functions/_shared/learning-intake.js';
import { toast } from '@/utils/toast.js';
import { groupLearningMessages } from '@/services/learning/message-groups.js';
import CustomModal from '@/components/common/CustomModal.vue';
import { createLearningDialog } from '@/services/learning/learning-dialog.js';
// #ifdef MP-WEIXIN
import PrivacyPopup from '@/components/common/privacy-popup.vue';
// #endif
import { learningRhythms, currentRhythm } from '@/services/learning/learning-rhythm.js';
import LearningOverview from '@/components/business/learning/learning-overview.vue';
import LearningJourney from '@/pages/learning/components/learning-journey.vue';
import { learningLeaveOperation } from './learning-adherence-view.js';
import LearningMessage from '@/pages/learning/components/learning-message.vue';
import { dayKey } from '@/services/learning/learning-domain.js';
import LearningProfileDraft from '@/components/business/learning/learning-profile-draft.vue';
import LearningInsights from '@/components/business/learning/learning-insights.vue';
import LearningProposalCard from '@/components/business/learning/learning-proposal-card.vue';
import { proposalStatus } from '../../../laf-backend/functions/_shared/learning-proposals.js';
import LearningLab from './components/learning-lab.vue';
import DensityPractice from '@/components/business/learning/density-practice.vue';
import {
  DENSITY_TRANSFER_CONTRACT,
  PRESSURE_TRANSFER_CONTRACT
} from '../../../laf-backend/functions/_shared/learning-science.js';
import SentenceBuilder from '@/components/business/learning/sentence-builder.vue';
import { SENTENCE_CONTRACT } from '../../../laf-backend/functions/_shared/learning-sentence.js';
import OatutorPractice from '@/components/business/learning/oatutor-practice.vue';
import NumberLine from '@/components/business/learning/number-line.vue';
import VelocityTimeGraph from '@/components/business/learning/velocity-time-graph.vue';
import RubricEvidence from '@/components/business/learning/rubric-evidence.vue';
import MaterialLayout from '@/components/business/learning/material-layout.vue';
import { structureMaterialCandidate } from '@/services/learning/material-intake.js';
import { quizOriginalReading } from '../../../laf-backend/functions/_shared/learning-quiz-original.js';
import {
  MATERIAL_LAYOUT_CONTRACT,
  materialObjectiveFields,
  createMaterialObjectiveQuestion,
  questionKey
} from '@/services/learning/learning-domain.js';
import { learningClientPlatform } from '@/services/learning/local-connector.js';
import { chooseWeixinMaterialFile, readWeixinMaterialFile } from '@/services/learning/material-connector.js';
import {
  chooseAppMaterialFile,
  readAppMaterialFile,
  releaseAppMaterialFile
} from '@/services/learning/app-material.js';
import { useConversationLearningStore, learningId } from '@/stores/modules/conversation-learning.js';
import { hasChatMathTopic } from '@/services/learning/learning-chat.js';
import {
  writingGenre,
  writingGenreInfo,
  writingAnswerLimit
} from '../../../laf-backend/functions/_shared/learning-writing.js';
import { useThemeStore } from '@/stores/modules/theme.js';
import { getUserId, getToken } from '@/services/auth-storage.js';
import { storageService } from '@/services/storageService.js';
import { safeNavigateTo } from '@/utils/safe-navigate.js';
const learning = useConversationLearningStore();
const presentation = useLearningPresentation(() => learning.recordContext());
const essayArtifacts = computed(() => studentEssaySources(learning.state));
const essayForAttempt = (id) =>
  essayArtifacts.value.find((item) => item.source.kind === 'writing-attempt' && item.source.sourceId === id);
const modelFailure = ref(null);

const latestAnswer = computed(
  () =>
    learning.state.attempts
      .filter((a) => a.conversationId === learning.active?.id && a.questionKey === learning.active?.activeQuestionKey)
      .at(-1) || null
);
const answerMascot = computed(() => answerFeedback(latestAnswer.value));
const answerOptions = computed(() =>
  choiceOptions.value.map((option) => ({
    ...option,
    key: option.value,
    label: option.label.replace(/^[A-H][.、．]\s*/i, ''),
    state: answerOptionState(latestAnswer.value, option.value)
  }))
);
function updateChoiceDraft(value) {
  if (learning.busy || learning.active?.stopped) return;
  if (multipleChoices.value) {
    draft.value = value.slice().sort().join('、');
    choiceDraft.value = draft.value;
  } else chooseAnswer(value);
}
const connectionTone = computed(() => {
  if (learning.selectedMode === 'local')
    return learning.localConnection?.status === 'model_verified' ? 'mint' : 'apricot';
  if (learning.selectedMode === 'cloud') {
    const status = learning.models.find((m) => m.id === learning.modelId)?.connectionStatus;
    if (learning.modelListState.phase === 'error' || status === 'failed') return 'coral';
    return status === 'connected' ? 'mint' : 'apricot';
  }
  return 'neutral';
});
const quizOriginalView = computed(() => quizOriginalReading(learning.activeQuestion));
const theme = useThemeStore();
const labVisible = ref(true);
const labContext = computed(() => learning.writingContext());
const activeWritingGenre = computed(() => writingGenreInfo(writingGenre(learning.activeQuestion)));
function openLabQuestion(key, conversationId) {
  return run(() => learning.focus(key, conversationId));
}
function startIndependentWriting(context, genreId) {
  return run(() => {
    learning.startWriting(context, genreId);
    draft.value = '';
    nextTick(() => uni.pageScrollTo({ selector: '#active-learning-question', duration: 0 }));
  });
}
function startIndependentScience(context, input) {
  return run(() => {
    learning.startScience(context, input);
    draft.value = '';
    nextTick(() => uni.pageScrollTo({ selector: '#active-learning-question', duration: 0 }));
  });
}
function recordWritingPracticeHelp(context, content, genreId) {
  try {
    return learning.recordWritingHelp(context, content, genreId) !== false;
  } catch (e) {
    feedback.value = publicError(e);
    return false;
  }
}
function readWritingPracticeReference(context, id, version) {
  try {
    return learning.readWritingReference(context, id, version);
  } catch (e) {
    feedback.value = publicError(e);
    return null;
  }
}
function openWritingVocabulary(context, word) {
  try {
    return learning.openVocabulary(context, word);
  } catch (e) {
    feedback.value = publicError(e);
    return null;
  }
}
function submitWritingVocabulary(context, key, answer) {
  try {
    return learning.submitVocabulary(context, key, answer);
  } catch (e) {
    feedback.value = publicError(e);
    return null;
  }
}
function startWritingVocabularyTask(context, key, phase, delayDays = 1) {
  try {
    const result = learning.startVocabularyTask(context, key, phase, delayDays);
    if (phase === 'usage') {
      draft.value = '';
      nextTick(() => uni.pageScrollTo({ selector: '#active-learning-question', duration: 0 }));
    }
    return result;
  } catch (e) {
    feedback.value = publicError(e);
    return null;
  }
}
function recordDiagramPracticeHelp(context, input) {
  try {
    learning.recordDiagramHelp(context, input);
    return true;
  } catch (e) {
    feedback.value = publicError(e);
    return false;
  }
}
function recordSciencePracticeHelp(context, input) {
  try {
    return learning.recordScienceHelp(context, input);
  } catch (e) {
    feedback.value = publicError(e);
    return false;
  }
}
function planWritingRetest() {
  return run(() => learning.scheduleWritingRetest());
}
const iconColor = computed(() => 'var(--ink-3)');
const desktopHost = isDesktopRuntime();
const clientPlatform = learningClientPlatform();
const selectedAppFile = ref(null),
  selectedAppFileOwner = ref(null),
  appFileBusy = ref(false);
let appFileController = null,
  appFileContext = null,
  appFileStage = null,
  appPageAlive = true,
  appPageVisible = true;
let appReadContext = null;
let clientFileSequence = 0,
  clientFileContext = null,
  clientFileReader = null,
  clientFilePicker = null;
const clientFilePhase = ref('');
function releaseClientFilePicker() {
  const picker = clientFilePicker;
  clientFilePicker = null;
  picker?.remove();
}
function discardClientFile() {
  clientFileSequence++;
  clientFileContext = null;
  const reader = clientFileReader;
  clientFileReader = null;
  clientFilePhase.value = '';
  releaseClientFilePicker();
  reader?.abort();
}
function cancelClientFile() {
  if (clientFilePhase.value === 'confirm') dialogs.dismiss();
  discardClientFile();
}
function beginClientFile() {
  discardClientFile();
  const sequence = clientFileSequence,
    context = learning.prepareMaterialAction();
  clientFileContext = context;
  clientFilePhase.value = 'choose';
  return {
    context,
    current: () =>
      appPageAlive &&
      appPageVisible &&
      sequence === clientFileSequence &&
      clientFileContext === context &&
      learning.materialContext() === context,
    finish: () => {
      if (sequence === clientFileSequence) {
        clientFileContext = null;
        clientFileReader = null;
        clientFilePhase.value = '';
        releaseClientFilePicker();
      }
    }
  };
}
watch(
  [() => learning.state, () => learning.materialContext()],
  () => {
    if (clientFileContext && learning.materialContext() !== clientFileContext) discardClientFile();
    if (appReadContext && learning.materialContext() !== appReadContext) appFileController?.abort();
  },
  { flush: 'sync' }
);
function discardAppFile() {
  const file = selectedAppFile.value;
  selectedAppFile.value = null;
  selectedAppFileOwner.value = null;
  releaseAppMaterialFile(file);
}
function cancelAppFile() {
  appFileController?.abort();
  if (appFileStage === 'import') learning.cancelMaterial();
  discardAppFile();
}
watch(
  () => learning.state,
  () => {
    if (
      (selectedAppFileOwner.value && selectedAppFileOwner.value !== learning.recordContext()) ||
      (appFileContext && appFileContext !== learning.recordContext())
    ) {
      appFileController?.abort();
      discardAppFile();
    }
  }
);
const messageStart = ref(0);
const cancellationNotice = computed(() => cancelledNotice(learning.error));
const presentedTimeline = computed(() => {
  const chapters = learning.timeline.map((chapter) => {
    const users = new Set(chapter.messages.filter((message) => message.role === 'user').map((message) => message.id));
    const replies = new Map(
      chapter.messages
        .filter((message) => message.role === 'assistant' && message.id.endsWith(':reply'))
        .map((message) => [message.id.slice(0, -6) + ':message', message])
    );
    return {
      ...chapter,
      messages: chapter.messages.flatMap((message) => {
        if (
          message.role === 'assistant' &&
          message.id.endsWith(':reply') &&
          users.has(message.id.slice(0, -6) + ':message')
        )
          return [];
        return replies.has(message.id) ? [message, replies.get(message.id)] : [message];
      })
    };
  });
  const reply = learning.reply;
  if (reply?.kind !== 'chat' || reply.conversationId !== learning.active?.id || !visibleReply(reply)) return chapters;
  const savedChapter = chapters.find((chapter) => chapter.messages.some((message) => message.id === reply.id));
  if (savedChapter) {
    const index = savedChapter.messages.findIndex((message) => message.id === reply.id);
    const [saved] = savedChapter.messages.splice(index, 1);
    const userIndex = savedChapter.messages.findIndex((message) => message.id === `${reply.requestId}:message`);
    // Tool proposals are saved before the reply. Keep their presentation below
    // the growing reply so completion never moves that message down the page.
    savedChapter.messages.splice(userIndex < 0 ? index : userIndex + 1, 0, saved);
    return chapters;
  }
  const day = dayKey(reply.at, learning.active?.journey?.timezone || learning.state.timezone);
  let chapter = chapters.find((chapter) => chapter.day === day);
  if (!chapter) {
    chapter = { day, messages: [], groups: [] };
    chapters.push(chapter);
  }
  chapter.messages.push({ ...reply, role: 'assistant', index: learning.active?.messages.length || 0 });
  return chapters;
});
const visibleChapters = computed(() =>
  presentedTimeline.value
    .map((chapter) => ({
      ...chapter,
      messages: groupLearningMessages(
        chapter.messages.filter(
          (message) =>
            message.id === learning.reply?.id ||
            (message.index >= messageStart.value && message.index < messageStart.value + 50)
        ),
        learning.active?.journey?.timezone || learning.state.timezone
      )
    }))
    .filter(
      (chapter) =>
        chapter.messages.length ||
        chapter.day === learning.conversationLocation?.day ||
        chapter.day === learning.timeline.at(-1)?.day
    )
);
watch(
  () => learning.conversationLocation,
  async (location) => {
    if (!location || location.conversationId !== learning.active?.id) return;
    if (location.messageId) {
      const index = learning.active.messages.findIndex((m) => m.id === location.messageId);
      if (index >= 0) messageStart.value = Math.max(0, index - 10);
    } else if (!location.day) messageStart.value = Math.max(0, learning.active.messages.length - 50);
    await nextTick();
    if (learning.conversationLocation !== location) return;
    const id = location.messageId
      ? location.messageId
      : location.groupId
        ? 'learning-journey-workspace'
        : location.day
          ? `learning-day-${location.day}`
          : learning.active?.stopped
            ? 'learning-stop-state'
            : 'learning-composer';
    revealLearningTarget(id, () => learning.conversationLocation === location);
  },
  { immediate: true }
);
watch(
  () => learning.locatedRecord,
  async (record) => {
    if (!record?.questionKey) return;
    await nextTick();
    revealLearningTarget(
      record.attemptId ? 'learning-record-original' : 'active-learning-question',
      () => learning.locatedRecord?.id === record.id
    );
  }
);
function revealLearningTarget(id, isCurrent = () => true) {
  if (!isCurrent()) return;
  const selector = id.startsWith('.') ? id : `#${id}`;
  // #ifdef H5
  const target = id.startsWith('.') ? document.querySelector(selector) : document.getElementById(id);
  target?.scrollIntoView?.({ block: 'start', behavior: 'auto' });
  target?.focus?.({ preventScroll: true });
  // #endif
  // #ifndef H5
  const query = uni.createSelectorQuery();
  query.select(selector).boundingClientRect();
  query.selectViewport().scrollOffset();
  query.exec(([rect, viewport]) => {
    if (rect && isCurrent())
      uni.pageScrollTo({ scrollTop: Math.max(0, rect.top + (viewport?.scrollTop || 0)), duration: 0 });
  });
  // #endif
}
watch(
  () => learning.error,
  async (error) => {
    if (!error || cancelledNotice(error)) return;
    const conversationId = learning.active?.id;
    const isCurrent = () =>
      labVisible.value &&
      learning.error === error &&
      learning.active?.id === conversationId &&
      !(learning.active?.stopped && error === '请求已取消，费用状态请查看模型用量');
    if (!isCurrent()) return;
    await nextTick();
    revealLearningTarget('learning-request-error', isCurrent);
  }
);
function locateQuestionMessages() {
  const messages = learning.active?.messages || [];
  const last = messages.map((m) => m.questionKey).lastIndexOf(learning.active?.activeQuestionKey);
  messageStart.value = Math.max(0, (last < 0 ? messages.length : last + 1) - 50);
}
watch(
  [() => learning.selectedConversationId, () => learning.active?.activeQuestionKey],
  () => {
    if (!learning.conversationLocation?.day) locateQuestionMessages();
  },
  { immediate: true }
);
watch(
  () => learning.active?.messages.length || 0,
  (length, before) => {
    if (!learning.conversationLocation?.day && messageStart.value + 50 >= before && documentFollowingLatest())
      messageStart.value = Math.max(0, length - 50);
  }
);
const learningRoot = ref(null);
let unbindKeyboard = () => undefined;
onMounted(() => {
  unbindKeyboard = bindLearningKeyboard(learningRoot.value);
});
onUnmounted(() => unbindKeyboard());
// Slot updates can run while the old conversation is being removed.
const conversationMessages = computed(() => learning.active?.messages || []);
const userAvatar = computed(() => studentAvatar(learning.state.owner));
const correctionOf = ref(null);
const lastEditableMessage = computed(() =>
  !learning.activeQuestion && !learning.active?.stopped
    ? conversationMessages.value.filter((message) => message.role === 'user' && !message.attemptId).at(-1)
    : null
);
function editLastMessage() {
  if (!lastEditableMessage.value) return;
  if (learning.busy || learning.reply?.pending) learning.cancel();
  correctionOf.value = lastEditableMessage.value.id;
  draft.value = lastEditableMessage.value.content;
}
watch(
  () => learning.selectedConversationId,
  () => {
    correctionOf.value = null;
  }
);
const sentenceAnswersByFeedback = computed(() => {
  const session = learning.active;
  const answers = Object.create(null);
  if (!session) return answers;
  const questions = new Map(learning.state.questions.map((question) => [questionKey(question), question]));
  const attempts = new Map(
    learning.state.attempts
      .filter((attempt) => attempt.conversationId === session.id)
      .map((attempt) => [attempt.id, attempt])
  );
  for (const message of session.messages) {
    const attempt = attempts.get(message.attemptId);
    if (
      message.role !== 'notice' ||
      !attempt ||
      message.id !== `${attempt.id}:feedback` ||
      message.questionKey !== attempt.questionKey ||
      typeof attempt.answer !== 'string'
    )
      continue;
    const exercise = questions.get(attempt.questionKey)?.sentenceExercise;
    if (exercise?.contract === SENTENCE_CONTRACT && exercise.conversationId === session.id)
      answers[message.id] = attempt.answer;
  }
  return answers;
});
const sentenceHintTargetId = ref(null);
const conversationStopped = computed(() => !learning.active || learning.active.stopped);
const journeyPanel = ref(null);
const showJourney = ref(false);
const hasConversationAttempts = computed(() =>
  learning.state.attempts.some((attempt) => attempt.conversationId === learning.active?.id)
);
const chatTopicGoal = computed(() => {
  const messages = learning.active?.messages || [];
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].role === 'user') return messages[index].content;
  }
  return learning.active?.goal || '';
});
const chatTopics = computed(() =>
  /(?:英文|英语|English).*(?:写作|writing)|writing.*(?:English|emails?)/iu.test(chatTopicGoal.value)
    ? ['learning.topic.englishEmail', 'learning.kho']
    : /物理|physics/iu.test(chatTopicGoal.value)
      ? ['learning.chatTopicDensity']
      : hasChatMathTopic(chatTopicGoal.value)
        ? ['learning.chatTopicEquation', 'learning.chatTopicInequality']
        : []
);
const objectiveKind = ref('literal'),
  objectiveFrom = ref(''),
  objectiveTo = ref('');
const objectiveKinds = {
  literal: '字面信息定位',
  difference: '增量计算',
  growth_percent: '增长率计算',
  share_percent: '占比计算'
};
const objectiveFromLabel = computed(() =>
  objectiveKind.value === 'literal' ? '要查的数据' : objectiveKind.value === 'share_percent' ? '部分数据' : '基期数据'
);
const objectiveToLabel = computed(() => (objectiveKind.value === 'share_percent' ? '整体数据' : '现期数据'));
const draft = ref('');
const navigationDrafts = workspaceDrafts(learning);
let navigationDraftBinding;
let activeDraftSends = 0;
function saveNavigationDraft() {
  if (appPageAlive && navigationDraftBinding?.context === learning.recordContext())
    navigationDrafts.save(navigationDraftBinding.context, navigationDraftBinding.key, { draft: draft.value });
}
watch(
  () => [learning.recordContext(), learning.selectedConversationId],
  ([context, id]) => {
    const migrating =
      activeDraftSends > 0 &&
      navigationDraftBinding?.context === context &&
      navigationDraftBinding?.key === 'chat:new' &&
      id;
    const currentDraft = draft.value;
    saveNavigationDraft();
    navigationDraftBinding = { context, key: `chat:${id || 'new'}` };
    const saved = navigationDrafts.read(context, navigationDraftBinding.key);
    draft.value = saved.draft ?? (migrating ? currentDraft : '');
  },
  { immediate: true, flush: 'sync' }
);
watch(draft, saveNavigationDraft, { flush: 'sync' });
const showIntake = ref(false),
  showInsights = ref(false);
const composerHeight = ref(60);
function textInputValue(event) {
  return event?.detail?.value ?? event?.target?.value ?? '';
}
const multipleChoices = ref(false),
  choiceDraft = ref('');
const choiceOptions = computed(() => {
  const q = learning.activeQuestion;
  if (q?.answerType !== 'choice' || !Array.isArray(q.options) || !q.options.length || q.options.length > 8) return [];
  const items = q.options.map((option, index) => {
    if (typeof option !== 'string') return null;
    const prefix = /^([A-H])[.、．]\s*/i.exec(option);
    const value = prefix ? prefix[1].toUpperCase() : String.fromCharCode(65 + index);
    return { value, label: prefix ? option : `${value}. ${option}` };
  });
  return items.every(Boolean) && new Set(items.map((item) => item.value)).size === items.length ? items : [];
});
const selectedChoices = computed(() =>
  /^[A-H](?:[、,\s]*[A-H])*$/i.test(draft.value.trim())
    ? [...new Set(draft.value.toUpperCase().match(/[A-H]/g) || [])]
    : []
);
function chooseAnswer(value) {
  if (learning.busy || learning.active?.stopped || !choiceOptions.value.some((item) => item.value === value)) return;
  const values = selectedChoices.value;
  const next = values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
  draft.value = multipleChoices.value ? next.sort().join('、') : value;
  choiceDraft.value = draft.value;
}
function toggleMultipleChoices() {
  multipleChoices.value = !multipleChoices.value;
  if (!multipleChoices.value && selectedChoices.value.length > 1) {
    draft.value = selectedChoices.value[0];
    choiceDraft.value = draft.value;
  }
}
watch([() => learning.recordContext(), () => learning.active?.id, () => learning.active?.activeQuestionKey], () => {
  if (choiceDraft.value && draft.value === choiceDraft.value) draft.value = '';
  choiceDraft.value = '';
  multipleChoices.value = false;
});
const feedback = ref('');
const dialogState = shallowRef({ id: 0, visible: false });
const dialogs = createLearningDialog({
  getContext: () => (appPageAlive && appPageVisible ? learning.recordContext() : null),
  onChange: (state) => {
    dialogState.value = state;
  },
  onError: (error) => {
    feedback.value = publicError(error);
  }
});
const showLearningDialog = dialogs.show;
function checkGrammar() {
  if (learning.busy || !learning.canCheckGrammar) return;
  const context = learning.computeReferenceContext();
  showLearningDialog({
    title: '检查已提交的英文原答',
    content: '在Yozi AI 服务用基础规则检查。建议可能误报，记为本题帮助，不自动修改或打分。',
    confirmText: '检查',
    success: (result) => {
      if (learning.computeReferenceContext() !== context) return;
      if (result.confirm) run(() => learning.requestGrammarHelp(true));
    }
  });
}
function computeReference() {
  if (learning.busy || !learning.canComputeReference) return;
  const context = learning.computeReferenceContext();
  showLearningDialog({
    title: '计算本题参考',
    content: '使用已同步的题目和原答，在Yozi AI 服务计算。结果记为本题帮助，不改判分。',
    confirmText: '计算并阅读',
    isCurrent: () => !learning.busy && learning.computeReferenceContext() === context,
    success: (result) => {
      if (result.confirm) run(() => learning.requestComputeReference(true));
    }
  });
}
watch(
  () => learning.state,
  () => dialogs.invalidate(),
  { flush: 'sync' }
);
onBackPress(() => {
  if (!dialogState.value.visible) return false;
  dialogs.dismiss();
  return true;
});
const showConnections = ref(false);
const legacyLearningEnabled = import.meta.env.VITE_ENABLE_LEGACY_LEARNING === 'true';
const writingCoachActive = computed(
  () =>
    import.meta.env.VITE_ENABLE_WRITING_COACH !== 'false' &&
    learning.accountRecordState === 'ready' &&
    !showConnections.value &&
    (!learning.active || learning.active.coach)
);
const showMaterial = ref(false);
const showProfile = ref(false);
const showData = ref(false);
const showRestore = ref(false);
const accountRecordMessage = computed(() =>
  learning.accountRecordState === 'remote'
    ? '账号已有学习记录，请在数据面板确认采用云端记录后继续。'
    : learning.accountRecordState === 'error'
      ? learning.syncState.message || '账号学习记录暂不可读，请重试。'
      : '正在读取账号学习记录…'
);
function openAccountData() {
  showConnections.value = true;
  showData.value = true;
}
async function readAccountRecords() {
  await learning.readAccountRecords();
  if (learning.accountRecordState === 'remote') openAccountData();
}
watch(showConnections, (open) => {
  if (!open) {
    showData.value = false;
    showRestore.value = false;
  }
});
const backupText = ref('');
const backupExpanded = ref(false);
const uploadMaintenancePreview = ref(null),
  pendingRemovalPreview = ref(null),
  pendingRemovalAcknowledged = ref(false),
  locatorText = ref(''),
  showLocator = ref(false);
const restorePreview = ref(null);
const guestPreview = ref(null);
const recordPreviewBusy = ref(false);
const recordPreviewStatus = ref({ phase: 'idle', message: '' });
const recordFileBusy = ref(false);
const recordFileStatus = ref({ phase: 'idle', message: '' });
let activeRecordFile = null;
function cancelRecordFile(message = '', phase = 'idle') {
  const request = activeRecordFile;
  activeRecordFile = null;
  request?.controller?.abort();
  recordFileBusy.value = false;
  recordFileStatus.value = { phase, message };
}
const recordActionsBusy = computed(
  () =>
    learning.busy ||
    learning.materialBusy ||
    learning.syncBusy ||
    learning.historyBusy ||
    recordPreviewBusy.value ||
    recordFileBusy.value
);
let recordPreviewSequence = 0;
let activeRecordPreview = null;
function invalidateRecordPreviews(message = '', phase = 'idle') {
  recordPreviewSequence++;
  learning.cancelHistory();
  restorePreview.value = null;
  guestPreview.value = null;
  recordPreviewStatus.value = { phase, message };
  dialogs.invalidate();
}
function cancelRecordPreview() {
  invalidateRecordPreviews('已取消历史校验，当前记录和备份输入保留；请待校验收尾后再重试。', 'cancelled');
}
watch(
  backupText,
  () => {
    if (activeRecordFile) cancelRecordFile('备份输入已变化，已取消旧文件读取；原记录保留。', 'cancelled');
    else cancelRecordFile();
    if (backupText.value.length <= HISTORY_LIMITS.pageCharacters) backupExpanded.value = false;
    if (activeRecordPreview || restorePreview.value || guestPreview.value || recordPreviewStatus.value.message)
      invalidateRecordPreviews('备份内容已变化，请重新校验；当前记录保留。');
  },
  { flush: 'sync' }
);
watch(
  [() => learning.state.owner, () => learning.state.revision, () => learning.recordContext()],
  () => {
    if (activeRecordFile) cancelRecordFile('账户或学习记录已变化，请重新选择备份文件；原记录保留。', 'cancelled');
    else cancelRecordFile();
    if (activeRecordPreview || restorePreview.value || guestPreview.value)
      invalidateRecordPreviews('账户或学习记录已变化，请重新校验；未合并旧预览。');
    else if (recordPreviewStatus.value.message) invalidateRecordPreviews();
  },
  { flush: 'sync' }
);
watch(
  [showData, showRestore],
  ([dataVisible, restoreVisible], [oldDataVisible, oldRestoreVisible]) => {
    if ((!dataVisible && oldDataVisible) || (!restoreVisible && oldRestoreVisible)) {
      cancelRecordFile();
      invalidateRecordPreviews();
    }
  },
  { flush: 'sync' }
);
async function prepareRecordPreview(kind) {
  if (recordActionsBusy.value || !appPageAlive || !appPageVisible) return;
  if (kind === 'restore' && !backupText.value.trim()) return;
  const request = {
    sequence: ++recordPreviewSequence,
    context: learning.recordContext(),
    revision: learning.state.revision,
    content: kind === 'restore' ? backupText.value : null
  };
  const current = () =>
    appPageAlive &&
    appPageVisible &&
    request.sequence === recordPreviewSequence &&
    request.context &&
    learning.recordContext() === request.context &&
    learning.state.revision === request.revision &&
    (kind !== 'restore' || backupText.value === request.content);
  activeRecordPreview = request;
  restorePreview.value = null;
  guestPreview.value = null;
  recordPreviewBusy.value = true;
  recordPreviewStatus.value = {
    phase: 'loading',
    message:
      kind === 'restore'
        ? '正在校验备份，当前记录未修改；可取消。'
        : '正在校验访客记录，当前账户和访客原件未修改；可取消。'
  };
  try {
    const preview = await (kind === 'restore'
      ? learning.previewRestore(request.content)
      : learning.previewGuestMigration());
    if (!current()) return;
    if (kind === 'restore') restorePreview.value = preview;
    else guestPreview.value = preview;
    recordPreviewStatus.value = {
      phase: 'success',
      message: '校验完成，请核对下方新增数量后再确认合并；当前记录未修改。'
    };
  } catch (failure) {
    if (current())
      recordPreviewStatus.value = {
        phase: failure.code === 'CANCELLED' ? 'cancelled' : 'error',
        message: `${publicError(failure, t('ui.invalidBackup'))} 当前记录保留。`
      };
  } finally {
    if (activeRecordPreview === request) {
      activeRecordPreview = null;
      recordPreviewBusy.value = false;
    }
  }
}
const showRubric = ref(false);
function dictationContext() {
  const context = learning.recordContext();
  return context
    ? JSON.stringify([
        context,
        learning.selectedConversationId,
        learning.active?.activeQuestionKey,
        learning.batchTrainingActive
      ])
    : '';
}
const rubricCriteria = ref([]);
const rubricAttempt = computed(
  () =>
    learning.state.attempts
      .filter(
        (a) =>
          a.conversationId === learning.selectedConversationId && a.questionKey === learning.active?.activeQuestionKey
      )
      .at(-1) || null
);
const rubricAssessment = computed(
  () =>
    rubricAttempt.value?.assistance
      ?.filter((a) => ['subjective-rubric-v1', 'subjective-rubric-v2'].includes(a.contract))
      .at(-1) || null
);
watch([() => learning.state.owner, () => learning.active?.activeQuestionKey], () => {
  showRubric.value = false;
  rubricCriteria.value = [];
});
function addRubricCriterion() {
  if (rubricCriteria.value.length < 6)
    rubricCriteria.value.push({ id: learningId('criterion'), name: '', description: '', maxScore: 2 });
}
function editRubric() {
  rubricCriteria.value = (learning.activeQuestion.rubric?.criteria || []).map((c) => ({ ...c }));
  if (!rubricCriteria.value.length) addRubricCriterion();
  showRubric.value = true;
}
function saveRubric() {
  return run(() => {
    learning.setRubric(rubricCriteria.value.map((c) => ({ ...c })));
    showRubric.value = false;
    feedback.value = '评分维度已保存。';
  });
}
const rhythmFeedback = ref('');
const selectedRhythm = computed(() =>
  learning.activeStrategy.source === 'self_report'
    ? currentRhythm(learning.state.profile, learning.selectedConversationId, learning.activeStrategy.method)
    : null
);
const emptyConnectionLabel = computed(() => {
  if (learning.modelListState.phase === 'loading') return t('learning.k15');
  if (learning.modelListState.phase === 'error') return t('learning.modelListUnavailable');
  if (connectionTone.value !== 'mint') return '未连接';
  const model =
    learning.selectedMode === 'local'
      ? learning.localConnection?.model
      : learning.models.find((item) => item.id === learning.modelId)?.model;
  return model ? `已连接 · ${model}` : '已连接';
});
// 未连接时点明状态胶囊通往右上同名入口，不推断登录或网络原因。
const emptyConnectionAction = computed(() =>
  learning.modelListState.phase !== 'loading' && connectionTone.value !== 'mint' ? 'AI 连接器' : ''
);
const byokForm = ref(false);
const visibleModels = computed(() => visibleModelChoices(learning.models, learning.models));
const connectionPresets = computed(() =>
  visibleModelChoices(
    [
      ...MODEL_CONNECTION_PRESETS,
      ...learning.modelPresets.filter((preset) => !MODEL_CONNECTION_PRESETS.some((item) => item.id === preset.id))
    ],
    learning.models
  )
);
const localForm = ref(false);
const profile = ref({
  id: '',
  provider: '',
  model: '',
  endpoint: '',
  apiKey: '',
  structured: false,
  stream: false,
  vision: false
});
const vaultConsent = ref(false);
const localEndpoint = ref('http://127.0.0.1:8766/chat');
const localModel = ref('');
const localToken = ref('');
const materialEndpoint = ref('http://127.0.0.1:8765/parse');
const materialToken = ref('');
const allowMaterialRecognition = ref(false);
const materialRecognitionEngine = ref('tesseract');
const doclingAvailable = computed(() => learning.materialConnection?.capabilities?.docling?.available === true);
watch(allowMaterialRecognition, (allowed) => {
  if (!allowed && materialRecognitionEngine.value === 'apple-vision') materialRecognitionEngine.value = 'tesseract';
});
const appleVisionAvailable = computed(() => learning.materialConnection?.capabilities?.appleVision?.available === true);
const appleReadinessMessage = computed(() => {
  const status = learning.materialConnection?.capabilities?.appleVision?.readiness?.status;
  return status === 'preparing'
    ? 'Apple 识别准备中，请稍后检查连接。'
    : status === 'failed'
      ? 'Apple 识别暂不可用，请检查解析服务。'
      : '';
});
function recognitionLabel(engine, allowRecognition = true) {
  if (engine === 'docling') return allowRecognition ? '整理PDF版面并识别图片文字' : '整理PDF版面，仅提取原有文字';
  if (!allowRecognition) return '仅提取PDF文本';
  return engine === 'apple-vision' ? '由识别服务所在的 Mac 上的 Apple Vision 识别' : '由识别服务使用的 Tesseract 识别';
}
const materialText = ref('');
const materialFeedback = ref(null);
let materialFeedbackSequence = 0;
const materialActionBusy = computed(() =>
  Boolean(learning.materialBusy || learning.materialConnectionBusy || appFileBusy.value || clientFilePhase.value)
);
const materialFileChoiceBusy = computed(() =>
  Boolean(
    learning.materialBusy ||
    learning.materialConnectionBusy ||
    appFileBusy.value ||
    ['choose', 'confirm', 'import'].includes(clientFilePhase.value)
  )
);
const materialImportLabel = computed(() => {
  const outcome = learning.materialImportState;
  if (outcome?.phase === 'partial' && outcome.failedPages > 0 && outcome.extractedSegments === 0)
    return '未识别到正文，请重试。';
  return (
    {
      processing: '正在解析',
      saved: '已保存 · 待校对',
      partial: '部分已保存，请继续或重试。',
      cancelled: '后续处理已取消',
      failed: '解析未完成'
    }[outcome?.phase] || ''
  );
});
const syncOperationProgress = computed(() => {
  const progress = learning.syncProgress;
  if (
    !Number.isSafeInteger(progress?.total) ||
    progress.total <= 0 ||
    !Number.isSafeInteger(progress.completed) ||
    progress.completed < 0 ||
    progress.completed > progress.total
  )
    return null;
  return {
    completed: progress.completed,
    total: progress.total,
    percentage: (progress.completed / progress.total) * 100
  };
});
const materialPageProgress = computed(() => {
  const progress = learning.materialProgress;
  if (
    !Number.isSafeInteger(progress?.total) ||
    progress.total <= 0 ||
    !Number.isSafeInteger(progress.completed) ||
    progress.completed < 0
  )
    return null;
  const completed = Math.min(progress.completed, progress.total);
  return { completed, total: progress.total, percentage: (completed / progress.total) * 100 };
});
watch(
  () => learning.state,
  () => {
    if (materialFeedback.value && materialFeedback.value.context !== learning.recordContext()) {
      materialFeedbackSequence++;
      materialFeedback.value = null;
    }
  },
  { flush: 'sync' }
);
const selectedMaterial = ref(null);
const selectedSegment = ref(null);
const privateCandidate = ref(null);
const currentEditorMaterial = computed(() =>
  learning.state.materials.find((material) => material.id === selectedMaterial.value?.id)
);
const materialEditorSourceChanged = computed(() => {
  if (!selectedSegment.value) return false;
  const current = currentEditorMaterial.value?.segments.find((segment) => segment.id === selectedSegment.value.id);
  const source = (segment, material) =>
    JSON.stringify([
      segment?.content,
      segment?.extractionVersion || material?.extractionVersion,
      segment?.extractionEventId,
      segment?.role,
      segment?.reviewRequired,
      segment?.status,
      segment?.uncertainties
    ]);
  return source(current, currentEditorMaterial.value) !== source(selectedSegment.value, selectedMaterial.value);
});
const objectiveFields = computed(() => {
  if (materialEditorSourceChanged.value) return { fields: [], error: '资料已重新提取，请重新选择本页后再练习。' };
  try {
    return { fields: materialObjectiveFields(selectedSegment.value), error: '' };
  } catch (error) {
    return { fields: [], error: publicError(error) };
  }
});
function objectiveInput() {
  return {
    segmentId: selectedSegment.value?.id,
    kind: objectiveKind.value,
    from: objectiveFrom.value.trim(),
    to: objectiveTo.value.trim()
  };
}
const objectiveUnavailable = computed(() => {
  if (learning.busy) return '请先结束当前操作。';
  if (learning.active?.stopped) return '请先明确继续学习任务，再开始资料练习。';
  if (objectiveFields.value.error) return objectiveFields.value.error;
  if (!objectiveFrom.value.trim()) return '请选择资料中的一项数据。';
  if (objectiveKind.value !== 'literal' && !objectiveTo.value.trim())
    return '请选择资料中不同的' + objectiveToLabel.value + '。';
  try {
    createMaterialObjectiveQuestion('material-preview', currentEditorMaterial.value, objectiveInput());
    return '';
  } catch (error) {
    return publicError(error);
  }
});
function clearMaterialEditor() {
  selectedMaterial.value = null;
  selectedSegment.value = null;
  privateCandidate.value = null;
  privatePrompt.value = '';
  privateAnswer.value = '';
  importedUserAnswer.value = '';
  teacherAnnotation.value = '';
  privateConditionsConfirmed.value = false;
}
watch(
  () => selectedMaterial.value && !learning.state.materials.some((m) => m.id === selectedMaterial.value.id),
  (missing) => {
    if (missing) clearMaterialEditor();
  }
);
const teacherAnnotation = ref('');
const privateConditionsConfirmed = ref(false);
const privatePrompt = ref('');
const privateAnswer = ref('');
const importedUserAnswer = ref('');
const foundation = ref('');
const timezone = ref(learning.state.timezone);
const planLines = ref('');
const foundationOptions = ['从基础开始', '有些基础', '挑战进阶'];
const customFoundation = ref(false),
  customTimezone = ref(false),
  showPlanText = ref(false);
const showMaterialSettings = ref(false),
  showImportTools = ref(false);
const timezoneOptions = [
  { label: '北京', value: 'Asia/Shanghai' },
  { label: '洛杉矶', value: 'America/Los_Angeles' },
  { label: '纽约', value: 'America/New_York' },
  { label: '伦敦', value: 'Europe/London' },
  { label: '东京', value: 'Asia/Tokyo' },
  { label: 'UTC', value: 'UTC' }
];
const planOptions = ['理解一个概念', '完成一组练习', '复习错题', '写一段短文'];
function togglePlanTask(title) {
  const tasks = planLines.value.split('\n').filter((line) => line.trim());
  planLines.value = (tasks.includes(title) ? tasks.filter((line) => line !== title) : [...tasks, title]).join('\n');
}
watch(
  () => learning.state.owner,
  () => {
    backupText.value = '';
    uploadMaintenancePreview.value = null;
    pendingRemovalPreview.value = null;
    pendingRemovalAcknowledged.value = false;
    locatorText.value = '';
    showLocator.value = false;
    restorePreview.value = null;
    guestPreview.value = null;
    // The synchronous account/conversation binding above restores only this owner's draft.
    feedback.value = '';
    showJourney.value = false;
    profile.value = {
      id: '',
      provider: '',
      model: '',
      endpoint: '',
      apiKey: '',
      structured: false,
      stream: false,
      vision: false
    };
    localToken.value = '';
    materialToken.value = '';
    materialText.value = '';
    selectedMaterial.value = null;
    selectedSegment.value = null;
    privateCandidate.value = null;
    teacherAnnotation.value = '';
    privatePrompt.value = '';
    privateAnswer.value = '';
    importedUserAnswer.value = '';
    privateConditionsConfirmed.value = false;
    foundation.value = '';
    planLines.value = '';
    customFoundation.value = customTimezone.value = showPlanText.value = false;
    showMaterialSettings.value = showImportTools.value = false;
    vaultConsent.value = false;
    timezone.value = learning.state.timezone;
  }
);
async function chooseRhythm(id) {
  const result = await run(() => learning.setRhythm(id));
  if (result)
    rhythmFeedback.value = id === 'review' && !result.focused ? '已切换复习，暂无待复测题目。' : '已切换学习方式。';
}
onLoad((options) => {
  if (options.panel === 'materials') showMaterial.value = true;
  if (options.panel === 'connections') openAIConnectors();
  if (options.panel === 'legacyConnections') showConnections.value = true;
  if (options.panel === 'profile') showProfile.value = true;
  if (options.panel === 'data') openAccountData();
});
async function run(action) {
  const context = learning.recordContext(),
    previous = learning.reply?.operationId;
  let operation;
  const current = () =>
    context === learning.recordContext() &&
    (!operation || (learning.reply?.operationId === operation && !learning.reply.cancelled));
  feedback.value = '';
  modelFailure.value = null;
  try {
    const pending = action();
    operation = learning.reply?.operationId !== previous ? learning.reply?.operationId : null;
    const result = await pending;
    if (!current()) return result;
    if (result?.success === false) modelFailure.value = result;
    return result;
  } catch (e) {
    if (!current()) return;
    const knownMessage = publicError(e, null);
    if (knownMessage) feedback.value = knownMessage;
    else {
      modelFailure.value = { error: e.code || 'MODEL_FAILED' };
      feedback.value = modelErrorPresentation(modelFailure.value).message;
    }
  }
}
function handleModelAction(action) {
  if (action.type === 'open_connectors' || action.type === 'manual_model') return openAIConnectors();
  if (action.type === 'query_result' && learning.recoverableRequest) return run(() => learning.recoverModelResult());
  if (action.type === 'retry' && learning.recoverableRequest) return run(() => learning.recoverModelResult());
}
async function retryQuestion() {
  const context = learning.recordContext(),
    pending = learning.recoverableRequest;
  const original = learning.active?.messages.find((message) => message.id === pending?.messageId)?.content;
  const result = await run(() => learning.retrySingleQuestion());
  if (appPageAlive && learning.recordContext() === context && result?.success) {
    if (draft.value.trim() === original?.trim()) draft.value = '';
    pendingSubmission = null;
  }
}
async function runMaterial(action, { connectionCheck = false } = {}) {
  const sequence = ++materialFeedbackSequence;
  const context = learning.recordContext();
  materialFeedback.value = null;
  const notify = (message, kind = 'success') => {
    if (appPageAlive && appPageVisible && sequence === materialFeedbackSequence && learning.recordContext() === context)
      materialFeedback.value = { message, kind, context };
  };
  try {
    return await action(notify);
  } catch (failure) {
    const message =
      failure instanceof TypeError
        ? '暂时无法连接资料识别服务。请检查地址、访问令牌和服务是否运行，再重新检查连接；也可先粘贴文字。'
        : failure.code === 'CONNECTION_FAILED'
          ? connectionCheck
            ? '资料识别服务连接检查未通过，尚未发送资料。请核对地址、访问令牌和服务是否运行，再重新检查连接；也可先粘贴文字。'
            : '资料连接请求未完成。请核对地址、访问令牌和服务是否运行。导入结果未确认，请保留原件；若有导入待办，先核对，避免重复上传。'
          : failure.code === 'TIMEOUT'
            ? '资料连接请求超时，尚未确认完成。可重新检查连接；先核对已保存内容或导入待办，避免重复上传。'
            : publicError(failure) || '资料操作未完成，请保留原件后重试。';
    notify(message, failure.code === 'CANCELLED' ? 'info' : 'error');
  }
}
function newConversation() {
  learning.selectedConversationId = null;
  showIntake.value = false;
  showJourney.value = false;
}
function beginGeneralQuestion(input) {
  if (learning.accountRecordState !== 'ready') return;
  if (input?.questionOnly === true && typeof input.input === 'string') {
    const text = input.input.trim(),
      context = learning.recordContext(),
      selectedModel = learning.modelId;
    if (!text) return;
    try {
      const conversation = learning.startSingleQuestion(text);
      showIntake.value = false;
      draft.value = text;
      void nextTick().then(async () => {
        try {
          if (
            appPageAlive &&
            learning.recordContext() === context &&
            learning.selectedConversationId === conversation.id &&
            learning.modelId === selectedModel &&
            learning.selectedMode === 'cloud' &&
            learning.sharingAllowed &&
            draft.value === text
          )
            await send();
        } catch (failure) {
          if (appPageAlive) toast.error(publicError(failure));
        }
      });
    } catch (failure) {
      toast.error(publicError(failure));
    }
    return;
  }
  const acceptedId = typeof input === 'object' ? input?.conversationId : null;
  if (acceptedId) {
    learning.selectedConversationId = acceptedId;
    learning.selectedMode = 'cloud';
    draft.value = '开始学习';
    return;
  }
  const text = String(input || '').trim();
  if (!text) return;
  if (DEV_TEST) {
    learning.startCoach(text);
    learning.selectedMode = 'cloud';
    return;
  }
  learning.start(text);
  showIntake.value = true;
  learning.selectedMode = 'cloud';
  draft.value = text;
  const id = learning.active.id;
  if (getToken())
    void learning
      .loadModels()
      .then((result) => {
        if (result.success && learning.active?.id === id && !learning.modelId)
          learning.modelId = learning.models.find((m) => m.source === 'platform' && m.configured)?.id || null;
      })
      .catch(() => undefined);
}

let pendingSubmission = null;
function submissionKey() {
  return JSON.stringify([
    learning.recordContext(),
    learning.selectedConversationId,
    learning.active?.activeQuestionKey,
    learning.selectedMode,
    learning.modelId
  ]);
}
function prepareSubmission(kind, input) {
  const key = submissionKey();
  if (pendingSubmission?.kind === kind && pendingSubmission.input === input && pendingSubmission.key === key)
    return pendingSubmission;
  return (pendingSubmission = {
    kind,
    input,
    key,
    id: learningId(kind === 'send' ? 'turn' : 'answer'),
    recordContext: learning.recordContext(),
    conversationId: learning.selectedConversationId
  });
}
function finishSubmission(ticket) {
  if (!appPageAlive) return false;
  const conversationId =
    ticket.kind === 'send'
      ? learning.state.events.find((event) => event.id === `${ticket.id}:message`)?.data?.conversationId ||
        ticket.conversationId
      : ticket.conversationId;
  if (learning.recordContext() !== ticket.recordContext || learning.selectedConversationId !== conversationId)
    return false;
  if (feedback.value || (ticket.kind === 'send' && learning.error)) ticket.key = submissionKey();
  else if (pendingSubmission === ticket) pendingSubmission = null;
  return true;
}
async function send() {
  const input = draft.value.trim();
  const display = presentation.command(input, { answering: Boolean(learning.activeQuestion) });
  if (display) {
    if (display.success && draft.value.trim() === input) draft.value = '';
    toast.info(t(display.success ? 'presentation.saved' : 'presentation.failed'));
    return;
  }
  if (!input || learning.active?.stopped) return;
  const ticket = prepareSubmission('send', input);
  const previousQuestion = learning.active?.activeQuestionKey;
  let result;
  activeDraftSends++;
  try {
    result = await run(() =>
      learning.send(input, {
        id: ticket.id,
        ...(correctionOf.value ? { correctionOf: correctionOf.value } : {}),
        chatEntry: true,
        discussionOnly: learning.batchTrainingActive,
        answering: Boolean(learning.activeQuestion) && !learning.batchTrainingActive
      })
    );
  } finally {
    activeDraftSends--;
  }
  if (!finishSubmission(ticket)) return;
  if (learning.active?.messages.some((message) => message.id === `${ticket.id}:message`)) correctionOf.value = null;
  if (!ticket.conversationId && learning.active && !feedback.value && !learning.error && !result?.clarification)
    navigationDrafts.remove(ticket.recordContext, 'chat:new');
  if (
    !feedback.value &&
    !learning.error &&
    learning.active &&
    learning.active.entryContract !== SINGLE_QUESTION_CONTRACT &&
    !learning.state.profile.some((entry) => entry.scope === learning.active.goal && entry.source === 'self_report')
  )
    showIntake.value = true;
  // A clarification keeps the draft for explicit submission; failed writes and newer typing stay available.
  if (!feedback.value && !learning.error && !result?.clarification && draft.value.trim() === input) draft.value = '';
  await nextTick();
  if (
    !feedback.value &&
    !learning.error &&
    (learning.active?.stopped || learning.reply?.requestId !== ticket.id) &&
    documentFollowingLatest()
  )
    revealLearningTarget(
      learning.active?.stopped
        ? 'learning-stop-state'
        : learning.active?.activeQuestionKey && previousQuestion !== learning.active.activeQuestionKey
          ? 'active-learning-question'
          : 'learning-chat-latest'
    );
}
function documentFollowingLatest() {
  // #ifdef H5
  const element = learningRoot.value?.$el || learningRoot.value;
  return element?.closest?.('.space-content')?.dataset.followLatest !== 'false';
  // #endif
  // #ifndef H5
  return false;
  // #endif
}
function dismissOverlay() {
  for (const open of [showConnections, showMaterial]) {
    if (open.value) {
      open.value = false;
      return true;
    }
  }
  return false;
}
async function sendDirective(action) {
  const conversationId = learning.selectedConversationId;
  const originalQuestionKey = learning.active?.activeQuestionKey;
  const commands = {
    继续当前任务: 'resume',
    停止当前任务: 'stop',
    读参考信件: 'read_reference',
    提示: 'hint_only',
    直接讲解: 'explain',
    独立检验原题: 'independent_check',
    开始先修诊断: 'prerequisite'
  };
  const result = await run(() => learning.dispatchLearningAction({ type: commands[action] }));
  await nextTick();
  if (learning.selectedConversationId !== conversationId) return result;
  // 提示与讲解交付到真实气泡后再定位；只回执切换或已换题时不抢焦点。
  const helpMessageId =
    ['提示', '直接讲解'].includes(action) &&
    !learning.error &&
    learning.active?.activeQuestionKey === originalQuestionKey &&
    conversationMessages.value.some((message) => message.id === result?.messageId)
      ? result.messageId
      : null;
  if (helpMessageId) {
    sentenceHintTargetId.value = helpMessageId;
    messageStart.value = Math.max(0, conversationMessages.value.length - 50);
    await nextTick();
    revealLearningTarget(
      '.sentence-hint-target',
      () =>
        learning.selectedConversationId === conversationId && learning.active?.activeQuestionKey === originalQuestionKey
    );
  } else if (action === '读参考信件' && !learning.error)
    revealLearningTarget('learning-chat-latest', () => learning.selectedConversationId === conversationId);
  if (action === '停止当前任务' && learning.active?.stopped)
    revealLearningTarget('learning-stop-state', () => learning.selectedConversationId === conversationId);
  if (action === '继续当前任务' && learning.active && !learning.active.stopped) {
    if (learning.batchTrainingActive) journeyPanel.value?.revealCurrent();
    else if (learning.activeQuestion) revealLearningTarget('active-learning-question');
    else journeyPanel.value?.reveal();
  }
  return result;
}
async function submitExplicit() {
  const input = draft.value;
  const ticket = prepareSubmission('submit', input);
  const result = await run(() => learning.submit(input, true, ticket.id, { chatEntry: true }));
  if (finishSubmission(ticket) && !feedback.value && draft.value === input) draft.value = '';
  return result;
}
function setMode(mode) {
  learning.cancel();
  learning.selectedMode = mode;
  learning.streamEnabled = false;
  learning.sharingAllowed = false;
}
function selectModel(id) {
  if (learning.busy || learning.intakeBusy) return;
  return run(() => learning.selectModel(id));
}
function interpretImage() {
  const owner = learning.state.owner,
    conversationId = learning.active?.id,
    questionId = learning.activeQuestion?.id,
    modelId = learning.modelId;
  const model = learning.models.find((m) => m.id === modelId);
  if (
    learning.selectedMode !== 'cloud' ||
    model?.source !== 'byok' ||
    !model.capabilities?.vision ||
    !model.visionAdapter ||
    learning.streamEnabled ||
    !learning.sharingAllowed
  ) {
    feedback.value = '请选择声明支持图片的自带API、非流式模式，并允许当前上下文共享；不会自动切换模型或上传资料。';
    return;
  }
  showLearningDialog({
    title: '确认本次页图发送',
    content: `将当前题目原页图（整页，可能包含旁边的作答与批注）及当前上下文经本Yozi AI 服务发送至 ${model.provider} / ${model.model}。上游费用由你的API账户承担，图像成本待对账，不扣平台额度。识别内容待校对，不能直接记错题。`,
    confirmText: '发送这一页',
    success: (result) => {
      if (!result.confirm) return;
      run(() => {
        if (
          learning.state.owner !== owner ||
          learning.active?.id !== conversationId ||
          learning.activeQuestion?.id !== questionId ||
          learning.modelId !== modelId
        )
          throw new Error('账户、题目或模型已变化，未发送旧页图');
        return learning.interpretQuestionImage(true);
      });
    }
  });
}
async function loadModels() {
  await readModelResource(() => learning.loadModels());
}
function loginForModels() {
  storageService.save('redirect_after_login', '/pages/learning/index?panel=connections');
  safeNavigateTo('/pages/login/index');
}
async function readModelResource(action) {
  const context = learning.recordContext();
  try {
    await action();
  } catch (failure) {
    if (
      appPageAlive &&
      appPageVisible &&
      learning.recordContext() === context &&
      failure.code !== 'CANCELLED' &&
      failure.code !== 'CONTEXT_CHANGED'
    )
      feedback.value = publicError(failure);
  }
}
function connectionStatusLabel(status) {
  return (
    {
      unconfigured: '未连接',
      untested: '尚未确认可用',
      connected: '最近调用成功',
      failed: '最近调用失败',
      stale: '连接需重新验证'
    }[status] || '连接未知'
  );
}
function openAIConnectors() {
  if (legacyLearningEnabled) {
    showConnections.value = !showConnections.value;
    return;
  }
  safeNavigateTo(learning.openModelConnector().route);
}
function usePreset(preset) {
  profile.value = {
    ...profile.value,
    id: preset.id,
    provider: preset.provider,
    model: preset.model,
    endpoint: preset.endpoint,
    structured: preset.structured,
    stream: preset.stream === true,
    vision: false,
    apiKey: ''
  };
  vaultConsent.value = false;
  feedback.value = `${preset.terms} ${preset.privacy}`;
}
async function testModel(id) {
  const result = await run(() => learning.testModel(id));
  if (result) feedback.value = result.success ? '连接正常，用量已记录。' : modelErrorPresentation(result).message;
}
async function loadUsage() {
  await readModelResource(() => learning.loadUsage());
}
async function saveModel() {
  profile.value.endpoint = completeModelEndpoint(profile.value.endpoint);
  const result = await run(() => learning.saveModel({ ...profile.value }, vaultConsent.value));
  profile.value.apiKey = '';
  if (result) feedback.value = result.success ? '连接已保存。' : publicError(result);
}
async function removeModel(id) {
  const result = await run(() => learning.removeModel(id));
  if (result) feedback.value = result.success ? '密钥已删除。' : publicError(result);
}
function connectLocal() {
  return run(async () => {
    const url = new URL(localEndpoint.value);
    learning.localConnection = {
      endpoint: localEndpoint.value,
      model: localModel.value,
      token: localToken.value,
      consent: true,
      allowedOrigins: [url.origin]
    };
    localToken.value = '';
    await learning.checkLocalConnection();
    setMode('local');
    feedback.value = '已连接；允许发送学习内容后即可使用。';
  });
}
function recordHint() {
  const conversationId = learning.selectedConversationId;
  const questionKey = learning.active?.activeQuestionKey;
  showLearningDialog({
    title: t('learning.k8'),
    editable: true,
    placeholderText: t('learning.k58'),
    isCurrent: () =>
      learning.selectedConversationId === conversationId && learning.active?.activeQuestionKey === questionKey,
    success: (res) => {
      if (res.confirm && res.content?.trim())
        run(() =>
          learning.commit(
            'hint.add',
            {
              conversationId,
              content: res.content,
              level: 1
            },
            learningId('hint')
          )
        );
    }
  });
}
function variant() {
  return run(() => learning.generateVariant());
}
function editQuestion() {
  const question = learning.activeQuestion;
  showLearningDialog({
    title: '局部校对题干',
    editable: true,
    content: question.prompt,
    isCurrent: () => learning.activeQuestion === question,
    success: (res) => {
      if (res.confirm && res.content?.trim())
        run(() =>
          learning.correctQuestion(question, { prompt: res.content, uncertainties: [] }, '用户校对关键题干，旧版本保留')
        );
    }
  });
}
function importText() {
  if (materialActionBusy.value || !materialText.value.trim()) return;
  return runMaterial((notify) => {
    learning.importText(materialText.value);
    materialText.value = '';
    notify('资料已保存到本设备。');
  });
}
function connectMaterial() {
  if (materialActionBusy.value) return;
  return runMaterial(
    async (notify) => {
      const url = new URL(materialEndpoint.value);
      const previous = learning.materialConnection;
      const token = materialToken.value || (previous?.endpoint === url.href ? previous.token : '');
      learning.materialConnection = {
        endpoint: url.href,
        token,
        consent: true,
        allowedOrigins: [url.origin]
      };
      materialToken.value = '';
      await learning.checkMaterialConnection();
      notify('连接成功，尚未发送资料。');
    },
    { connectionCheck: true }
  );
}

function previewUploadMaintenance() {
  return run(async () => {
    uploadMaintenancePreview.value = await learning.previewUploadMaintenance(true);
    feedback.value = '维护预览已取得；尚未整理登记或删除原件。';
  });
}
function compactUploadReceipts() {
  const preview = uploadMaintenancePreview.value;
  if (!preview) return;
  showLearningDialog({
    title: '整理已关闭导入登记',
    type: 'warning',
    content: `本次核实整理 ${preview.pending ? preview.plannedCount : preview.closedCount} 项已关闭登记，未确认登记和原件全部保留。先封存旧批次，旧编号不能再次上传；其他客户端需重新检查识别服务。`,
    success: (res) => {
      if (res.confirm)
        run(async () => {
          const result = await learning.compactUploadReceipts(preview, true);
          uploadMaintenancePreview.value = null;
          feedback.value = `已核实整理 ${result.removedCount} 项已关闭登记；未删除原件。`;
        });
    }
  });
}
function locatorContent(preview) {
  return JSON.stringify({ format: 'wenli-upload-locator-v1', owner: preview.owner, entry: preview.entry }, null, 2);
}
function exportPendingLocator(entry) {
  return run(() => {
    pendingRemovalPreview.value = learning.previewPendingRemoval(entry.id);
    pendingRemovalAcknowledged.value = false;
    locatorText.value = locatorContent(pendingRemovalPreview.value);
    showLocator.value = true;
    feedback.value = '已生成本次无正文定位登记；尚未移除待办或核验远端原件。';
  });
}
function downloadPendingLocator() {
  return run(async () => {
    const preview = pendingRemovalPreview.value;
    if (!preview) return;
    const current = learning.previewPendingRemoval(preview.entry.id);
    if (
      current.owner !== preview.owner ||
      current.context !== preview.context ||
      current.fingerprint !== preview.fingerprint
    )
      throw new Error('账户或待办已变化，请重新导出定位');
    const content = locatorContent(current);
    // #ifdef H5
    if (desktopHost) {
      const context = learning.recordContext();
      const result = await saveDesktopLearningFile('locator', content, {
        isCurrent: () => appPageAlive && learning.recordContext() === context
      });
      feedback.value = result.saved ? '定位登记已保存；远端原件未核验。' : '已取消保存，定位待办保留。';
      return;
    }
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' })),
      link = document.createElement('a');
    link.href = url;
    link.download = 'yozi-ai-upload-locator.json';
    link.click();
    URL.revokeObjectURL(url);
    feedback.value = '已生成定位登记下载；请确认在可信位置保存。远端原件未核验。';
    // #endif
    // #ifndef H5
    uni.setClipboardData({ data: content });
    feedback.value = '定位登记已交给剪贴板，请确认另行保存；远端原件未核验。';
    // #endif
  });
}
function forgetPendingUpload() {
  const preview = pendingRemovalPreview.value;
  if (!preview || !pendingRemovalAcknowledged.value) return;
  showLearningDialog({
    title: '仅移除本机定位待办',
    type: 'warning',
    content: `仅移除 ${preview.entry.id} 的本机定位登记。不关闭原导入、不删除或核验识别服务中的原件；迟到正文及原件可能仍由原识别服务保留。请凭已保存定位信息另行处理。`,
    success: (res) => {
      if (res.confirm)
        run(() => {
          learning.forgetPendingUpload(preview, true);
          pendingRemovalPreview.value = null;
          pendingRemovalAcknowledged.value = false;
          feedback.value = '仅本机定位待办已移除；远端原件未核验，未宣称删除。';
        });
    }
  });
}
function restorePendingLocator() {
  const content = locatorText.value,
    context = learning.recordContext();
  showLearningDialog({
    title: '恢复本机定位待办',
    content: '仅恢复当前账户的无正文定位登记，不读取或发送原件。后续核对/恢复须重新授权原识别服务。',
    success: (res) => {
      if (res.confirm)
        run(() => {
          if (learning.recordContext() !== context) throw new Error('账户或记录已变化，请重新确认');
          const result = learning.restorePendingLocator(content, true);
          pendingRemovalPreview.value = null;
          pendingRemovalAcknowledged.value = false;
          feedback.value = result.alreadyPresent
            ? '相同定位待办已存在，未重复保存或查询。'
            : '本机定位待办已恢复；尚未查询或发送原件。';
        });
    }
  });
}

function pendingUploadAction(entry, action) {
  const owner = learning.recordContext(),
    context = learning.materialContext();
  showLearningDialog({
    title: action === 'recover' ? '恢复识别服务已收原件' : action === 'close' ? '取消未确认导入' : '核对未确认原件',
    type: action === 'close' ? 'warning' : 'info',
    content:
      action === 'recover'
        ? '只从原授权存储继续解析，不重新上传。沿本次登记的识别许可；识别内容仍需校对。'
        : action === 'close'
          ? '关闭这次导入，拒绝迟到正文；仅清理本次新建且未被其他登记引用的原件。已有或共享原件保留。'
          : '仅向原授权存储核对这次导入，不读取或重新发送原件正文。',
    success: (res) => {
      if (!res.confirm) return;
      run(async () => {
        if (learning.recordContext() !== owner || learning.materialContext() !== context)
          throw new Error('账户或资料授权已变化，请重新核对；待办保留');
        if (action === 'recover') {
          materialFeedbackSequence++;
          materialFeedback.value = null;
        }
        const result = await (action === 'recover'
          ? learning.recoverUpload(entry.id, true)
          : action === 'close'
            ? learning.closeUpload(entry.id, true)
            : learning.inspectUpload(entry.id, true));
        feedback.value =
          result.state === 'retired'
            ? '该登记批次已封存，旧编号不能重传；原件删除状态未核验，待办仍保留。'
            : result.state === 'linked'
              ? '原件已关联现有资料；已清理重复待办，请继续使用已保存资料。'
              : action === 'recover'
                ? '已从识别服务中的原件恢复私人资料，未重新上传；识别内容仍需校对。'
                : result.state === 'closed'
                  ? result.sharedOriginalRetained
                    ? '登记已关闭；已有或其他登记使用的原件保留。'
                    : '登记已关闭，原件清理状态已确认。'
                  : result.state === 'absent'
                    ? '原存储暂未找到该导入原件；待办保留，可明确取消登记以阻止迟到正文。'
                    : result.state === 'stored'
                      ? '已找到原件，可明确确认恢复；尚未读取原件内容。'
                      : '登记仍在等待或处理，可稍后核对或明确取消。';
      });
    }
  });
}

function selectMaterial(material) {
  selectedMaterial.value = material;
  selectSegment(material.segments[0]);
}
function selectSegment(segment) {
  const material = currentEditorMaterial.value;
  if (!material) return;
  selectedMaterial.value = material;
  segment = material.segments.find((current) => current.id === segment?.id);
  if (!segment) return clearMaterialEditor();
  objectiveFrom.value = '';
  objectiveTo.value = '';
  selectedSegment.value = segment;
  privateCandidate.value = structureMaterialCandidate(segment);
  privatePrompt.value = privateCandidate.value.prompt;
  privateAnswer.value = privateCandidate.value.reference;
  importedUserAnswer.value = privateCandidate.value.userAnswer;
  teacherAnnotation.value = privateCandidate.value.annotation;
  privateConditionsConfirmed.value = false;
}
function retryMaterial(material) {
  return resumeMaterial(material, material.segments.find((segment) => segment.status === 'failed').page);
}
function materialResultMessage(result) {
  const outcome = learning.materialImportState;
  if (outcome?.failedPages > 0 && outcome.extractedSegments === 0)
    return `原件已保留，但本轮未提取到可用正文。请重试未解析页${result.nextPage ? `，剩余从第 ${result.nextPage} 页继续` : ''}；失败页不作为可靠题干或标准答案。`;
  if (result.nextPage)
    return `已保存片段；剩余从第 ${result.nextPage} 页继续，当前动作最多 ${result.pagesPerAction || 20} 页。`;
  if (outcome?.failedPages > 0) return '原件与已提取片段已保存，未解析页请重试；失败页不作为可靠题干或标准答案。';
  return '已保存私人资料和页图，未将识别内容自动作为标准答案。';
}
function resumeMaterial(material, startPage = material.nextPage) {
  return runMaterial(async (notify) => {
    if (appFileBusy.value) throw new Error('请先结束当前文件动作');
    const result = await learning.importFile({
      fileId: material.original?.connectorFileId || material.id,
      materialId: material.id,
      startPage,
      size: 0,
      name: material.name,
      allowRecognition: material.recognitionAllowed === true,
      ...(material.recognitionEngine && material.recognitionEngine !== 'tesseract'
        ? { recognitionEngine: material.recognitionEngine }
        : {}),
      ...(material.original?.storageId ? { storageId: material.original.storageId } : {})
    });
    notify(materialResultMessage(result));
    return result;
  });
}
function deleteMaterial(material) {
  return run(() => {
    const preview = learning.previewMaterialDeletion(material.id);
    showLearningDialog({
      title: '确认资料删除范围',
      type: 'warning',
      content: `清除「${preview.name}」、${preview.questions} 个关联题目版本、${preview.conversations} 个关联对话的全部正文（${preview.messages} 条）和作答（${preview.attempts} 次），同时清理本机恢复、迁移及冲突副本。计划保留任务分母，${preview.tasks} 项任务标为资料已删除。${preview.original ? '将请求原识别服务删除原件与页图；失败会保留待办。' : ''}云端副本需主动同步删除墓碑；其他设备、已导出文件及运维备份另行处理。`,
      success: (res) => {
        if (res.confirm)
          run(async () => {
            const result = await learning.deleteMaterial(preview, true);
            clearMaterialEditor();
            backupText.value = '';
            restorePreview.value = null;
            feedback.value =
              result.original.status === 'pending'
                ? `本机关联记录已清理；识别服务中的原件删除待确认：${result.original.message}`
                : '本机关联记录已清理，原件删除状态已确认。云端删除需主动同步；计划分母保留。';
          });
      }
    });
  });
}
function retryOriginalDeletion(deletion) {
  showLearningDialog({
    title: '重试识别服务中的原件删除',
    type: 'warning',
    content: '仅向导入原件的已授权解析器请求删除该原件与页图；其他学习数据不变。',
    success: (res) => {
      if (res.confirm)
        run(async () => {
          const result = await learning.retryOriginalDeletion(deletion.deletionId, true);
          feedback.value =
            result.status === 'deleted' ? '识别服务已确认原件与页图删除。' : `原件删除待确认：${publicError(result)}`;
        });
    }
  });
}
function chooseMaterialFile() {
  if (clientPlatform === 'app')
    return runMaterial(async (notify) => {
      if (appFileBusy.value) throw new Error('文件动作仍在执行');
      discardAppFile();
      const owner = learning.recordContext(),
        controller = new AbortController();
      appFileController = controller;
      appFileContext = owner;
      appFileBusy.value = true;
      appFileStage = 'choose';
      try {
        const file = await chooseAppMaterialFile({
          signal: controller.signal,
          assertCurrent: () => {
            if (!appPageAlive || learning.recordContext() !== owner)
              throw new Error('账户或页面已变化，所选文件未读取或发送');
          }
        });
        selectedAppFile.value = file;
        selectedAppFileOwner.value = owner;
        notify('已选择文件元信息。请确认当前资料识别服务后解析；尚未读取或发送文件正文。');
      } finally {
        if (appFileController === controller) {
          appFileController = null;
          appFileContext = null;
          appFileBusy.value = false;
          appFileStage = null;
        }
      }
    });
  if (learningClientPlatform() === 'weixin')
    return runMaterial(async (notify) => {
      if (!learning.materialConnection) throw new Error('请先授权资料连接器；文件不会自动上传云端');
      const action = beginClientFile(),
        allowRecognition = allowMaterialRecognition.value,
        recognitionEngine = materialRecognitionEngine.value;
      const assertCurrent = () => {
        if (!action.current()) throw new Error('账户、记录、页面或资料授权已变更，请重新选择；所选资料未发送');
      };
      try {
        const file = await chooseWeixinMaterialFile(assertCurrent);
        assertCurrent();
        clientFilePhase.value = 'confirm';
        const consent = await new Promise((resolve, reject) =>
          showLearningDialog({
            title: '发送至已授权的资料识别服务',
            content: `将「${file.name}」原文件交给已授权目标。${recognitionLabel(recognitionEngine, allowRecognition)}；资料、原件与页图保持私人，关键条件仍需校对。`,
            confirmText: '解析资料',
            cancelText: '取消',
            success: resolve,
            fail: reject
          })
        );
        if (!consent.confirm) return;
        assertCurrent();
        clientFilePhase.value = 'read';
        const input = await readWeixinMaterialFile(file, { consent: true, assertCurrent });
        assertCurrent();
        clientFilePhase.value = 'import';
        const result = await learning.importFile({
          ...input,
          actionContext: action.context,
          allowRecognition,
          ...(allowRecognition || recognitionEngine === 'docling' ? { recognitionEngine } : {})
        });
        notify(materialResultMessage(result));
      } finally {
        action.finish();
      }
    });
  // #ifdef H5
  if (desktopHost)
    return runMaterial(async (notify) => {
      if (!learning.materialConnection) throw new Error('请先授权本地资料连接器；文件不会自动上传云端。');
      const action = beginClientFile(),
        allowRecognition = allowMaterialRecognition.value,
        recognitionEngine = materialRecognitionEngine.value;
      let file;
      try {
        file = await chooseDesktopMaterialFile({ isCurrent: action.current });
        if (!file) return;
        clientFilePhase.value = 'confirm';
        const consent = await new Promise((resolve, reject) =>
          showLearningDialog({
            title: '发送至已授权的本地识别服务',
            content: `原文件只交给已授权资料连接器。当前${recognitionLabel(recognitionEngine, allowRecognition)}；关键条件仍需校对。`,
            confirmText: '解析资料',
            cancelText: '取消',
            isCurrent: action.current,
            success: resolve,
            fail: reject
          })
        );
        if (!consent.confirm || !action.current()) return;
        clientFilePhase.value = 'read';
        const input = await readDesktopMaterialFile(file, { consent: true, isCurrent: action.current });
        if (!action.current()) return;
        clientFilePhase.value = 'import';
        const result = await learning.importFile({
          ...input,
          actionContext: action.context,
          allowRecognition,
          ...(allowRecognition || recognitionEngine === 'docling' ? { recognitionEngine } : {})
        });
        notify(materialResultMessage(result));
      } finally {
        await discardDesktopMaterialFile(file);
        action.finish();
      }
    });
  if (!learning.materialConnection) {
    return runMaterial(() => {
      throw new Error('请先授权本地资料连接器；文件不会自动上传云端。');
    });
  }
  let action;
  try {
    action = beginClientFile();
  } catch (error) {
    return runMaterial(() => {
      throw error;
    });
  }
  materialFeedbackSequence++;
  materialFeedback.value = null;
  const allowRecognition = allowMaterialRecognition.value;
  const recognitionEngine = materialRecognitionEngine.value;
  const stillAuthorized = action.current;
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = '.pdf,.png,.jpg,.jpeg';
  picker.hidden = true;
  let selected = false;
  picker.oncancel = () => action.finish();
  picker.onchange = () => {
    if (selected || !stillAuthorized()) return;
    selected = true;
    const file = picker.files?.[0];
    if (!file) {
      action.finish();
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      runMaterial(() => {
        throw new Error('文件超过 10 MB，请先按区段拆分。');
      });
      action.finish();
      return;
    }
    let confirmed = false;
    clientFilePhase.value = 'confirm';
    showLearningDialog({
      title: '发送至已授权的本地识别服务',
      content: `原文件只交给已授权资料连接器。当前${recognitionLabel(recognitionEngine, allowRecognition)}；关键条件仍需校对。`,
      confirmText: '解析资料',
      cancelText: '取消',
      success: (consent) => {
        if (confirmed || !stillAuthorized()) return;
        confirmed = true;
        if (!consent.confirm) {
          action.finish();
          return;
        }
        const reader = new FileReader();
        clientFileReader = reader;
        clientFilePhase.value = 'read';
        let accepted = false;
        reader.onerror = () => {
          if (!stillAuthorized()) return;
          runMaterial(() => {
            throw new Error('文件读取失败，请重新选择；所选正文未发送。');
          });
          action.finish();
        };
        reader.onload = () =>
          runMaterial(async (notify) => {
            if (accepted || !stillAuthorized()) return;
            accepted = true;
            clientFileReader = null;
            clientFilePhase.value = 'import';
            try {
              const result = await learning.importFile({
                name: file.name,
                size: file.size,
                actionContext: action.context,
                contentBase64: String(reader.result).split(',')[1],
                allowRecognition,
                ...(allowRecognition || recognitionEngine === 'docling' ? { recognitionEngine } : {})
              });
              notify(materialResultMessage(result));
            } finally {
              action.finish();
            }
          });
        reader.readAsDataURL(file);
      },
      fail: () => action.finish()
    });
  };
  clientFilePicker = picker;
  try {
    document.body.appendChild(picker);
    picker.click();
  } catch {
    action.finish();
    return runMaterial(() => {
      throw new Error('文件选择未能打开，请重新选择；所选正文未读取或发送。');
    });
  }
  // #endif
}
function parseSelectedAppFile() {
  return runMaterial(async (notify) => {
    if (appFileBusy.value || !selectedAppFile.value || !appPageVisible) throw new Error('请先选择文件并返回当前页面');
    if (selectedAppFileOwner.value !== learning.recordContext()) {
      discardAppFile();
      throw new Error('所选文件不属于当前账户，请重新选择');
    }
    if (!learning.materialConnection) throw new Error('请先重新授权当前资料识别服务；所选文件尚未读取或发送');
    const file = selectedAppFile.value,
      owner = learning.recordContext(),
      context = learning.prepareMaterialAction(),
      target = new URL(learning.materialConnection.endpoint).origin,
      allowRecognition = allowMaterialRecognition.value,
      recognitionEngine = materialRecognitionEngine.value,
      controller = new AbortController();
    appFileController = controller;
    appFileContext = owner;
    appFileBusy.value = true;
    appFileStage = 'read';
    appReadContext = context;
    const assertCurrent = () => {
      if (
        !appPageAlive ||
        !appPageVisible ||
        controller.signal.aborted ||
        learning.recordContext() !== owner ||
        learning.materialContext() !== context ||
        selectedAppFile.value !== file
      )
        throw new Error('账户、页面、连接或所选文件已变化，未发送资料');
    };
    try {
      const consent = await new Promise((resolve, reject) =>
        showLearningDialog({
          title: '发送所选文件至当前资料识别服务',
          content: `将「${file.name}」（${file.size}字节）交给${target}。${recognitionLabel(recognitionEngine, allowRecognition)}；原件与页图保持私人，关键条件仍需校对。`,
          confirmText: '确认解析',
          cancelText: '取消',
          success: resolve,
          fail: reject
        })
      );
      if (!consent.confirm) return;
      assertCurrent();
      const input = await readAppMaterialFile(file, { consent: true, signal: controller.signal, assertCurrent });
      assertCurrent();
      appFileStage = 'import';
      const result = await learning.importFile({
        ...input,
        actionContext: context,
        allowRecognition,
        ...(allowRecognition || recognitionEngine === 'docling' ? { recognitionEngine } : {})
      });
      notify(materialResultMessage(result));
    } finally {
      if (selectedAppFile.value === file) discardAppFile();
      else releaseAppMaterialFile(file);
      if (appFileController === controller) {
        appFileController = null;
        appFileContext = null;
        appFileBusy.value = false;
        appFileStage = null;
        appReadContext = null;
      }
    }
  });
}
function structurePrivateQuestion() {
  return run(() => {
    if (materialEditorSourceChanged.value) throw new Error('请重新选择本页后再组织练习。');
    if (!learning.active) learning.start('根据私人资料学习');
    learning.structureQuestion(selectedMaterial.value.id, {
      segmentId: selectedSegment.value.id,
      prompt: privatePrompt.value,
      type: privateCandidate.value.options.length ? 'choice' : 'subjective',
      options: privateCandidate.value.options,
      reference: privateAnswer.value,
      userAnswer: importedUserAnswer.value,
      annotation: teacherAnnotation.value,
      uncertainties: privateConditionsConfirmed.value ? [] : privateCandidate.value.uncertainties
    });
    feedback.value = '题目已保存，答案待核对。';
  });
}
function structureObjective() {
  return run(() => {
    if (objectiveUnavailable.value) throw new Error(objectiveUnavailable.value);
    const input = objectiveInput();
    // 先用共享原文校验规则检查字段；失败不会留下空对话，也不会恢复已停止任务。
    createMaterialObjectiveQuestion('material-preview', currentEditorMaterial.value, input);
    if (!learning.active) learning.start('根据私人资料完成可校验练习');
    learning.structureObjective(selectedMaterial.value.id, input);
    showMaterial.value = false;
    feedback.value = '练习已准备好。';
    nextTick(() => uni.pageScrollTo({ selector: '#active-learning-question', duration: 0 }));
  });
}
function confirmProfileDraft(fields) {
  return run(() => {
    const context = learning.recordContext(),
      conversationId = learning.selectedConversationId;
    const currentTasks = learning.currentPlan?.tasks || [];
    learning.confirmProfile(
      context,
      conversationId,
      fields,
      currentTasks.length
        ? null
        : {
            reason: t('tutor.intake.planReason'),
            tasks: [
              ...currentTasks,
              {
                title: t('tutor.intake.taskLearn', { goal: fields.goal || learning.active.goal }),
                condition: 'manual'
              },
              { title: t('tutor.intake.taskReview'), condition: 'manual' }
            ]
              .slice(0, 20)
              .map(({ id, title, questionKey, condition }) => ({
                ...(id ? { id } : {}),
                title,
                ...(questionKey ? { questionKey } : {}),
                condition
              }))
          }
    );
    showIntake.value = false;
  });
}
function resolveProposal(message, action) {
  const context = learning.recordContext(),
    conversationId = learning.selectedConversationId;
  return run(() => {
    if (
      learning.recordContext() !== context ||
      learning.selectedConversationId !== conversationId ||
      !learning.active?.messages.some((item) => item.id === message.id)
    )
      throw Object.assign(new Error('建议已变化'), { code: 'CONTEXT_CHANGED' });
    if (!['profile.set', 'plan.set', 'reminder.set', ...ENTRY_EVENTS].includes(message.proposal?.type))
      throw Object.assign(new Error('建议类型不支持'), { code: 'FORBIDDEN' });
    if (action === 'accept')
      return learning.commit(
        message.proposal.type,
        { ...message.proposal.data, proposalId: message.id, explicit: true },
        `${message.id}:accept`
      );
    return learning.commit(
      'message.add',
      { conversationId, role: 'notice', content: t('tutor.proposal.dismissed') },
      `${message.id}:dismiss`
    );
  });
}
function saveFoundation() {
  return run(() =>
    learning.commit('profile.set', {
      field: 'foundation',
      value: foundation.value,
      source: 'self_report',
      scope: learning.active?.goal || '当前任务'
    })
  );
}
function saveTimezone() {
  return run(() => learning.commit('timezone.set', { timezone: timezone.value }));
}
function savePlan() {
  return run(() =>
    learning.commit('plan.set', {
      tasks: planLines.value
        .split('\n')
        .filter((line) => line.trim())
        .map((title) => ({ title, condition: 'manual' })),
      reason: '用户编辑今日任务；历史计划保持可追溯'
    })
  );
}
function exportRecords() {
  return run(() => exportRecordFile(learning.exportData(), 'learning-records.json'));
}
async function exportRecordFile(content, filename) {
  backupText.value = content;
  showRestore.value = true;
  restorePreview.value = null;
  // #ifdef H5
  if (desktopHost) {
    const context = learning.recordContext();
    const kind =
      filename === 'learning-conflict-local.json'
        ? 'records-conflict-local'
        : filename === 'learning-conflict-remote.json'
          ? 'records-conflict-remote'
          : 'records';
    const result = await saveDesktopLearningFile(kind, content, {
      isCurrent: () => appPageAlive && learning.recordContext() === context
    });
    feedback.value = result.saved
      ? '个人记录备份已保存；包含私人学习内容，不含模型配置密钥。'
      : t('ui.recordExportCancelled');
    return;
  }
  if (typeof document !== 'undefined') {
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    feedback.value = t('ui.recordExportGenerated');
    return;
  }
  // #endif
  // #ifndef H5
  uni.setClipboardData({ data: content });
  feedback.value = '个人记录已复制，请在可信位置保存。';
  // #endif
}
function chooseBackupFile() {
  // #ifdef H5
  if (recordActionsBusy.value || !appPageAlive || !appPageVisible || !showData.value || !showRestore.value) return;
  if (!desktopHost && typeof AbortController !== 'function') {
    recordFileStatus.value = { phase: 'error', message: '当前浏览器无法取消文件读取，请继续粘贴 JSON 备份。' };
    return;
  }
  const request = {
    context: learning.recordContext(),
    revision: learning.state.revision,
    content: backupText.value,
    controller: desktopHost ? null : new AbortController()
  };
  const current = () =>
    activeRecordFile === request &&
    appPageAlive &&
    appPageVisible &&
    showData.value &&
    showRestore.value &&
    learning.recordContext() === request.context &&
    learning.state.revision === request.revision &&
    backupText.value === request.content;
  invalidateRecordPreviews();
  feedback.value = '';
  activeRecordFile = request;
  recordFileBusy.value = true;
  recordFileStatus.value = { phase: 'loading', message: '请选择 JSON 备份；原输入和记录保留，可取消。' };
  return (async () => {
    try {
      const content = await (desktopHost
        ? readDesktopLearningBackup({ isCurrent: current })
        : chooseBrowserLearningBackup({
            isCurrent: current,
            signal: request.controller.signal,
            onPhase: (phase) => {
              if (current() && phase === 'reading')
                recordFileStatus.value = { phase: 'loading', message: '正在读取备份文件，尚未校验或合并；可取消。' };
            }
          }));
      if (!current()) return;
      activeRecordFile = null;
      recordFileBusy.value = false;
      if (content === null) {
        recordFileStatus.value = { phase: 'cancelled', message: '已取消选择备份，原输入和记录保留。' };
        return;
      }
      backupText.value = content;
      restorePreview.value = null;
      recordFileStatus.value = { phase: 'success', message: '备份已读取，请校验并预览后确认合并；当前记录未修改。' };
    } catch (error) {
      if (current())
        recordFileStatus.value = {
          phase: 'error',
          message: publicError(error) || '备份读取失败，请重新选择；原输入和记录保留。'
        };
    } finally {
      if (activeRecordFile === request) {
        activeRecordFile = null;
        recordFileBusy.value = false;
      }
    }
  })();
  // #endif
}
function deleteRecords() {
  showLearningDialog({
    title: '删除本地对话学习数据',
    type: 'warning',
    content:
      '删除当前用户的新学习记录、材料与恢复副本。旧题库和旧版学习数据保留；未确认原件的无正文定位待办保留，以便核对/取消，识别服务中的原件与云端密钥需另行确认删除。',
    success: (res) => {
      if (res.confirm)
        run(() => {
          const copies = createLearningArtifacts();
          learning.deleteData();
          copies.clearDeviceState();
        });
    }
  });
}
function previewRecords() {
  return prepareRecordPreview('restore');
}
let syncPageSequence = 0;
async function runRecordSync(action) {
  feedback.value = '';
  const sequence = syncPageSequence,
    context = learning.recordContext(),
    previous = learning.syncState;
  try {
    await action();
  } catch (failure) {
    if (
      appPageAlive &&
      appPageVisible &&
      sequence === syncPageSequence &&
      learning.recordContext() === context &&
      learning.syncState === previous
    )
      learning.syncState = { phase: 'error', kind: null, context, message: publicError(failure) };
  }
}
function deleteCloudRecords() {
  if (recordActionsBusy.value) return;
  showLearningDialog({
    title: '删除云端学习副本',
    type: 'warning',
    content:
      '请先停止其他设备同步。删除云端学习副本和已存教学结果缓存，并取消已预留的模型任务；费用事实、模型密钥、本机与备份分别保留。以后主动同步或调用模型会产生新副本。',
    isCurrent: () => !recordActionsBusy.value,
    success: (result) => {
      if (result.confirm) runRecordSync(() => learning.deleteCloudRecords(true));
    }
  });
}
function restoreRecords() {
  const content = backupText.value;
  const preview = restorePreview.value;
  if (!preview) return;
  showLearningDialog({
    title: '合并学习备份',
    content: `新增 ${preview.imported} 个操作，保留当前记录，并创建恢复前副本。不会上传备份或恢复模型密钥。`,
    isCurrent: () => restorePreview.value === preview && backupText.value === content && !recordActionsBusy.value,
    success: (result) => {
      if (!result.confirm) return;
      run(() => {
        const restored = learning.restoreData(content, preview);
        feedback.value = `已合并 ${restored.imported} 个操作；统计已按有效记录重算。`;
        restorePreview.value = null;
        backupText.value = '';
        recordPreviewStatus.value = { phase: 'success', message: feedback.value };
      });
    }
  });
}
function rollbackRecords() {
  showLearningDialog({
    title: '撤销最近一次写入',
    type: 'warning',
    content: '恢复到最近一次写入前的本地副本。随后云同步仍需单独授权。',
    success: (result) => {
      if (result.confirm)
        run(() => {
          learning.rollbackRecords();
          feedback.value = '已恢复写入前记录。';
          restorePreview.value = null;
        });
    }
  });
}
function syncRecords() {
  if (recordActionsBusy.value) return;
  if (!getUserId() || !getToken()) {
    showLearningDialog({
      title: '登录后同步学习记录',
      content: '当前记录保留在本机。登录后，请再次选择同步并确认授权。',
      confirmText: '去登录',
      cancelText: '暂不登录',
      success: (result) => {
        if (!result.confirm) return;
        storageService.save('redirect_after_login', '/pages/learning/index');
        safeNavigateTo('/pages/login/index');
      }
    });
    return;
  }
  showLearningDialog({
    title: '同步当前用户的学习记录',
    content:
      '会把对话、私人资料片段、页图与学习记录发送至本Yozi AI 服务，以便多设备使用。没有登录或服务不可用时，本地记录保留。',
    isCurrent: () => !recordActionsBusy.value,
    success: (res) => {
      if (res.confirm) runRecordSync(() => learning.syncRecords(true));
    }
  });
}
function previewGuestRecords() {
  return prepareRecordPreview('guest');
}
function migrateGuestRecords() {
  const preview = guestPreview.value;
  if (!preview) return;
  showLearningDialog({
    title: '确认访客记录属于你',
    content: '归入当前账户，保留已有任务和访客原件，并创建恢复前副本。不会上传；共享设备上的其他人记录请勿认领。',
    isCurrent: () => guestPreview.value === preview && !recordActionsBusy.value,
    success: (result) => {
      if (result.confirm)
        run(() => {
          const outcome = learning.migrateGuest(preview, true);
          feedback.value = `已归入 ${outcome.imported} 个访客操作，合并 ${outcome.mergedPlans} 份计划。`;
          guestPreview.value = null;
          recordPreviewStatus.value = { phase: 'success', message: feedback.value };
        });
    }
  });
}
function exportConflict(side) {
  return run(() => exportRecordFile(learning.exportSyncConflict(side), `learning-conflict-${side}.json`));
}
function resolveConflict(side) {
  if (recordActionsBusy.value) return;
  learning.refresh();
  const preview = learning.syncConflict;
  if (!preview) return;
  showLearningDialog({
    title: side === 'remote' ? '采用云端记录继续' : '恢复本机冲突副本',
    content:
      side === 'remote'
        ? '重新读取云端并校验未变更后，采用该版本。未合并的本机内容保留在冲突副本与恢复副本中；不会重复计入统计。'
        : '当前本机数据先保存为恢复副本，再采用发生冲突时的本机版本。云端不改变。',
    isCurrent: () => !recordActionsBusy.value && learning.isSyncConflictCurrent(preview),
    success: (result) => {
      if (result.confirm)
        runRecordSync(async () => {
          if (side === 'remote') await learning.adoptCloudRecords(preview, true);
          else learning.restoreConflictLocal(preview);
        });
    }
  });
}
function removeConflict() {
  if (recordActionsBusy.value) return;
  learning.refresh();
  const preview = learning.syncConflict;
  if (!preview) return;
  showLearningDialog({
    title: '移除冲突副本',
    type: 'warning',
    content: '请先导出需要保留的两份副本。移除仅删除此冲突归档，不会删除当前本机或云端学习记录。',
    isCurrent: () => !recordActionsBusy.value && learning.isSyncConflictCurrent(preview),
    success: (result) => {
      if (result.confirm) runRecordSync(() => learning.clearSyncConflict(preview));
    }
  });
}
onShow(() => {
  labVisible.value = true;
  appPageVisible = true;
  return run(async () => {
    learning.refresh();
    await readAccountRecords();
    if (learning.accountRecordState !== 'ready') return;
    if (getToken() && !learning.intakeBusy && !learning.busy) await learning.loadModels();
  });
});
onHide(() => {
  try {
    const leave = learningLeaveOperation(learning.state, learning.active?.id);
    if (leave) learning.commit(leave.type, leave.data, leave.id);
  } catch {
    // Locked/stale sessions do not write an observation or claim it was saved.
  }
  labVisible.value = false;
  appPageVisible = false;
  cancelRecordFile();
  syncPageSequence++;
  invalidateRecordPreviews();
  learning.cancelModelReads();
  materialFeedbackSequence++;
  materialFeedback.value = null;
  dialogs.dismiss();
  discardClientFile();
  if (appFileStage !== 'choose') {
    appFileController?.abort();
    discardAppFile();
  }
  profile.value.apiKey = '';
  localToken.value = '';
  materialToken.value = '';
  learning.localConnection = null;
  learning.materialConnection = null;
  learning.sharingAllowed = false;
  learning.cancel();
  learning.cancelMaterial();
  learning.cancelSync({ clearFeedback: true });
});
onUnmounted(() => {
  saveNavigationDraft();
  labVisible.value = false;
  appPageAlive = false;
  cancelRecordFile();
  syncPageSequence++;
  invalidateRecordPreviews();
  learning.cancelModelReads();
  dialogs.destroy();
  discardClientFile();
  appPageVisible = false;
  appFileController?.abort();
  discardAppFile();
  learning.cancel();
  learning.cancelMaterial();
  learning.cancelSync({ clearFeedback: true });
  profile.value.apiKey = '';
  localToken.value = '';
  materialToken.value = '';
  learning.localConnection = null;
  learning.materialConnection = null;
});
</script>
<style scoped>
.conversation-day .message {
  scroll-margin-top: calc(124px + var(--space-status-top, 0px));
}
.record-original {
  margin-bottom: 20px;
  scroll-margin-top: 24px;
}
.record-original .form {
  margin-top: 0;
}
.sentence-saved-answer {
  display: block;
  margin-bottom: 8px;
}
#learning-stop-state,
#active-learning-question,
.sentence-hint-target {
  scroll-margin-top: 24px;
}
</style>

<style scoped>
.chat-insights {
  max-width: 920px;
  width: 100%;
  margin-block: var(--s-4);
}
@media (min-width: 1280px) {
  .learning-page.with-insights {
    position: relative;
    padding-right: 372px;
  }
  .chat-insights {
    position: absolute;
    right: 0;
    top: var(--s-4);
    width: 348px;
    max-height: calc(100vh - 180px);
    overflow-y: auto;
  }
}
</style>

<style scoped>
.lesson-card-heading {
  display: flex;
  gap: var(--s-3);
  align-items: center;
  font-size: var(--size-title-3);
  color: var(--ink);
  margin-bottom: var(--s-4);
}
.lesson-card-heading .yozi-mascot {
  margin-left: auto;
}
.material-reading-card {
  display: grid;
  gap: var(--s-3);
}
</style>
