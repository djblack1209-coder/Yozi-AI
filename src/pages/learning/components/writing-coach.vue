<template>
  <LearningShell
    ref="shell"
    active="learning"
    :center-composer="centerComposer"
    :waiting-for-answer="Boolean(answerTarget)"
    :refresh-records-on-mount="props.refreshRecordsOnMount"
    :notice="cancellationNotice"
    :title="
      !coach && entryMode === 'question'
        ? '单题答疑'
        : subjectMethod
          ? subjectMethod.subject
          : materialTrack
            ? '计算机专业课'
            : '考研英语写作'
    "
    :style="{ '--muse-composer-height': `${composerHeight}px`, '--learning-composer-height': `${composerHeight}px` }"
    @new="newSession"
    @connections="openConnections"
    @materials="showMaterials = !showMaterials"
  >
    <template v-if="sourcePassage" #reader>
      <MuseReadingPane
        :key="openedSource.id"
        :material="learning.state.materials.find((item) => item.id === sourcePassage.materialId)"
        :anchor="sourcePassage"
        @close="openedSource = null"
      />
    </template>
    <!-- #ifdef MP-WEIXIN -->
    <PrivacyPopup />
    <!-- #endif -->
    <template #controls>
      <BaseButton variant="quiet" icon="shapes" icon-only label="AI 连接器" title="AI 连接器" @tap="openConnections" />
    </template>
    <template #composer>
      <MuseComposer
        v-model="composerDraft"
        :class="{
          'is-writing-answer': answerTarget && answerTarget.kind !== 'foundation' && !answerTarget.card?.options?.length
        }"
        :get-voice-context="dictationContext"
        :label="composerLabel"
        :placeholder="composerPlaceholder"
        :send-label="coach ? composerLabel : t('muse.send')"
        :maxlength="
          answerTarget?.kind === 'review'
            ? 1000
            : ['paragraph', 'rewrite'].includes(answerTarget?.kind)
              ? 1800
              : answerTarget?.kind === 'foundation'
                ? 400
                : coach
                  ? 3000
                  : 400
        "
        :busy="learning.busy || learning.intakeBusy || learning.reply?.pending"
        :disabled="Boolean(coach && (learning.active.stopped || !answerTarget))"
        :submit-disabled="false"
        :attachment-disabled="fileBusy || learning.busy"
        :attachment-actions="composerAttachments"
        @submit="submitComposer"
        @attach="openComposerAttachment"
        @stop="
          learning.intakeBusy || learning.reply?.kind === 'intake' ? learning.cancelModelIntake() : learning.cancel()
        "
        @height="composerHeight = $event"
      >
        <template
          v-if="!quietDesktop && (coach || learning.singleQuestionAvailable || entryMode === 'question')"
          #actions
        >
          <BaseSegmented
            v-if="!coach"
            v-model="entryMode"
            label="开始方式"
            :options="[
              { value: 'study', label: '建档学习' },
              { value: 'question', label: '单题答疑' }
            ]"
            :disabled="learning.busy || learning.intakeBusy || !!learning.reply?.pending"
          />
          <MusePresentationControl v-if="coach" :presentation="presentation" />
          <BaseButton
            v-if="coach"
            variant="quiet"
            :disabled="learning.busy"
            @tap="act(() => learning.dispatchLearningAction({ type: 'change_method' }))"
            >换法</BaseButton
          >
          <BaseButton
            v-if="coach"
            variant="quiet"
            :disabled="learning.busy"
            @tap="act(() => learning.dispatchLearningAction({ type: 'hint_only' }))"
            >只要提示</BaseButton
          >
          <BaseButton
            v-if="coach && !learning.active.stopped"
            variant="quiet"
            icon="pause"
            icon-only
            label="暂停带练"
            @tap="pauseLearning"
          />
        </template>
      </MuseComposer>
    </template>
    <MuseModelControl
      v-if="!quietDesktop || (permissionRequested && learning.modelId && !learning.sharingAllowed)"
      :permission-only="quietDesktop"
      @connect="openConnections"
    />
    <MuseModelFeedback
      :failure="modelFailure"
      :state="coachModelFeedbackState"
      :busy="learning.busy || learning.intakeBusy"
      @action="handleModelAction"
    />
    <CustomModal
      :visible="corpusItems.length > 0"
      title="个人句式参考"
      :is-dark="theme.isDark"
      :show-actions="false"
      close-button
      mask-closable
      @cancel="
        corpusItems = [];
        corpusSource = null;
      "
    >
      <view class="coach-material-dialog" data-test="personal-corpus-sources">
        <view v-for="item in corpusItems" :key="item.id" class="coach-corpus-item">
          <text selectable>{{ item.text }}</text>
          <text class="coach-muted">{{ item.day }} · 已采用</text>
          <BaseButton variant="quiet" @tap="corpusSource = corpusOriginal(item)">查看来源原答</BaseButton>
        </view>
        <view v-if="corpusSource" class="coach-corpus-item" data-test="personal-corpus-original">
          <text class="coach-muted">来源任务</text>
          <text selectable>{{ corpusSource.task }}</text>
          <text class="coach-muted">已保存的原答</text>
          <text selectable>{{ corpusSource.input }}</text>
        </view>
      </view>
    </CustomModal>
    <view class="coach-workspace" :class="{ 'coach-workspace--text': presentation.mode === 'text' }">
      <BaseBubble v-if="coach" author="user" avatar :avatar-src="userAvatar" class="coach-user-turn"
        ><text selectable>{{ learning.active.goal }}</text></BaseBubble
      >
      <CustomModal
        :visible="showMaterials"
        title="资料"
        :initial-focus-selector="materialEntry === 'text' ? 'textarea' : ''"
        :is-dark="theme.isDark"
        :show-actions="false"
        close-button
        mask-closable
        @cancel="showMaterials = false"
        ><view class="coach-material-dialog" data-test="coach-materials">
          <text v-if="!coach?.profile" class="coach-muted" role="status"
            >先发送学习目标，完成或跳过建档后即可添加资料。</text
          >
          <BaseInput v-model="materialText" label="粘贴资料（选填）" multiline maxlength="50000" />
          <BaseButton
            :disabled="!coach?.profile || !materialText.trim() || learning.busy || fileBusy"
            @tap="pasteMaterial"
            >保存文字</BaseButton
          >
          <!-- #ifdef H5 -->
          <label class="coach-file" :class="{ 'is-disabled': !coach?.profile || fileBusy || learning.busy }">
            <BaseIcon name="paperclip" tone="ink-2" /><text>选择学习资料</text
            ><component
              :is="'input'"
              type="file"
              class="coach-file-input"
              accept=".txt,.md,.pdf"
              aria-label="选择学习资料"
              :disabled="!coach?.profile || fileBusy || learning.busy"
              @change="pickFile"
          /></label>
          <!-- #endif -->
          <!-- #ifndef H5 -->
          <text class="coach-muted">文字型 PDF 请在网页版导入；这里可粘贴文字。</text>
          <!-- #endif -->
          <text v-if="fileBusy">正在设备内提取文字…</text>
          <view class="coach-material-list">
            <view v-for="material in learning.state.materials" :key="material.id" class="coach-material-row">
              <BaseCheckbox
                :model-value="
                  materials.some((item) => item.id === material.id) || materialSelection.includes(material.id)
                "
                :disabled="
                  fileBusy || learning.busy || !coach?.profile || materials.some((item) => item.id === material.id)
                "
                @update:model-value="toggleMaterial(material.id)"
                >{{ material.name }}</BaseCheckbox
              >
              <BaseButton
                v-if="material.segments?.length"
                variant="quiet"
                :label="`阅读${material.name}`"
                @tap="readMaterial(material.id)"
                >阅读</BaseButton
              >
            </view>
          </view>
          <BaseButton
            v-if="materialSelection.length"
            variant="primary"
            :disabled="fileBusy || learning.busy"
            @tap="useMaterials"
            >使用已选资料</BaseButton
          >
        </view></CustomModal
      >

      <template v-if="!coach">
        <MuseChatEmpty
          v-if="!quietDesktop && showChatEmpty && entryMode === 'study'"
          connected
          @draft="goal = $event"
        />
        <BaseBubble v-if="quietDesktop && showEntryChoice" class="coach-entry-choice">
          <LearningChatChoice
            :title="t('muse.entryKind')"
            :label="t(entryMode === 'study' ? 'muse.modeStudy' : 'muse.modeQuestion')"
            :options="entryOptions"
            :initial-choice="entryMode"
            :busy="learning.busy || learning.intakeBusy || !!learning.reply?.pending"
            @apply="entryMode = $event"
          />
        </BaseBubble>
        <MuseModelIntake
          v-if="usesModelIntake"
          ref="intakePanel"
          v-model="goal"
          :empty-greeting="quietDesktop || showChatEmpty"
          :choice-sheet="quietDesktop"
          shared-input
          new-goal
          :auto-open="Boolean(shell) && !quietDesktop"
          @accepted="acceptedProfile"
        />
      </template>

      <BaseBubble v-else-if="learning.active.stopped" avatar rich class="coach-agent-turn">
        <BaseCard padding="large"
          ><text class="coach-title">带练已暂停，记录保留</text
          ><BaseButton
            variant="primary"
            @tap="
              act(() => learning.commit('task.resume', { conversationId: learning.active.id, source: 'self_report' }))
            "
            >继续当前带练</BaseButton
          ></BaseCard
        >
      </BaseBubble>
      <BaseBubble v-else-if="!coach.profile" avatar rich class="coach-agent-turn">
        <view class="coach-intake coach-agent-message">
          <text v-if="profileStep < 3" class="coach-question">{{
            [
              subjectMethod ? '学习方向' : '英语一还是英语二？',
              '考试大概什么时候？（可跳过）',
              '每天能学多久？（可跳过）'
            ][profileStep]
          }}</text>
          <BaseSegmented
            v-if="profileStep === 0"
            v-model="profile.exam"
            :label="subjectMethod ? '学习方向' : '英语一还是英语二？'"
            :options="subjectMethod ? [{ value: subjectMethod.exam, label: subjectMethod.subject }] : EXAM_OPTIONS"
          />
          <template v-else-if="profileStep === 1">
            <BaseOptions
              v-model="profile.deadlineBucket"
              label="考试大概什么时候？（可跳过）"
              :options="subjectMethod ? [{ value: 'other', label: '填写日期' }] : DEADLINE_OPTIONS"
            />
            <BaseInput
              v-if="profile.deadlineBucket === 'other'"
              v-model="profile.deadline"
              label="具体日期"
              type="date"
              maxlength="10"
            />
          </template>
          <BaseOptions
            v-else-if="profileStep === 2"
            v-model="profile.minutes"
            label="每天能学多久？（可跳过）"
            :options="minuteOptions"
          />
          <text v-else class="coach-question">{{
            materialTrack ? '目前的基础？（选填）' : '目前写作哪里最吃力？（选填）'
          }}</text>
          <text v-if="profileStep === 3" class="coach-muted">{{ profileDescription(profile) }}</text>
          <view class="coach-actions">
            <BaseButton v-if="profileStep" variant="quiet" @tap="profileStep--">{{ t('muse.back') }}</BaseButton>
            <BaseButton v-if="profileStep < 3" variant="primary" @tap="advanceProfile">{{ t('muse.next') }}</BaseButton>
            <BaseButton v-else variant="primary" @tap="saveProfile(false)">保存建档</BaseButton>
            <BaseButton variant="quiet" @tap="saveProfile(true)">跳过，直接开始</BaseButton>
          </view>
        </view>
      </BaseBubble>

      <template v-else>
        <view class="coach-session-state">
          <text class="coach-muted" role="status">建档已保存：{{ profileDescription(coach.profile) }}</text>
          <text v-if="!quietDesktop && coach.profile.examScope" class="coach-muted">{{
            examScopeLabel(coach.profile.examScope)
          }}</text>

          <view v-if="learning.personalCorpusChoices.length" class="coach-corpus-control">
            <BaseCheckbox
              :model-value="learning.personalCorpusAllowed"
              :disabled="learning.busy || !loggedIn || !learning.sharingAllowed"
              data-test="personal-corpus-consent"
              @update:model-value="act(() => learning.setPersonalCorpusAllowed($event))"
              >本次带写参考已采用的个人句式</BaseCheckbox
            >
            <BaseButton variant="quiet" @tap="showCorpus(learning.personalCorpusChoices)">查看句式与来源</BaseButton>
          </view>
          <BaseButton v-if="!loggedIn" variant="primary" @tap="login">登录后开始带练</BaseButton>
          <text v-if="learningDay !== today" class="coach-muted" role="status"
            >继续 {{ learningDay }} 未完成的训练</text
          >
          <text v-else-if="yesterday" class="coach-muted">{{ reentryText }}</text>
          <BaseBubble
            v-if="coachReply"
            :id="coachReply.id"
            :data-reply-pending="coachReply.pending ? 'true' : undefined"
            avatar
            :avatar-identity="coachReply.id"
            :avatar-business="{ busy: coachReply.pending, producing: coachReply.pending && !!coachReply.content }"
            class="coach-reply"
            aria-live="polite"
          >
            <LearningMessage :content="coachReply.content" :pending="coachReply.pending" generated />
          </BaseBubble>
        </view>

        <BaseCard
          v-if="learning.locatedRecord?.coachRecordId"
          id="coach-record-original"
          tabindex="-1"
          class="record-original"
          title="已保存的原答"
          :subtitle="learning.locatedRecord.day"
        >
          <MuseRichText :content="learning.locatedRecord.prompt" />
          <text class="coach-user-message" selectable data-test="located-original-answer">{{
            learning.locatedRecord.answer
          }}</text>
          <BaseButton variant="quiet" @tap="learning.dismissLocatedRecord()">关闭</BaseButton>
        </BaseCard>
        <view v-if="savedPractice.length" class="coach-transcript" aria-label="已保存的对话">
          <BaseButton v-if="savedPractice.length > historyLimit" variant="quiet" @tap="historyLimit += 30"
            >更早的记录</BaseButton
          >
          <view v-for="record in visiblePractice" :key="record.key" class="coach-history-turn">
            <text class="coach-day-divider">{{ record.day }} · {{ record.title }}</text>
            <text v-if="record.reviewContext" class="coach-muted" data-test="phrase-review-context">{{
              record.reviewContext
            }}</text>
            <BaseBubble v-if="record.prompt || record.source" avatar rich class="coach-agent-turn">
              <MuseRichText v-if="record.prompt" :content="record.prompt" />
              <MuseCoachCitation
                v-if="record.source"
                :source="record.source"
                :materials="learning.state.materials"
                @open="openedSource = $event"
              />
            </BaseBubble>
            <BaseBubble author="user" avatar :avatar-src="userAvatar" class="coach-user-turn"
              ><text selectable>{{ record.answer }}</text></BaseBubble
            >
            <BaseButton
              v-if="record.phase === 'essay' && artifactForDay(record.day)"
              variant="quiet"
              icon="file-text"
              :data-essay-artifact="artifactForDay(record.day).id"
              @tap="openStudentArtifact(learning, artifactForDay(record.day))"
              >打开文档</BaseButton
            >
            <text
              v-if="
                record.phase === 'essay' &&
                !materialTrack &&
                (record.feedback || record.writingProcessSource === 'guided')
              "
              class="coach-muted"
              data-test="writing-process-source"
              title="仅说明提交路径，不证明未使用 AI"
              >{{ record.writingProcessSource === 'guided' ? '流程来源：带写成文' : '流程来源：未知' }}</text
            >
            <BaseBubble
              v-if="record.feedback || record.assessmentStatus === 'pending'"
              avatar
              rich
              class="coach-agent-turn coach-card-turn"
            >
              <MuseFeedbackCard
                v-if="record.feedback"
                :feedback="record.feedback"
                :writing-observation="DEV_TEST ? record.writingObservation : null"
                :material-track="materialTrack || Boolean(subjectMethod)"
                :title="`${record.feedback.target === 'diagnostic' ? '摸底反馈' : record.feedback.target === 'essay' ? '成文反馈' : record.title} · AI 评估`"
                :adoptable="
                  record.day === learningDay &&
                  Object.values(day?.feedback || {}).some((f) => f.id === record.feedback.id)
                "
                :adopted="coach.library.map((item) => item.text)"
                :disabled="learning.busy"
                @adopt="act(() => learning.coachSave('adopt', { feedbackId: record.feedback.id, phrase: $event }))"
              />
              <BaseButton
                v-if="record.personalCorpus"
                variant="quiet"
                data-test="saved-personal-corpus"
                @tap="showCorpus(record.personalCorpus.items)"
                >本次参考的个人句式</BaseButton
              >
              <view
                v-if="!record.feedback && record.assessmentStatus === 'pending'"
                class="coach-agent-message"
                role="status"
              >
                <text>原答已保存，AI 评估待完成</text>
                <BaseButton
                  v-if="record.request"
                  variant="quiet"
                  :disabled="
                    learning.busy || !loggedIn || (record.request.status === 'closed' && !learning.sharingAllowed)
                  "
                  @tap="act(() => learning.requestCoach(record.phase || 'feedback', record.target, record.request.id))"
                  >{{ record.request.status === 'closed' ? '重新评估' : '查询评估结果' }}</BaseButton
                >
              </view>
            </BaseBubble>
          </view>
        </view>

        <text v-if="!quietDesktop || assessmentCounts.submitted" class="coach-muted" role="status"
          >已提交 {{ assessmentCounts.submitted }} 题，{{ assessmentCounts.assessed }} 题已评估，{{
            assessmentCounts.pending
          }}
          题待评估</text
        >
        <template v-if="quietDesktop">
          <LearningActivityGroup
            v-for="group in visibleActivity"
            :key="group.day"
            :day="group.day"
            :items="group.items"
          />
        </template>
        <view id="coach-current-turn" class="coach-current-turn">
          <BaseBubble avatar rich class="coach-agent-turn coach-card-turn">
            <view v-if="quietDesktop && answerTarget" class="coach-turn-actions">
              <LearningChatChoice
                :title="t('muse.turnActions')"
                :label="t('muse.turnActions')"
                :options="coachTurnOptions"
                :busy="learning.busy"
                icon-only
                @apply="applyCoachTurnAction"
              />
            </view>
            <text v-if="!quietDesktop" class="coach-muted" role="status" aria-live="polite"
              >当前教法：{{
                { hint: '只给提示', steps: '分步讲解', example: '例子讲解', explain: '直接讲解', question: '引导提问' }[
                  learning.activeStrategy.method
                ] || '按当前计划带练'
              }}</text
            >
            <MuseErrorReview :conversation-id="learning.active.id" />
            <BaseCard v-if="dueRewrite">
              <text class="coach-title">次日改写</text>
              <text>{{ dueRewrite.task }}</text>
              <template v-if="!dueRewrite.answer">
                <BaseInput v-model="nextRewriteAnswer" label="改写后的全文" multiline :maxlength="6000" />
                <BaseButton
                  :disabled="learning.busy || !nextRewriteAnswer.trim()"
                  @tap="
                    act(() =>
                      learning.coachSave('rewriteAnswer', { rewriteId: dueRewrite.id, answer: nextRewriteAnswer })
                    )
                  "
                  >交卷</BaseButton
                >
              </template>
              <template v-else-if="!dueRewrite.feedback">
                <text selectable>{{ dueRewrite.answer.text }}</text>
                <BaseButton :disabled="learning.busy" @tap="act(() => learning.requestCoach('essay', 'rewrite'))"
                  >按维反馈</BaseButton
                >
              </template>
              <template v-else>
                <text>AI 评估 · 原稿与改写稿均已保留</text>
                <text v-for="dimension in dueRewrite.feedback.dimensions" :key="dimension.name"
                  >{{ dimension.name }}：{{
                    dimension.score === null ? '待核对' : ['需重练', '可改进', '达成本次要求'][dimension.score]
                  }}
                  · {{ dimension.comment }}</text
                >
              </template>
            </BaseCard>
            <BaseCard v-if="dueItem" data-test="phrase-review-card">
              <text class="coach-title">{{ materialTrack ? '先复习一个知识点' : '先复习到期句式' }}</text>
              <template v-if="phraseRecall">
                <text v-if="recallCue" selectable>{{ recallCue }}</text>
                <text v-else class="coach-muted">复习 {{ dueItem.day }} 保存的句式，先尝试回忆，再查看原句。</text>
                <BaseButton
                  v-if="!referenceShown"
                  variant="quiet"
                  data-test="phrase-review-reveal"
                  @tap="showReviewReference"
                  >查看原句</BaseButton
                >
                <text v-else selectable data-test="phrase-review-original">{{ dueItem.text }}</text>
                <text v-if="referenceShown" class="coach-muted">已查看原句，本次按提示后复习安排。</text>
              </template>
              <text v-else>{{ dueItem.text }}</text>
              <text class="coach-muted">提交后由系统核对原句并安排复习，近义表达保留待核对。</text>
              <BaseButton data-test="phrase-review-submit" :disabled="!answer.trim() || learning.busy" @tap="review"
                >提交复习答案</BaseButton
              >
            </BaseCard>
            <template v-else>
              <BaseCard v-if="!coach.diagnostic">
                <text class="coach-title">{{ materialTrack || subjectMethod ? '资料摸底' : '十分钟摸底' }}</text
                ><text v-if="!materialTrack && !subjectMethod">成分、搭配、翻译、长难句和审题，每项一题。</text>
                <BaseButton
                  variant="primary"
                  :disabled="fileBusy || learning.busy || (!needsMaterial && (!loggedIn || !learning.sharingAllowed))"
                  @tap="needsMaterial ? (showMaterials = true) : request('diagnostic')"
                  >{{ needsMaterial ? '添加学习资料' : requestLabel('diagnostic') }}</BaseButton
                >
              </BaseCard>
              <BaseCard v-else-if="!coach.diagnostic.feedback && (!day || diagnosticCard)">
                <MusePracticeSheet
                  v-model="answer"
                  shared-input
                  :title="materialTrack || subjectMethod ? '资料摸底' : '十分钟摸底'"
                  :cards="coach.diagnostic.cards"
                  :materials="learning.state.materials"
                  :answers="coach.diagnostic.answers"
                  :current-id="diagnosticCard?.id || ''"
                  :disabled="learning.busy"
                  @submit="submitCard($event, true)"
                  @open-source="openedSource = $event"
                />
                <BaseButton
                  v-if="!diagnosticCard"
                  variant="primary"
                  :disabled="requestDisabled('feedback', 'diagnostic')"
                  @tap="request('feedback', 'diagnostic')"
                  >{{ requestLabel('feedback', 'diagnostic', '生成薄弱点与今日安排') }}</BaseButton
                >
                <BaseButton
                  v-if="!diagnosticCard"
                  variant="quiet"
                  :disabled="requestDisabled('daily')"
                  @tap="request('daily')"
                  >先继续下一题</BaseButton
                >
              </BaseCard>
              <BaseCard v-else-if="!day">
                <text class="coach-title">{{
                  coach.profile.minutes ? `今天按 ${coach.profile.minutes} 分钟安排` : '今天的训练'
                }}</text
                ><text>{{
                  coach.diagnostic.feedback.weaknesses.slice(0, 2).join('、') ||
                  (subjectMethod
                    ? subjectMethod.dailyIntro
                    : materialTrack
                      ? '从资料里的一个概念开始'
                      : '先练搭配和句子，再逐段写作')
                }}</text>
                <BaseButton variant="primary" :disabled="requestDisabled('daily')" @tap="request('daily')">{{
                  requestLabel('daily', 'daily', '安排今日训练')
                }}</BaseButton>
              </BaseCard>
              <template v-else>
                <BaseCard v-if="trainingCard">
                  <text
                    v-if="subjectMethod?.paragraphsFromTask"
                    class="coach-muted"
                    selectable
                    data-test="training-writing-task"
                    >本题：{{ day.pack.writing.prompt }}</text
                  >
                  <MusePracticeSheet
                    v-model="answer"
                    shared-input
                    :title="day.day === today ? '今日训练' : '继续上次训练'"
                    :cards="day.pack.cards"
                    :materials="learning.state.materials"
                    :answers="day.answers"
                    :current-id="trainingCard.id"
                    :disabled="learning.busy"
                    @submit="submitCard($event, false)"
                    @open-source="openedSource = $event"
                    @viewed="viewedCardId = $event"
                  />
                  <text v-if="shownCardAwaitsFeedback && !learning.busy" role="status">原答已保存，AI 评估待完成</text>
                  <BaseButton
                    v-if="shownCardAwaitsFeedback"
                    variant="primary"
                    :disabled="requestDisabled('feedback', `card-${shownCard.id}`)"
                    @tap="request('feedback', `card-${shownCard.id}`)"
                    >{{ requestLabel('feedback', `card-${shownCard.id}`, '查看本卡反馈') }}</BaseButton
                  >
                  <BaseButton v-if="cardAnswer" variant="quiet" :disabled="learning.busy" @tap="continueTraining"
                    >先继续下一题</BaseButton
                  >
                </BaseCard>
                <BaseCard v-else-if="materialTrack && !day.summary">
                  <BaseButton variant="primary" :disabled="requestDisabled('summary')" @tap="request('summary')">{{
                    requestLabel('summary', 'summary', '生成今日小结')
                  }}</BaseButton>
                </BaseCard>
                <BaseCard v-else-if="!materialTrack && !day.analysis">
                  <text class="coach-title">先自己审题</text><text>{{ day.pack.writing.prompt }}</text
                  ><MuseCoachCitation
                    :source="day.pack.writing.source"
                    :materials="learning.state.materials"
                    @open="openedSource = $event"
                  />
                  <BaseInput
                    v-for="field in analysisFields"
                    :key="field.key"
                    v-model="analysis[field.key]"
                    :label="field.label"
                    maxlength="600"
                  />
                  <BaseButton variant="primary" :disabled="learning.busy" @tap="saveAnalysis">提交审题</BaseButton>
                </BaseCard>
                <BaseCard v-else-if="!materialTrack && !day.feedback.analysis"
                  ><text>{{ day.pack.writing.prompt }}</text
                  ><BaseButton
                    variant="primary"
                    :disabled="requestDisabled('feedback', 'analysis')"
                    @tap="request('feedback', 'analysis')"
                    >{{ requestLabel('feedback', 'analysis', '对照审题反馈') }}</BaseButton
                  ></BaseCard
                >
                <BaseCard v-else-if="!materialTrack && paragraphIndex < day.pack.writing.patterns.length">
                  <text class="coach-title"
                    >第 {{ paragraphIndex + 1 }} 段 ·
                    {{
                      subjectMethod
                        ? subjectMethod.paragraphsFromTask && day.pack.writing.patterns.length === 1
                          ? '完成本题'
                          : subjectMethod.paragraphLabels[
                              paragraphIndex === 0 ? 0 : paragraphIndex === day.pack.writing.patterns.length - 1 ? 2 : 1
                            ]
                        : paragraphIndex === 0
                          ? '交代目的或描述'
                          : paragraphIndex === day.pack.writing.patterns.length - 1
                            ? '回应目的与建议'
                            : '展开要点与理由'
                    }}</text
                  >
                  <text>{{ day.pack.writing.prompt }}</text
                  ><text v-if="subjectMethod" class="coach-muted">{{ subjectMethod.writingHint }}</text>
                  <text v-else class="coach-muted">全文字数以题干为准；先借助句式写，再按反馈改写。</text>
                  <text v-if="subjectMethod?.paragraphsFromTask" class="coach-muted">组织参考</text>
                  <text
                    v-for="pattern in day.pack.writing.patterns[paragraphIndex]"
                    :key="pattern"
                    class="coach-pattern"
                    >{{ pattern }}</text
                  >
                  <template v-if="!day.drafts[paragraphIndex]"
                    ><MuseWritingCard
                      v-model="answer"
                      shared-input
                      label="写下本段"
                      submit-label="提交本段"
                      :maxlength="1800"
                      :english="subjectMethod?.language !== 'zh'"
                      :disabled="learning.busy"
                      @submit="saveParagraph(false)"
                  /></template>
                  <template v-else-if="!day.feedback[`paragraph-${paragraphIndex}`]"
                    ><text class="coach-saved">{{ day.drafts[paragraphIndex].text }}</text
                    ><BaseButton
                      variant="primary"
                      :disabled="requestDisabled('feedback', `paragraph-${paragraphIndex}`)"
                      @tap="request('feedback', `paragraph-${paragraphIndex}`)"
                      >{{ requestLabel('feedback', `paragraph-${paragraphIndex}`, '逐句反馈') }}</BaseButton
                    ></template
                  >
                  <template v-else
                    ><MuseWritingCard
                      v-model="answer"
                      shared-input
                      label="改写本段"
                      submit-label="保存改写"
                      :maxlength="1800"
                      :english="subjectMethod?.language !== 'zh'"
                      :disabled="learning.busy"
                      @submit="saveParagraph(true)"
                  /></template>
                </BaseCard>
                <BaseCard v-else-if="!materialTrack && !day.essay"
                  ><text class="coach-title">你的全文</text
                  ><BaseButton
                    v-if="artifactForDay(day.day)"
                    variant="quiet"
                    icon="file-text"
                    :data-essay-artifact="artifactForDay(day.day).id"
                    @tap="openStudentArtifact(learning, artifactForDay(day.day))"
                    >打开文档</BaseButton
                  ><text v-for="paragraph in day.rewrites" :key="paragraph.id" class="coach-saved">{{
                    paragraph.text
                  }}</text
                  ><BaseButton
                    variant="primary"
                    :disabled="learning.busy || (!canSubmitWriting && (!loggedIn || !learning.sharingAllowed))"
                    @tap="request('essay')"
                    >{{ canSubmitWriting ? '交卷' : requestLabel('essay', 'essay', '查看成文反馈') }}</BaseButton
                  ></BaseCard
                >
                <BaseCard v-else-if="!day.summary"
                  ><text class="coach-title">完成了，留一份小结</text
                  ><BaseButton variant="primary" :disabled="requestDisabled('summary')" @tap="request('summary')">{{
                    requestLabel('summary', 'summary', '生成今日小结')
                  }}</BaseButton></BaseCard
                >
                <BaseCard v-else
                  ><text class="coach-title">{{ day.completed ? '今天已完成' : '今日小结' }}</text
                  ><text v-for="item in day.summary.learned" :key="item">{{ item }}</text
                  ><text class="coach-title">明天</text
                  ><text v-for="item in day.summary.tomorrow" :key="item">{{ item }}</text
                  ><BaseButton
                    v-if="DEV_TEST && !day.completed"
                    variant="quiet"
                    :disabled="requestDisabled('summary')"
                    @tap="request('summary')"
                    >{{ requestLabel('summary', 'summary', '重新生成小结') }}</BaseButton
                  ><BaseButton
                    v-if="!day.completed"
                    :disabled="assessmentCounts.pending > 0"
                    variant="primary"
                    @tap="act(() => learning.coachSave('finish'))"
                    >{{ learningDay === today ? '确认完成今天' : '确认完成这次训练' }}</BaseButton
                  ><BaseButton variant="quiet" @tap="safeNavigateTo('/pages/archive/index?view=phrases')"
                    >查看已保存进度</BaseButton
                  ></BaseCard
                >
              </template>
            </template>
            <BaseCheckbox
              v-if="consentAvailable"
              data-test="coach-consent"
              :model-value="learning.sharingAllowed"
              :disabled="learning.busy"
              @update:model-value="learning.setSharingAllowed"
              >同意共享本次原答和必要资料片段</BaseCheckbox
            >
          </BaseBubble>
        </view>
        <BaseBubble v-if="surveyDue" avatar rich class="coach-agent-turn">
          <BaseCard
            ><text class="coach-title">如果每月 ¥{{ trialPrice }}，你会继续使用吗？</text
            ><view class="coach-actions"
              ><BaseButton
                v-for="option in [
                  { value: 'yes', label: '会' },
                  { value: 'no', label: '暂时不会' },
                  { value: 'skip', label: '跳过' }
                ]"
                :key="option.value"
                @tap="act(() => learning.coachSave('survey', { answer: option.value }))"
                >{{ option.label }}</BaseButton
              ></view
            ></BaseCard
          >
        </BaseBubble>
      </template>
      <BaseCard
        v-if="!cancellationNotice && (message || learning.coachError || learning.error)"
        :id="DEV_TEST ? 'coach-action-error' : undefined"
        :role="modelFailure?.error === 'NEEDS_CONNECTION' ? 'status' : 'alert'"
        ><text>{{
          message ||
          modelErrorPresentation({
            error: learning.retryState?.errorCode,
            status: learning.retryState?.status,
            upstreamStatus: learning.retryState?.upstreamStatus,
            retryAllowed: true
          }).message
        }}</text></BaseCard
      >
    </view>
  </LearningShell>
</template>
<script setup>
import { visibleReply, cancelledNotice, studentAvatar, SHELL_ROUTES } from '@/services/learning/shell-navigation.js';
import { studentEssaySources, openStudentArtifact } from '@/services/learning/learning-artifacts.js';
import { computed, ref, reactive, watch, onMounted, onBeforeUnmount, onUnmounted, nextTick } from 'vue';
import { coachSavedRecords } from '../../../../laf-backend/functions/_shared/learning-coach-records.js';
import { coachDueItem } from '../../../../laf-backend/functions/_shared/learning-reminders.js';
import { workspaceDrafts } from '@/services/learning/workspace-drafts.js';
import { phraseRecallCue } from '../../../../laf-backend/functions/_shared/learning-writing-corpus.js';
import BaseBubble from '@/components/base/base-bubble/base-bubble.vue';
import LearningMessage from './learning-message.vue';
import '@/i18n/muse.js';
import { t } from '@/i18n/index.js';
import { safeNavigateTo } from '@/utils/safe-navigate.js';
import MuseComposer from '@/components/business/learning/muse-composer.vue';
import MusePresentationControl from '@/components/business/learning/muse-presentation-control.vue';
import { useLearningPresentation } from '@/composables/useLearningPresentation.js';
import { toast } from '@/utils/toast.js';
import { savedLearningFeedback, playLearningFeedback, stopLearningFeedback } from '@/design/learning-feedback.js';
import MuseChatEmpty from '@/components/business/learning/muse-chat-empty.vue';
import MuseModelControl from '@/components/business/learning/muse-model-control.vue';
import MuseModelFeedback from '@/components/business/learning/muse-model-feedback.vue';
import { modelErrorPresentation } from '../../../../laf-backend/functions/_shared/model-errors.js';
import MuseModelIntake from '@/components/business/learning/muse-model-intake.vue';
import { DEV_TEST } from '@/config/build-channel.js';
import { MODEL_INTAKE_V2_CONTRACT } from '../../../../laf-backend/functions/_shared/learning-intake.js';
import { examScopeLabel } from '../../../../laf-backend/functions/_shared/learning-exam-scope.js';
import MuseRichText from '@/components/business/learning/muse-rich-text.vue';
import MuseWritingCard from '@/components/business/learning/muse-writing-card.vue';
import MusePracticeSheet from '@/pages/learning/components/muse-practice-sheet.vue';
import MuseCoachCitation from './muse-coach-citation.vue';
import MuseReadingPane from './muse-reading-pane.vue';
import MuseFeedbackCard from '@/components/business/learning/muse-feedback-card.vue';
import MuseErrorReview from '@/components/business/learning/muse-error-review.vue';
import { useConversationLearningStore, learningId } from '@/stores/modules/conversation-learning.js';
import { dayKey } from '@/services/learning/learning-domain.js';
import { getToken } from '@/services/auth-storage.js';
import { readWritingMaterial } from '@/services/learning/writing-material.js';
import { coachSourcePassage } from '@/services/learning/coach-material-context.js';
import { resolveSkippedProfile } from '@/services/learning/coach-profile.js';
import {
  COACH_MATERIAL_TRACK,
  coachUsesMaterials,
  coachLearningDay,
  coachAssessmentCounts
} from '../../../../laf-backend/functions/_shared/learning-writing-coach.js';
import { subjectCoachMethod } from '../../../../laf-backend/functions/_shared/learning-coach-methods.js';
import LearningShell from '@/components/business/learning/learning-shell.vue';
import LearningChatChoice from '@/components/business/learning/learning-chat-choice.vue';
import LearningActivityGroup from '@/components/business/learning/learning-activity-group.vue';
import { coachActivitiesByDay } from '@/services/learning/learning-activity.js';
import { isDesktopRuntime } from '@/services/desktop/runtime.js';
import PrivacyPopup from '@/components/common/privacy-popup.vue';
import CustomModal from '@/components/common/CustomModal.vue';
import BaseCheckbox from '@/components/base/base-checkbox/base-checkbox.vue';
import { useThemeStore } from '@/stores/modules/theme.js';
import BaseCard from '@/components/base/base-card/base-card.vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseInput from '@/components/base/base-input/base-input.vue';
import BaseOptions from '@/components/base/base-options/base-options.vue';
import BaseSegmented from '@/components/base/base-segmented/base-segmented.vue';
const props = defineProps({
  materialsOpen: Boolean,
  refreshRecordsOnMount: { type: Boolean, default: true },
  connectionLabel: { type: String, default: '' },
  connectionAction: { type: String, default: '' },
  connectionTone: { type: String, default: 'neutral' },
  presentation: { type: Object, default: null }
});
const emit = defineEmits(['advanced', 'general']);
const shell = ref(null);
const quietDesktop = computed(() => shell.value?.quietDesktop ?? isDesktopRuntime());
const permissionRequested = ref(false);
defineExpose({ dismissDirectory: () => shell.value?.dismissDirectory() ?? false });

const learning = useConversationLearningStore();
const presentation = props.presentation || useLearningPresentation(() => learning.recordContext());
const modelFailure = ref(null);
const theme = useThemeStore(),
  materialSelection = ref([]);
const openedSource = ref(null);
const sourcePassage = computed(() => {
  const target = openedSource.value;
  if (!target || target.kind === 'private_material') return coachSourcePassage(learning.state.materials, target);
  const material = learning.state.materials.find((item) => item.id === target.materialId);
  const position = material?.reading?.position;
  const segment =
    material?.segments.find(
      (item) => item.id === position?.segmentId && (item.extractionEventId ?? null) === position.version
    ) || material?.segments[0];
  if (!segment) return null;
  const lineBreak = segment.content.indexOf('\n');
  return {
    materialId: material.id,
    segmentId: segment.id,
    start: 0,
    end: lineBreak > 0 ? lineBreak : segment.content.length
  };
});
const profileStep = ref(0);
const composerHeight = ref(60);
const intakePanel = ref(null);
const userAvatar = computed(() => studentAvatar(learning.state.owner));
const showChatEmpty = computed(() => props.connectionTone === 'mint' && !learning.state.intake && !learning.intakeBusy);
const goal = ref(''),
  entryMode = ref('study'),
  answer = ref(''),
  materialText = ref(''),
  message = ref('');
const showEntryChoice = computed(
  () =>
    learning.singleQuestionAvailable &&
    Boolean(goal.value.trim()) &&
    (!learning.state.intake || learning.state.intake.acceptedConversationId || learning.state.intake.finalFailure)
);
const entryOptions = computed(() => [
  { value: 'study', label: t('muse.modeStudy') },
  { value: 'question', label: t('muse.modeQuestion') }
]);
const centerComposer = computed(
  () =>
    !coach.value &&
    (!learning.state.intake || learning.state.intake.acceptedConversationId) &&
    !learning.reply?.pending &&
    !permissionRequested.value &&
    !modelFailure.value
);
const showMaterials = ref(props.materialsOpen),
  materialEntry = ref(''),
  fileBusy = ref(false);
watch(showMaterials, (open) => {
  if (!open) materialEntry.value = '';
});
watch(
  () => props.materialsOpen,
  (open) => {
    showMaterials.value = open;
  }
);
const EXAM_OPTIONS = Object.freeze([
  { value: 'english1', label: '英语一' },
  { value: 'english2', label: '英语二' }
]);
const MINUTE_OPTIONS = Object.freeze([
  { value: '15', label: '15分钟' },
  { value: '25', label: '25分钟' },
  { value: '40', label: '40分钟' },
  { value: '60', label: '60分钟' }
]);
const DEADLINE_OPTIONS = Object.freeze([
  { value: 'this', label: '今年12月' },
  { value: 'next', label: '明年12月' },
  { value: 'other', label: '其他日期' }
]);
const profile = reactive({
  subject: '',
  exam: '',
  subjects: [],
  deadline: '',
  deadlineBucket: '',
  foundation: '',
  minutes: ''
});
const minuteOptions = computed(() =>
  profile.minutes && !MINUTE_OPTIONS.some((option) => option.value === profile.minutes)
    ? [{ value: profile.minutes, label: `${profile.minutes}分钟` }, ...MINUTE_OPTIONS]
    : MINUTE_OPTIONS
);
function profileDescription(value) {
  return [
    subjectCoachMethod(value.exam)?.subject ||
      { english1: '英语一', english2: '英语二', cs408: '计算机考研' }[value.exam],
    { this: '今年12月', next: '明年12月' }[value.deadlineBucket] || value.deadline,
    value.minutes ? `${value.minutes}分钟/天` : '',
    value.foundation ? `困难：${value.foundation}` : ''
  ]
    .filter(Boolean)
    .join(' · ');
}
function skipKnownProfileSteps() {
  while (profileStep.value < 3 && profile[['exam', 'deadlineBucket', 'minutes'][profileStep.value]])
    profileStep.value++;
}
function advanceProfile() {
  profileStep.value++;
  skipKnownProfileSteps();
}
// 档案草稿是组件级状态，不随 coach 重置；新一轮带练必须从种子重来，
// 否则上一轮选过的考试类型会压过这一轮目标里写明的类型。
function resetProfileDraft() {
  Object.assign(profile, {
    subject: '',
    exam: '',
    subjects: [],
    deadline: '',
    deadlineBucket: '',
    foundation: '',
    minutes: ''
  });
}
const nextRewriteAnswer = ref('');
const dueRewrite = computed(
  () => (coach.value?.rewriteTasks || []).filter((task) => task.dueDay <= today.value).at(-1) || null
);
const analysisFields = [
  { key: 'genre', label: '体裁' },
  { key: 'recipient', label: '对象' },
  { key: 'purpose', label: '目的' },
  { key: 'points', label: '要点' },
  { key: 'words', label: '字数' }
];
const analysis = reactive(Object.fromEntries(analysisFields.map((f) => [f.key, ''])));
const coach = computed(() => learning.active?.coach);
const corpusItems = ref([]);
const corpusSource = ref(null);
function showCorpus(items) {
  corpusItems.value = items;
  corpusSource.value = null;
}
function corpusOriginal(item) {
  return coach.value?.requests.find((request) => request.id === item.requestId)?.request || null;
}
watch(
  () => learning.active?.id,
  () => {
    corpusItems.value = [];
    corpusSource.value = null;
  }
);
const cancellationNotice = computed(() => cancelledNotice(learning.error));
const coachReply = computed(() =>
  learning.reply?.kind === 'coach' &&
  learning.reply.conversationId === learning.active?.id &&
  visibleReply(learning.reply)
    ? learning.reply
    : null
);
const materialTrack = computed(() => coachUsesMaterials(coach.value) || profile.subject === 'kaoyan_major');
const subjectMethod = computed(() =>
  subjectCoachMethod(coach.value?.profile?.exam || profile.exam, coach.value?.profile?.methodContract)
);
const today = computed(() => dayKey(learning.calendarTime, learning.state.timezone));
const learningDay = computed(() => coachLearningDay(coach.value, today.value));
const day = computed(() => coach.value?.days.find((d) => d.day === learningDay.value));
const canSubmitWriting = computed(
  () =>
    day.value?.writingTask?.taskVersion === 1 &&
    !day.value.writingSubmissions?.length &&
    day.value.rewrites.length === day.value.pack.writing.patterns.length &&
    day.value.rewrites.every((paragraph) => paragraph?.authorship === 'user_typed')
);
const loggedIn = computed(() => Boolean(getToken()));
const dueItem = computed(() =>
  coachDueItem(coach.value, learning.calendarTime, learning.state.events, learning.active?.id)
);
const phraseRecall = computed(() => ['english1', 'english2'].includes(coach.value?.profile?.exam));
const recallCue = computed(() =>
  dueItem.value && phraseRecall.value ? phraseRecallCue(coach.value, dueItem.value) : ''
);
const referenceShown = ref(false);
const yesterday = computed(() => coach.value?.days.filter((d) => d.day < today.value).at(-1));
const reentryText = computed(() => {
  const gap = Math.max(1, Math.round((Date.parse(today.value) - Date.parse(yesterday.value?.day)) / 86400000));
  return gap > 1
    ? `离上次学习 ${gap} 天，今天先复习一个薄弱点。`
    : `上次：${(yesterday.value?.summary?.learned[0] || '原答已保存').slice(0, 100)}`;
});
const diagnosticCard = computed(() =>
  coach.value?.diagnostic?.cards.find((c) => !coach.value.diagnostic.answers.some((a) => a.cardId === c.id))
);
const skippedCards = ref([]);
const assessmentCounts = computed(() => coachAssessmentCounts(coach.value, learningDay.value));
const trainingCard = computed(() =>
  day.value?.analysis && !materialTrack.value
    ? null
    : day.value?.pack.cards.find((c) => !day.value.feedback[`card-${c.id}`] && !skippedCards.value.includes(c.id))
);
function continueTraining() {
  if (trainingCard.value) skippedCards.value.push(trainingCard.value.id);
  revealAfterStudentAction();
}
// Consent applies per send, so it has to sit at the step being sent, not back at the top of a long conversation.
const consentAvailable = computed(() => loggedIn.value && learning.modelId && coach.value?.profile);
const cardAnswer = computed(() => day.value?.answers.find((a) => a.cardId === trainingCard.value?.id));
// 查看本卡反馈 has to assess the card on screen, which the tabs can move away from the current one.
const viewedCardId = ref('');
const shownCard = computed(() => day.value?.pack.cards.find((c) => c.id === viewedCardId.value) || trainingCard.value);
const shownCardAwaitsFeedback = computed(
  () =>
    day.value?.answers.some((a) => a.cardId === shownCard.value?.id) &&
    !day.value.feedback[`card-${shownCard.value.id}`]
);
const paragraphIndex = computed(() => day.value?.rewrites.length || 0);
const historyLimit = ref(1);
const savedPractice = computed(() => coachSavedRecords(learning.active));
const essayArtifacts = computed(() =>
  studentEssaySources(learning.state).filter((item) => item.conversationId === learning.active?.id)
);
const artifactForDay = (day) => essayArtifacts.value.filter((item) => item.day === day).at(-1);
const visiblePractice = computed(() => savedPractice.value.slice(-historyLimit.value));
const visibleActivity = computed(() => {
  const groups = coachActivitiesByDay(coach.value?.requests);
  const days = new Set([learningDay.value, ...visiblePractice.value.map((record) => record.day)]);
  return [...groups].filter(([day]) => days.has(day)).map(([day, items]) => ({ day, items }));
});
watch(
  () => learning.selectedConversationId,
  () => {
    historyLimit.value = 1;
    skippedCards.value = [];
    permissionRequested.value = false;
  }
);
watch(
  () => learning.locatedRecord?.id,
  async () => {
    await nextTick();
    // #ifdef H5
    if (learning.locatedRecord?.coachRecordId && typeof document !== 'undefined')
      document.getElementById('coach-record-original')?.scrollIntoView({ block: 'center' });
    // #endif
  }
);
const materials = computed(() =>
  learning.state.materials.filter((m) => !coach.value || coach.value.materialIds.includes(m.id))
);
const needsMaterial = computed(
  () => (materialTrack.value || subjectMethod.value?.sourceRequired) && !materials.value.length
);
const answerTarget = computed(() => {
  if (learning.active?.stopped) return null;
  if (coach.value && !coach.value.profile && profileStep.value === 3) return { kind: 'foundation' };
  if (!coach.value?.profile) return null;
  if (dueItem.value) return { kind: 'review' };
  if (diagnosticCard.value) return { kind: 'diagnostic', card: diagnosticCard.value };
  if (trainingCard.value && !cardAnswer.value) return { kind: 'training', card: trainingCard.value };
  if (
    day.value?.analysis &&
    day.value.feedback.analysis &&
    paragraphIndex.value < day.value.pack.writing.patterns.length
  ) {
    if (!day.value.drafts[paragraphIndex.value]) return { kind: 'paragraph' };
    if (day.value.feedback[`paragraph-${paragraphIndex.value}`]) return { kind: 'rewrite' };
  }
  return null;
});
function dictationContext() {
  const context = learning.recordContext();
  return context
    ? JSON.stringify([
        context,
        learning.selectedConversationId,
        learningDay.value,
        answerTarget.value?.kind,
        answerTarget.value?.card?.id,
        paragraphIndex.value,
        dueItem.value?.id
      ])
    : '';
}
const composerLabel = computed(() =>
  !coach.value
    ? t('muse.message')
    : answerTarget.value?.kind === 'foundation'
      ? '补充基础'
      : answerTarget.value?.kind === 'review'
        ? materialTrack.value
          ? '用自己的话解释'
          : phraseRecall.value
            ? '回忆并写出原句'
            : '用这个句式或搭配写一句话'
        : answerTarget.value?.kind === 'rewrite'
          ? '保存改写'
          : answerTarget.value?.kind === 'paragraph'
            ? '提交本段'
            : '提交原答'
);
const composerPlaceholder = computed(() => {
  if (!coach.value)
    return entryMode.value === 'question'
      ? '写下这次的问题'
      : usesModelIntake.value && learning.state.intake && !learning.state.intake.acceptedConversationId
        ? '写下你的回答'
        : '写下你的学习目标';
  if (learning.active.stopped) return '带练已暂停，可在上方继续';
  if (!coach.value.profile && profileStep.value < 3) return '请先完成上方选择';
  if (!answerTarget.value) return '请先完成上方当前步骤';
  return answerTarget.value.kind === 'foundation' ? '写下目前的基础或困难（选填）' : composerLabel.value;
});
const usesModelIntake = computed(
  () =>
    !learning.active &&
    entryMode.value !== 'question' &&
    (!DEV_TEST ||
      learning.modelIntakeContract === MODEL_INTAKE_V2_CONTRACT ||
      learning.state.intake?.contract === MODEL_INTAKE_V2_CONTRACT)
);
const coachModelFeedbackState = computed(() => {
  const state = learning.retryState;
  if (usesModelIntake.value && ['recoverModelIntake', 'restartModelIntake'].includes(state?.operation)) return;
  return state;
});
const composerDraft = computed({
  get: () => (answerTarget.value?.kind === 'foundation' ? profile.foundation : coach.value ? answer.value : goal.value),
  set: (value) => {
    if (answerTarget.value?.kind === 'foundation') profile.foundation = value;
    else if (coach.value) answer.value = value;
    else goal.value = value;
  }
});
async function submitComposer() {
  const input = composerDraft.value.trim();
  const display = presentation.command(input, { answering: Boolean(answerTarget.value) });
  if (display) {
    if (display.success && composerDraft.value.trim() === input) composerDraft.value = '';
    toast.info(t(display.success ? 'presentation.saved' : 'presentation.failed'));
    return;
  }
  if (learning.busy || learning.intakeBusy) return;
  if (!coach.value) {
    const input = goal.value.trim();
    if (!input) return;
    permissionRequested.value = true;
    const submittedDraft = draftBinding;
    const previousConversation = learning.selectedConversationId;
    if (entryMode.value === 'question') {
      if (!learning.singleQuestionAvailable) {
        modelFailure.value = { error: 'UNSUPPORTED' };
        return;
      }
      if (!learning.modelId) {
        modelFailure.value = { error: 'NEEDS_CONNECTION' };
        return;
      }
      if (!learning.sharingAllowed) {
        modelFailure.value = { error: 'CONSENT_REQUIRED' };
        return;
      }
      emit('general', { questionOnly: true, input });
      if (learning.selectedConversationId && learning.selectedConversationId !== previousConversation)
        drafts.remove(submittedDraft.context, submittedDraft.key);
      return;
    }
    if (usesModelIntake.value) {
      const result = await intakePanel.value?.submitDraft();
      if (
        draftAlive &&
        submittedDraft === draftBinding &&
        submittedDraft.context === learning.recordContext() &&
        result?.success &&
        goal.value.trim() === input
      )
        goal.value = '';
      return;
    }
    emit('general', input);
    if (learning.selectedConversationId && learning.selectedConversationId !== previousConversation)
      drafts.remove(submittedDraft.context, submittedDraft.key);
    goal.value = '';
    return;
  }
  const target = answerTarget.value;
  if (target?.kind === 'foundation') saveProfile(false);
  else if (target?.kind === 'diagnostic' || target?.kind === 'training')
    submitCard(target.card, target.kind === 'diagnostic');
  else if (target?.kind === 'review') review();
  else if (target?.kind === 'paragraph' || target?.kind === 'rewrite') saveParagraph(target.kind === 'rewrite');
}
const configuredPrice = Number(import.meta.env.VITE_TRIAL_MONTHLY_PRICE || 19);
const trialPrice =
  Number.isFinite(configuredPrice) && configuredPrice >= 0 && configuredPrice <= 10000 ? configuredPrice : 19;
const surveyDue = computed(
  () =>
    coach.value?.profile &&
    !learning.state.conversations.some((c) => c.coach?.survey) &&
    Date.parse(today.value) -
      Math.min(...learning.state.conversations.filter((c) => c.coach).map((c) => Date.parse(c.coach.startedDay))) >=
      6 * 86400000
);
const calendar = learning.observeCalendar();
calendar.show();
onUnmounted(() => calendar.dispose());
const drafts = workspaceDrafts(learning);
const recallDraftKey = computed(() =>
  dueItem.value && phraseRecall.value
    ? `coach:recall:${learning.selectedConversationId}:${dueItem.value.id}:${dueItem.value.due}`
    : null
);
watch(
  () => [learning.state.owner, recallDraftKey.value],
  ([, key]) => {
    // Session reads may refresh reactive records. Keep them out of the watcher getter.
    const context = learning.recordContext();
    referenceShown.value = Boolean(key && drafts.read(context, key).referenceShown);
  },
  { immediate: true }
);
function showReviewReference() {
  if (!recallDraftKey.value) return;
  drafts.save(learning.recordContext(), recallDraftKey.value, { referenceShown: true });
  referenceShown.value = true;
}
let draftBinding;
let draftAlive = true;
let restoringDraft = false;
function saveDraft() {
  if (draftAlive && !restoringDraft && draftBinding && draftBinding.context === learning.recordContext())
    drafts.save(draftBinding.context, draftBinding.key, {
      answer: answer.value,
      goal: goal.value,
      entryMode: entryMode.value,
      analysis: { ...analysis },
      profile: { ...profile, subjects: [...profile.subjects] },
      step: profileStep.value
    });
}
watch(
  () => [learning.recordContext(), learning.selectedConversationId, learningDay.value],
  ([context, id, day]) => {
    saveDraft();
    openedSource.value = null;
    restoringDraft = true;
    draftBinding = { context, key: `coach:${id || 'new'}:${day}` };
    const saved = drafts.read(context, draftBinding.key);
    answer.value = saved.answer || '';
    goal.value = saved.goal || '';
    entryMode.value = saved.entryMode === 'question' ? 'question' : 'study';
    for (const field of analysisFields) analysis[field.key] = saved.analysis?.[field.key] || '';
    message.value = '';
    resetProfileDraft();
    if (saved.profile) Object.assign(profile, saved.profile, { subjects: [...saved.profile.subjects] });
    else if (coach.value) {
      profile.subject =
        subjectCoachMethod(coach.value.profile?.exam, coach.value.profile?.methodContract)?.subjectId ||
        (coachUsesMaterials(coach.value) ? 'kaoyan_major' : 'kaoyan_english');
      profile.exam =
        coach.value.profile?.exam ||
        (/英语二|english\s*2/i.test(learning.active.goal)
          ? 'english2'
          : /英语一|english\s*1/i.test(learning.active.goal)
            ? 'english1'
            : '');
      const known = learning.coachProfileDraft || {};
      if (known.exam) profile.exam = known.exam;
      if (known.minutes) profile.minutes = String(known.minutes);
      if (known.deadline) {
        profile.deadline = known.deadline;
        profile.deadlineBucket = 'other';
      }
      if (DEV_TEST) {
        const input = learning.active.goal;
        if (/英语一|english\s*1/i.test(input) && /英语二|english\s*2/i.test(input)) profile.exam = '';
        const deadlines = [...input.matchAll(/(今年|明年)\s*(?:12|十二)\s*月/g)];
        if (!known.deadline)
          profile.deadlineBucket = deadlines.length === 1 ? (deadlines[0][1] === '今年' ? 'this' : 'next') : '';
        const minutes = input.match(/(?:每天|每日)\s*(?:能|可以|可|有)?\s*(?:学习|学)?\s*(\d{1,2})\s*分钟/);
        if (!known.minutes)
          profile.minutes =
            minutes && Number(minutes[1]) >= 10 && Number(minutes[1]) <= 90 && !/分钟\s*(?:或者?|还是)/.test(input)
              ? String(Number(minutes[1]))
              : '';
      }
    }
    profileStep.value = Math.min(3, saved.step || 0);
    if (!saved.profile) skipKnownProfileSteps();
    showMaterials.value = props.materialsOpen;
    materialSelection.value = [];
    restoringDraft = false;
  },
  { immediate: true, flush: 'sync' }
);
watch([answer, goal, entryMode, analysis, profile, profileStep], saveDraft, { deep: true, flush: 'sync' });
onBeforeUnmount(() => {
  stopLearningFeedback();
  saveDraft();
  draftAlive = false;
});
async function revealCurrentTurn() {
  await nextTick();
  // #ifdef H5
  if (!learning.locatedRecord && typeof document !== 'undefined')
    if (document.querySelector('.space-content')?.dataset.followLatest !== 'false')
      document.getElementById('coach-current-turn')?.scrollIntoView?.({ block: 'end' });
  // #endif
}
// The student's own submit or continue always shows what comes next, wherever they had scrolled.
async function revealAfterStudentAction() {
  await nextTick();
  // #ifdef H5
  if (!learning.locatedRecord && typeof document !== 'undefined')
    document.getElementById('coach-current-turn')?.scrollIntoView?.({ block: 'start' });
  // #endif
}
onMounted(revealCurrentTurn);
watch([() => savedPractice.value.length, () => coach.value?.profile], revealCurrentTurn);
async function act(action) {
  const context = learning.recordContext(),
    previous = learning.reply?.operationId;
  const beforeFeedback = learning.state;
  let operation;
  const current = () =>
    context === learning.recordContext() &&
    (!operation || (learning.reply?.operationId === operation && !learning.reply.cancelled));
  message.value = '';
  try {
    modelFailure.value = null;
    const pending = action();
    operation = learning.reply?.operationId !== previous ? learning.reply?.operationId : null;
    const submittedState = learning.state;
    const submissionFeedback = savedLearningFeedback(beforeFeedback, submittedState);
    if (submissionFeedback) {
      await nextTick();
      if (current()) playLearningFeedback(submissionFeedback, shell.value);
    }
    const result = await pending;
    if (!current()) return result;
    if (result?.success === false) {
      modelFailure.value = result;
      await nextTick();
      if (!current()) return result;
      playLearningFeedback(
        ['CONSENT_REQUIRED', 'NEEDS_CONNECTION'].includes(result.error) ? 'warning' : 'error',
        shell.value
      );
    } else {
      await nextTick();
      if (!current()) return result;
      playLearningFeedback(savedLearningFeedback(submittedState, learning.state), shell.value);
    }
    return result;
  } catch (error) {
    if (!current()) return;
    modelFailure.value = { error: error.code || 'MODEL_FAILED' };
    message.value = modelErrorPresentation(modelFailure.value).message;
    await nextTick();
    if (!current()) return;
    playLearningFeedback(
      ['CONSENT_REQUIRED', 'NEEDS_CONNECTION'].includes(error.code) ? 'warning' : 'error',
      shell.value
    );
    if (DEV_TEST) {
      await nextTick();
      if (typeof document !== 'undefined')
        document.getElementById('coach-action-error')?.scrollIntoView?.({ block: 'nearest' });
    }
  }
}
function acceptedProfile(conversation) {
  if (!draftAlive) return;
  drafts.remove(learning.recordContext(), `coach:new:${today.value}`);
  goal.value = '';
  if (!conversation.coach) emit('general', { conversationId: conversation.id });
}
// 草稿随会话结束回到种子：新一轮不继承上一轮的选择。
watch(
  () => coach.value?.id ?? null,
  (id) => {
    if (id === null) resetProfileDraft();
  }
);
function newSession() {
  if (learning.busy) return;
  learning.selectedConversationId = null;
}
function pauseLearning() {
  act(() => {
    if (learning.busy) learning.cancel();
    learning.commit('task.stop', { conversationId: learning.active.id });
  });
}
const coachTurnOptions = computed(() => [
  { value: 'change_method', label: t('muse.turnChange') },
  { value: 'hint_only', label: t('muse.turnHint') },
  { value: 'pause', label: t('muse.turnPause') }
]);
function applyCoachTurnAction(action) {
  if (action === 'pause') return pauseLearning();
  return act(() => learning.dispatchLearningAction({ type: action }));
}
function saveProfile(skip) {
  act(() =>
    learning.coachSave('profile', {
      profile: skip
        ? resolveSkippedProfile(profile)
        : {
            exam: profile.exam || null,
            deadline: profile.deadline || null,
            deadlineBucket: ['this', 'next'].includes(profile.deadlineBucket) ? profile.deadlineBucket : null,
            minutes: profile.minutes ? Number(profile.minutes) : null,
            foundation: profile.foundation || null,
            subjects: [...profile.subjects, profile.subject].filter(Boolean),
            track:
              subjectMethod.value?.track ||
              (profile.subject === 'kaoyan_major' ? COACH_MATERIAL_TRACK : 'kaoyan-english-writing'),
            ...(subjectMethod.value ? { methodContract: subjectMethod.value.contract } : {})
          }
    })
  );
}
function pendingCoachRequest(phase, target = phase) {
  return coach.value?.requests.find(
    (item) =>
      item.status === 'pending' &&
      item.request.phase === phase &&
      item.request.target === target &&
      item.request.day === (['diagnostic', 'daily'].includes(phase) ? today.value : learningDay.value)
  );
}
function requestDisabled(phase, target = phase) {
  return learning.busy || !loggedIn.value || (!pendingCoachRequest(phase, target) && !learning.sharingAllowed);
}
function handleModelAction(action) {
  if (action.type === 'open_connectors' || action.type === 'manual_model') return openConnections();
  const pending = coach.value?.requests.findLast((item) => item.status === 'pending');
  const previous = pending || coach.value?.requests.at(-1);
  if (!previous) return;
  if (pending || action.type === 'retry')
    return act(() =>
      learning.requestCoach(
        previous.request.phase,
        previous.request.target,
        pending || ['feedback', 'essay'].includes(previous.request.phase) ? previous.id : null
      )
    );
}
function requestLabel(phase, target = phase, label = '开始摸底') {
  if (learning.busy) return '正在生成…';
  return coach.value?.requests.some(
    (r) =>
      r.status === 'pending' &&
      r.request.day === (['diagnostic', 'daily'].includes(phase) ? today.value : learningDay.value) &&
      r.request.phase === phase &&
      r.request.target === target
  )
    ? '查询原请求结果'
    : label;
}
function request(phase, target = phase) {
  // 提取未完成时并发开始模型请求，会让刚写入的资料无法绑定，因此两个方向都拦住。
  if (fileBusy.value) {
    message.value = '正在提取资料，请稍候再开始';
    return;
  }
  return act(async () => {
    if (phase === 'essay' && canSubmitWriting.value) {
      learning.coachSave('essaySubmit');
      if (!loggedIn.value || !learning.sharingAllowed) return;
    }
    return learning.requestCoach(phase, target);
  });
}
function submitCard(card, diagnostic) {
  act(async () => {
    learning.coachSave('answer', {
      target: diagnostic ? 'diagnostic' : 'daily',
      cardId: card.id,
      answer: answer.value
    });
    answer.value = '';
    revealAfterStudentAction();
    if (loggedIn.value && learning.sharingAllowed) {
      if (!diagnostic) await learning.requestCoach('feedback', `card-${card.id}`);
      else if (coach.value.diagnostic.answers.length === coach.value.diagnostic.cards.length)
        await learning.requestCoach('feedback', 'diagnostic');
    }
  });
}
function saveAnalysis() {
  act(() => learning.coachSave('analysis', { fields: { ...analysis } }));
}
function saveParagraph(rewrite) {
  act(() => {
    learning.coachSave('paragraph', {
      index: paragraphIndex.value,
      rewrite,
      text: answer.value,
      authorship: 'user_typed'
    });
    answer.value = '';
  });
}
function review() {
  const context = learning.recordContext(),
    conversationId = learning.selectedConversationId,
    item = dueItem.value,
    key = recallDraftKey.value,
    draftKey = draftBinding?.key,
    submitted = answer.value,
    shown = referenceShown.value;
  if (!item) return;
  return act(async () => {
    await learning.coachReview(item.id, submitted, phraseRecall.value ? { referenceShown: shown } : undefined);
    if (context !== learning.recordContext() || conversationId !== learning.selectedConversationId) return;
    if (key) drafts.remove(context, key);
    if (draftKey === draftBinding?.key && answer.value === submitted) answer.value = '';
  });
}
const composerAttachments = ['text', 'library'];
// #ifdef H5
composerAttachments.unshift('file');
// #endif
async function openComposerAttachment(action) {
  if (action === 'library') return safeNavigateTo(SHELL_ROUTES.materials);
  materialEntry.value = action;
  showMaterials.value = true;
  // #ifdef H5
  await nextTick();
  const dialog = document.querySelector('.coach-material-dialog');
  if (action === 'file') dialog?.querySelector('.coach-file-input')?.click();
  // #endif
}
function toggleMaterial(id) {
  materialSelection.value = materialSelection.value.includes(id)
    ? materialSelection.value.filter((value) => value !== id)
    : [...materialSelection.value, id];
}
function readMaterial(id) {
  showMaterials.value = false;
  openedSource.value = { id, materialId: id };
}
function useMaterials() {
  if (fileBusy.value || learning.busy || !coach.value?.profile) return;
  act(() => {
    for (const materialId of materialSelection.value) learning.coachSave('material', { materialId });
    materialSelection.value = [];
    showMaterials.value = false;
  });
}
function bindMaterial(material) {
  // 保存与绑定由 store 一次完成：忙碌时整笔不写，不会留下未绑定的资料。
  learning.attachMaterial(material);
  showMaterials.value = true;
}
function pasteMaterial() {
  act(() => {
    learning.attachText(materialText.value);
    materialText.value = '';
  });
}
async function pickFile(event) {
  const file = event.target?.files?.[0];
  if (!file) return;
  const context = learning.recordContext(),
    id = learning.active.id;
  fileBusy.value = true;
  await act(async () => {
    const material = await readWritingMaterial(file, learningId('material'));
    if (context !== learning.recordContext() || id !== learning.active?.id)
      throw new Error('当前目标已变化，请重新选择资料');
    if (learning.busy) throw new Error('提取已完成，但正在生成反馈；请稍后重新选择该文件');
    bindMaterial(material);
    message.value = '资料已保存到当前目标，提取文字未离开设备';
  });
  fileBusy.value = false;
  event.target.value = '';
}
function openConnections() {
  safeNavigateTo(learning.openModelConnector().route);
}
function login() {
  uni.navigateTo({ url: '/pages/login/index' });
}
</script>
<style scoped>
.coach-turn-actions {
  display: flex;
  justify-content: flex-end;
}
.coach-connection-label {
  max-width: 250px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}
@media (max-width: 760px) {
  .coach-connection-label {
    max-width: 136px;
  }
}

.coach-workspace {
  width: 100%;
  max-width: 768px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  padding: 0 24px 20px;
}
.coach-workspace--text :deep(.base-card) {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}
.coach-session-state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}
.coach-session-state :deep(.stream-preview),
.coach-session-state .reply-state {
  margin: 0;
}
.coach-workspace :deep(.base-card__body) {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 16px;
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  padding: 20px;
}
.coach-workspace :deep(.base-field),
.coach-workspace :deep(.base-options),
.coach-workspace :deep(.base-segmented) {
  width: 100%;
}
.coach-intake {
  max-width: 680px;
}
.coach-agent-message {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 22px;
  background: var(--paper);
  width: fit-content;
  max-width: 100%;
}
.coach-history-turn {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding-block: 12px;
  border-top: 1px solid var(--line);
}
.coach-question {
  font-size: 16px;
  line-height: 22px;
}
.coach-intake :deep(.base-options) {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.coach-intake :deep(.base-option) {
  width: auto;
  min-height: 44px;
  padding: 8px 14px;
  border: 1px solid var(--line-strong);
  border-radius: 22px;
  background: var(--muse-raised);
}
.coach-intake :deep(.base-option[data-state='selected']) {
  border-color: var(--violet);
  background: var(--violet-soft);
}
.coach-intake :deep(.base-option__key),
.coach-intake :deep(.base-option__status) {
  display: none;
}
/* 建档卡只留一个强调动作：继续/保存为实底，上一步与跳过退为中性文字。 */
.coach-intake .coach-actions :deep(.base-button--quiet:not([disabled])) {
  color: var(--ink-2);
}
.coach-intake .coach-actions :deep(.base-button--quiet:not([disabled]):hover) {
  background: var(--muse-raised);
  color: var(--ink);
}
.coach-intake :deep(.base-segmented button[aria-selected='true']) {
  background: var(--violet-soft);
  color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--violet);
}
.coach-user-message {
  align-self: flex-end;
  max-width: 78%;
  padding: 11px 15px;
  min-height: 44px;
  border-radius: 22px;
  color: var(--muse-user-ink);
  background: var(--muse-user);
  font-size: 16px;
  line-height: 26px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
/* On a phone a card takes the full content width; plain replies keep the kitten column. */
@media (max-width: 760px) {
  .coach-card-turn :deep(.base-bubble__avatar) {
    display: none;
  }
  .coach-card-turn :deep(.base-bubble__row) {
    gap: 0;
  }
  .coach-card-turn :deep(.base-bubble__body) {
    width: 100%;
    max-width: 100%;
  }
}
/* WeChat-style agent turns: one kitten per turn, the cards stacked beside it. */
.coach-agent-turn :deep(.base-bubble__content) {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  white-space: normal;
}
.coach-transcript,
.coach-history-turn,
.coach-current-turn {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.coach-history-turn {
  margin-bottom: 16px;
}
.coach-day-divider {
  align-self: center;
  color: var(--ink-3);
  font-size: 12px;
  line-height: 20px;
  margin: 16px 0;
}
.coach-title {
  display: block;
  font-size: 18px;
  line-height: 26px;
  font-weight: 600;
}
.coach-muted {
  display: block;
  font-size: 13px;
  line-height: 20px;
  color: var(--ink-3);
}
.coach-actions,
.coach-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.coach-stats > text {
  flex: 1 1 160px;
  font-size: 16px;
}
.coach-saved {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
}
.coach-pattern,
.coach-weakness {
  display: block;
  padding: 11px 15px;
  border-radius: 16px;
  background: var(--muse-raised);
}
.coach-file {
  position: relative;
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 8px;
  min-height: 44px;
  padding: 8px 16px;
  border-radius: 22px;
  background: var(--muse-raised);
  font-size: 14px;
  overflow: hidden;
  cursor: pointer;
}
.coach-file.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.coach-file:focus-within {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.coach-file :deep(.coach-file-input) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: inherit;
}
@media (max-width: 760px) {
  .coach-workspace {
    padding-inline: 0;
  }
  .coach-workspace :deep(.base-card__body) {
    padding: 16px;
  }
  .coach-actions {
    gap: 4px;
  }
  .coach-actions :deep(button) {
    padding-inline: 12px;
  }
}
.coach-material-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: left;
  max-height: 65vh;
  overflow: auto;
}
.coach-corpus-control,
.coach-corpus-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}
.coach-corpus-item {
  overflow-wrap: anywhere;
}
.coach-material-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.coach-material-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
</style>
