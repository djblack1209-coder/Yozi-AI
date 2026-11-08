<template>
  <BaseCard ref="root" class="learning-lab panel" padding="none">
    <BaseButton class="lab-heading" :aria-expanded="opened" variant="quiet" @tap="toggleOpened">
      <text class="section-title">{{ t('learning.kr6') }}</text>
      <BaseIcon :name="opened ? 'chevron-up' : 'sparkles'" tone="ink-3" />
    </BaseButton>
    <view v-if="opened" class="lab-content">
      <BaseSegmented
        :model-value="tab"
        :label="t('learning.exploreMode')"
        :options="tabs.map((item) => ({ value: item.id, label: learningText(item.label) }))"
        @update:model-value="chooseTab"
      />
      <view v-if="pendingVisual" class="lab-tabs">
        <BaseButton
          :disabled="stopped || busy"
          :aria-disabled="stopped || busy"
          variant="quiet"
          @tap="applyRequestedVisual(true)"
          >{{ t('learning.k17') }}</BaseButton
        >
      </view>
      <text v-if="stopped" class="subtle">{{ t('learning.keb') }}</text>
      <template v-if="tab === 'visual'">
        <view v-if="!diagramEditing" class="lab-tabs" :aria-label="t('learning.kl2')">
          <BaseChip
            v-for="item in visualExamples"
            :key="item.template"
            :disabled="stopped || busy"
            :aria-disabled="stopped || busy"
            :model-value="recipe.template === item.template"
            @update:model-value="chooseExample(item.template)"
          >
            {{ learningText(item.label) }}
          </BaseChip>
        </view>
        <DiagramConditions
          :state="state"
          :question="question"
          :conversation-id="conversationId"
          :context="context"
          :stopped="stopped"
          :busy="busy"
          :record-help="recordDiagramHelp"
          :reset-key="exampleVersion"
          @confirm="adoptDiagram"
          @invalidate="clearDiagram"
          @editing="diagramEditing = $event"
          @reading="
            pause();
            showVideo = false;
          "
        />
        <BaseEmpty
          v-if="contextRecipeError && !manualRecipe"
          state="error"
          :title="learningText(contextRecipeError)"
          mascot-size="small"
        />
        <template v-if="!diagramEditing && (!contextRecipeError || manualRecipe)">
          <text v-if="!manualRecipe" class="subtle">{{ t('learning.k5j') }}</text>
          <template v-if="graphRecipe">
            <VelocityTimeGraph :points="recipe.points" :step="step" :visible="visible" />
            <text class="scene-readout"
              >{{ t('learning.kgr') }}{{ physicsNumber(frame.time) }} s / {{ recipe.physicalSeconds }} s</text
            >
            <text v-if="step > 0" class="subtle"
              >{{ t('learning.ktz') }}{{ learningText(exactMotionText(frame.exact.velocity)) }} m/s</text
            >
          </template>
          <template v-else-if="forceRecipe">
            <text v-if="movingRecipe" class="subtle">{{ t('learning.kea') }}{{ recipe.initialVelocityMps }} m/s</text>
            <text v-else class="subtle"
              >{{ t('learning.koy') }}{{ recipe.netForceN }} N{{
                recipe.netForceN ? t('learning.kns', { v0: side }) : ''
              }}</text
            >
            <text v-if="movingRecipe" class="subtle">{{ learningText(motionConditions) }}</text>
            <view
              v-for="(mass, index) in energyRecipe ? [recipe.massKg] : [recipe.massKg, recipe.massKg * 2]"
              :key="index"
              class="force-lane"
            >
              <text class="lane-label">{{ mass }} kg</text>
              <view
                class="force-track"
                role="img"
                :aria-label="
                  t('learning.k98', {
                    v0: mass,
                    v1: physicsNumber(frame.time),
                    v2: physicsNumber(index ? frame.comparisonPosition : frame.position)
                  })
                "
              >
                <view class="force-axis" />
                <image
                  class="force-character"
                  :src="mascotFrames['00-reference-front']"
                  mode="aspectFit"
                  :style="{ left: forcePosition(index ? frame.comparisonPosition : frame.position) }"
                />
                <template v-if="movingRecipe">
                  <text v-if="motionOriginLabel" class="force-origin" :style="{ left: forcePosition(0) }">0</text>
                  <text v-if="step > 0" class="force-start">{{ physicsNumber(frame.minimum) }} m</text>
                  <text v-if="step > 0" class="force-end">{{ physicsNumber(frame.maximum) }} m</text>
                </template>
                <text v-else class="force-start" :class="{ leftward: recipe.direction === 'left' }">0 m</text>
                <text
                  v-if="!movingRecipe && step > 0"
                  class="force-end"
                  :class="{ leftward: recipe.direction === 'left' }"
                  >{{ recipe.direction === 'left' ? '-' : '' }}{{ number(frame.extent) }} m</text
                >
              </view>
              <text v-if="frame.step > 0 && movingRecipe" class="subtle"
                >{{ t('learning.ktz') }}{{ physicsNumber(index ? frame.comparisonSpeed : frame.speed)
                }}{{ t('learning.khp')
                }}{{ physicsNumber(index ? frame.comparisonAcceleration : frame.acceleration) }} m/s²</text
              >
              <text v-else-if="frame.step > 0" class="subtle"
                >{{ t('learning.kj8')
                }}{{ physicsNumber(Math.abs(index ? frame.comparisonAcceleration : frame.acceleration)) }} m/s²{{
                  recipe.netForceN ? t('learning.kns', { v0: side }) : ''
                }}</text
              >
              <text v-if="frame.step > 0 && movingRecipe" class="subtle"
                >{{ t('learning.kim') }}{{ physicsNumber(index ? frame.comparisonDistance : frame.distance)
                }}{{ t('learning.ktr') }}{{ physicsNumber(index ? frame.comparisonPosition : frame.position) }} m</text
              >
            </view>
            <text class="scene-readout"
              >{{ t('learning.kgr') }}{{ physicsNumber(frame.time) }} s / {{ recipe.physicalSeconds }} s</text
            >
            <view v-if="energyRecipe" class="energy-readout" :aria-label="t('learning.ku')">
              <text class="subtle">{{ t('learning.k5d') }}</text>
              <view
                v-for="item in [
                  { key: 'initialKinetic', label: '初动能' },
                  { key: 'finalKinetic', label: '当前动能' }
                ]"
                :key="item.key"
                class="energy-lane"
              >
                <text>{{ learningText(item.label) }} {{ learningText(exactMotionText(frame.exact[item.key])) }} J</text>
                <view
                  class="energy-track"
                  :aria-label="t('learning.k12', { v0: item.label, v1: exactMotionText(frame.exact[item.key]) })"
                  role="img"
                >
                  <view
                    class="energy-bar"
                    :class="{ current: item.key === 'finalKinetic' }"
                    :style="{ width: `${(100 * frame[item.key]) / frame.energyMaximum}%` }"
                  />
                </view>
              </view>
              <view class="scene-readout"
                ><text>{{ t('learning.k90') }}{{ learningText(exactMotionText(frame.exact.work)) }} J</text
                ><text
                  >{{ t('learning.kjb') }}{{ learningText(exactMotionText(frame.exact.kineticChange)) }} J</text
                ></view
              >
              <text class="subtle">{{ t('learning.ksn') }}</text>
              <!-- #ifdef H5 --><a
                class="writing-source"
                :href="ENERGY_BASIS.url"
                target="_blank"
                rel="noopener noreferrer"
                >{{ t('learning.k6n') }}</a
              ><!-- #endif -->
              <!-- #ifndef H5 --><text class="reference-credit" selectable>{{ ENERGY_BASIS.url }}</text><!-- #endif -->
            </view>
          </template>
          <template v-else>
            <text class="subtle"
              >{{ t('learning.kde') }}{{ side }} {{ recipe.outward }}{{ t('learning.k1s')
              }}{{ side === t('learning.kgd') ? t('learning.kqs') : t('learning.kgd') }} {{ recipe.backward
              }}{{ t('learning.kt9') }}</text
            >
            <view
              class="scene"
              role="img"
              :aria-label="t('learning.kqz', { v0: frame.step, v1: number(frame.distance), v2: displacementText })"
            >
              <view class="scene-axis" />
              <view
                class="scene-trail"
                :style="{
                  width: `${(84 * Math.min(frame.distance, recipe.outward)) / recipe.outward}%`,
                  left:
                    recipe.direction === 'left'
                      ? `${92 - (84 * Math.min(frame.distance, recipe.outward)) / recipe.outward}%`
                      : '8%'
                }"
              />
              <image
                class="scene-character"
                :src="mascotFrames['00-reference-front']"
                mode="aspectFit"
                :style="{
                  left: `${recipe.direction === 'left' ? 92 - (84 * frame.position) / recipe.outward : 8 + (84 * frame.position) / recipe.outward}%`
                }"
              />
              <text class="scene-start" :class="{ 'mirrored-start': recipe.direction === 'left' }">{{
                t('learning.kj4')
              }}</text
              ><text class="scene-turn" :class="{ 'mirrored-turn': recipe.direction === 'left' }"
                >{{ recipe.direction === 'left' ? '-' : '' }}{{ recipe.outward }}{{ t('learning.kt9') }}</text
              >
            </view>
            <view class="scene-readout"
              ><text>{{ t('learning.kim') }}{{ number(frame.distance) }} m</text
              ><text>{{ t('learning.k6t') }}{{ learningText(displacementText) }}</text></view
            >
          </template>
          <text v-if="!prediction" class="lab-prompt">{{
            graphRecipe
              ? t('learning.ket')
              : energyRecipe
                ? t('learning.kn4')
                : motionRecipe
                  ? t('learning.k4m')
                  : forceRecipe
                    ? t('learning.krx')
                    : t('learning.k11')
          }}</text>
          <view v-if="!prediction" class="lab-tabs">
            <BaseButton
              :disabled="stopped || busy"
              :aria-disabled="stopped || busy"
              variant="quiet"
              @tap="prediction = 'same'"
            >
              {{
                energyRecipe
                  ? t('learning.k6h')
                  : motionRecipe
                    ? t('learning.k2e')
                    : forceRecipe
                      ? t('learning.k7y')
                      : t('learning.k9o')
              }}
            </BaseButton>
            <BaseButton
              :disabled="stopped || busy"
              :aria-disabled="stopped || busy"
              variant="quiet"
              @tap="prediction = 'different'"
            >
              {{
                energyRecipe
                  ? t('learning.kac')
                  : motionRecipe
                    ? t('learning.ksu')
                    : forceRecipe
                      ? t('learning.kg3')
                      : t('learning.kaw')
              }}
            </BaseButton>
          </view>
          <view class="lab-tabs">
            <BaseButton
              class="primary"
              :disabled="stopped || busy || !prediction || frame.complete"
              :aria-disabled="stopped || busy || !prediction || frame.complete"
              variant="primary"
              @tap="togglePlayback"
            >
              {{ playing ? t('learning.kio') : reducedMotion ? t('learning.khx') : t('learning.kry') }}
            </BaseButton>
            <BaseButton
              :disabled="stopped || busy || !prediction || frame.complete"
              :aria-disabled="stopped || busy || !prediction || frame.complete"
              variant="quiet"
              @tap="nextFrame"
              >{{ t('learning.ksk') }}</BaseButton
            >
            <BaseButton variant="quiet" @tap="resetVisual">{{ t('learning.kt4') }}</BaseButton>
          </view>
          <BaseEmpty v-if="visualError" state="error" :title="learningText(visualError)" mascot-size="small" />
          <text v-if="frame.complete && graphRecipe" class="lab-feedback" role="status">
            {{ prediction === (motionTurned ? 'different' : 'same') ? t('learning.k4x') : t('learning.kf6')
            }}{{ t('learning.klf') }}{{ learningText(exactMotionText(frame.exact.positiveArea)) }}{{ t('learning.krb')
            }}{{ learningText(exactMotionText(frame.exact.negativeArea)) }}{{ t('learning.khf')
            }}{{ learningText(exactMotionText(frame.exact.distance)) }}{{ t('learning.kih')
            }}{{ learningText(exactMotionText(frame.exact.displacement)) }}{{ t('learning.k64') }}</text
          >
          <text v-else-if="frame.complete && motionRecipe" class="lab-feedback" role="status">
            {{ prediction === (motionTurned ? 'different' : 'same') ? t('learning.k4x') : t('learning.kf6')
            }}{{ t('learning.k9m') }}{{ learningText(exactMotionText(frame.exact.distance)) }}{{ t('learning.kih')
            }}{{ learningText(exactMotionText(frame.exact.displacement)) }} m。
            {{ motionTurned ? t('learning.kty') : t('learning.k2j') }}
            {{ motionZeroForce ? t('learning.ksx') : t('learning.knp') }}
          </text>
          <text v-else-if="frame.complete && energyRecipe" class="lab-feedback" role="status">
            {{
              prediction === (frame.exact.kineticChange[0] > 0 ? 'different' : 'same')
                ? t('learning.k4x')
                : t('learning.kf6')
            }}{{ t('learning.k90') }}{{ learningText(exactMotionText(frame.exact.work)) }}{{ t('learning.kp8')
            }}{{
              frame.exact.kineticChange[0] > 0
                ? t('learning.kbk')
                : frame.exact.kineticChange[0] < 0
                  ? t('learning.kv8')
                  : t('learning.k7y')
            }}。
          </text>
          <text v-else-if="frame.complete && forceRecipe" class="lab-feedback" role="status">
            {{ prediction === (recipe.netForceN ? 'different' : 'same') ? t('learning.k4x') : t('learning.kf6') }}
            {{ recipe.netForceN ? t('learning.kue') : t('learning.k16') }}{{ t('learning.koi') }}</text
          >
          <text v-else-if="frame.complete" class="lab-feedback" role="status"
            >{{ prediction === (recipe.backward ? 'different' : 'same') ? t('learning.khi') : t('learning.kf6')
            }}{{ t('learning.kim') }}{{ recipe.outward + recipe.backward }}{{ t('learning.k7l')
            }}{{ learningText(displacementText) }}{{ t('learning.kj')
            }}{{ recipe.backward ? t('learning.klm') : t('learning.kn9') }}。</text
          >
          <BaseButton
            v-if="frame.complete"
            class="primary"
            :disabled="stopped || busy"
            :aria-disabled="stopped || busy"
            variant="primary"
            @tap="requestScience"
            >{{ t('learning.ko1') }}</BaseButton
          >
          <BaseButton
            v-if="
              recipe.template === 'distance_displacement' &&
              recipe.direction !== 'left' &&
              recipe.outward === 6 &&
              recipe.backward === 4
            "
            :disabled="stopped"
            :aria-disabled="stopped"
            :aria-expanded="showVideo"
            variant="quiet"
            @tap="toggleVisualVideo"
          >
            {{ showVideo ? t('learning.kij') : t('learning.k21') }}
          </BaseButton>
          <video
            v-if="showVideo && !stopped"
            class="scene-video"
            :src="visualVideo"
            :autoplay="false"
            :controls="true"
            :show-mute-btn="true"
          ></video>
        </template>
      </template>
      <template v-else-if="tab === 'writing'">
        <view class="lab-tabs" :aria-label="t('learning.k5a')"
          ><BaseChip
            v-for="genre in WRITING_GENRES"
            :key="genre.id"
            :class="{ selected: genre.id === writingGenreId }"
            :disabled="stopped || busy"
            :aria-disabled="stopped || busy"
            :model-value="genre.id === writingGenreId"
            @update:model-value="chooseWritingGenre(genre.id)"
          >
            {{ learningText(genre.label) }}
          </BaseChip></view
        ><BaseButton
          v-if="!writingBound"
          class="primary"
          :disabled="stopped || busy"
          :aria-disabled="stopped || busy"
          variant="primary"
          @tap="$emit('writing', context, writingGenreId)"
          >{{ t('learning.kbl') }}</BaseButton
        >
        <template v-else>
          <view
            v-if="availableWritingReferences.length > 1 && readWritingReference"
            class="lab-tabs"
            :aria-label="t('learning.kx')"
          >
            <BaseChip
              v-for="reference in availableWritingReferences"
              :key="reference.id"
              :class="{ selected: reference.id === currentWritingReference?.id }"
              :disabled="stopped || busy"
              :aria-disabled="stopped || busy"
              :model-value="reference.id === currentWritingReference?.id"
              @update:model-value="chooseWritingReference(reference.id)"
            >
              {{ reference.selectionLabel || reference.title }}
            </BaseChip>
          </view>
          <BaseButton
            v-if="currentWritingReference && readWritingReference"
            :disabled="stopped || busy"
            :aria-disabled="stopped || busy"
            :aria-expanded="!!writingReference"
            aria-controls="public-writing-reference"
            variant="quiet"
            @tap="openWritingReference"
          >
            {{
              currentWritingReference.coverage === 'full_body'
                ? t('learning.kgo')
                : currentWritingReference.coverage === 'full_text'
                  ? t('learning.klb')
                  : currentWritingReference.coverage === 'full_work'
                    ? t('learning.k2b')
                    : writingGenreId === 'narrative'
                      ? t('learning.ks1')
                      : t('learning.kfz')
            }}
          </BaseButton>
          <view v-if="writingReference" id="public-writing-reference" class="public-writing-reference">
            <text class="lab-title">{{ t('learning.kpz') }}</text>
            <text class="reference-title" selectable>{{ writingReference.title }}</text>
            <text class="reference-excerpt" selectable>{{ writingReference.excerpt }}</text>
            <text class="reference-credit" selectable>
              {{ writingReference.copyright }} · {{ writingReference.author }}
              <template v-if="writingReference.coWritingCredit"
                >{{ t('learning.ki0') }}{{ writingReference.coWritingCredit }}</template
              >
            </text>
            <text class="reference-credit">{{ writingReference.publisher }} · {{ writingReference.published }}</text>
            <text class="reference-credit">{{ writingReference.changes }}</text>
            <text v-if="writingReference.versionNote" class="reference-credit">{{ writingReference.versionNote }}</text>
            <!-- #ifdef H5 -->
            <view class="reference-links">
              <a class="writing-source" :href="writingReference.url" target="_blank" rel="noopener noreferrer">{{
                t('learning.k8v')
              }}</a>
              <a class="writing-source" :href="writingReference.licenseUrl" target="_blank" rel="noopener noreferrer">{{
                writingReference.license
              }}</a>
            </view>
            <!-- #endif -->
            <!-- #ifndef H5 -->
            <text class="reference-credit" selectable>{{ writingReference.url }}</text>
            <text class="reference-credit" selectable
              >{{ writingReference.license }} · {{ writingReference.licenseUrl }}</text
            >
            <!-- #endif -->
            <text class="lab-title">{{ writingReference.noteAuthor }}{{ t('learning.k6x') }}</text>
            <text v-if="writingReference.notesLicense" class="reference-credit"
              >{{ t('learning.k2l') }}{{ writingReference.notesLicense }}</text
            >
            <view
              v-for="note in writingReference.notes"
              :key="note.paragraph ? `paragraph-${note.paragraph}` : note.sentence"
              class="reference-note"
            >
              <text>{{ writingReferenceNoteLocation(note) }} · {{ learningText(note.label) }}</text>
              <text>{{ note.text }}</text>
            </view>
            <view v-if="writingReference.teachingBasis" class="reference-note">
              <text
                >{{ t('learning.kqf') }}{{ writingReference.teachingBasis.printedPage }}{{ t('learning.ke1') }}</text
              >
              <text>{{ writingReference.teachingBasis.summary }}</text>
              <text class="reference-credit">{{ writingReference.teachingBasis.title }}{{ t('learning.khq') }}</text>
              <!-- #ifdef H5 -->
              <a
                class="writing-source"
                :href="writingReference.teachingBasis.url"
                target="_blank"
                rel="noopener noreferrer"
                >{{ t('learning.kap') }}</a
              >
              <!-- #endif -->
              <!-- #ifndef H5 -->
              <text class="reference-credit" selectable>{{ writingReference.teachingBasis.url }}</text>
              <!-- #endif -->
            </view>
            <BaseButton variant="quiet" @tap="writingReference = null">{{ t('learning.k9') }}</BaseButton>
          </view>
          <text class="subtle">{{ t('learning.k68') }}{{ writingIndex + 1 }} / {{ writingSteps.length }}</text>
          <view class="writing-progress" :style="{ gridTemplateColumns: `repeat(${writingSteps.length}, 1fr)` }"
            ><view
              v-for="(item, index) in writingSteps"
              :key="item.id"
              :class="{ current: index === writingIndex, done: index < writingIndex }"
              ><text>{{
                writingGenreId === 'notice'
                  ? [t('learning.kle'), t('learning.kgr'), t('learning.ksj'), t('learning.kgv')][index]
                  : item.label
              }}</text></view
            ></view
          >
          <text class="lab-prompt">{{ writingStep.prompt }}</text>
          <view class="word-list"
            ><BaseButton
              v-for="card in visibleWritingWords"
              :key="card.word"
              :disabled="stopped || busy"
              :aria-disabled="stopped || busy"
              variant="quiet"
              @tap="chooseWord(card)"
            >
              {{ card.word }}
            </BaseButton></view
          >
          <BaseButton
            v-if="foldedWords && !showAllWords"
            :disabled="stopped || busy"
            variant="quiet"
            @tap="showAllWords = true"
            >{{ t('learning.ka') }}</BaseButton
          >
          <view v-if="vocabularyQuestion" class="vocabulary-check">
            <text class="lab-prompt" selectable>{{ vocabularyQuestion.prompt }}</text>
            <view v-if="!vocabularyResult" class="vocabulary-options" role="group" :aria-label="t('learning.kch')">
              <BaseChip
                v-for="(option, index) in vocabularyQuestion.options"
                :key="option"
                :class="{ selected: vocabularyChoice === 'ABCD'[index] }"
                :disabled="stopped || busy"
                :aria-disabled="stopped || busy"
                :model-value="vocabularyChoice === 'ABCD'[index]"
                @update:model-value="vocabularyChoice = 'ABCD'[index]"
              >
                {{ learningText(option) }}
              </BaseChip>
            </view>
            <text v-if="vocabularyResult" class="lab-feedback" role="status" aria-live="polite">{{
              vocabularyResult
            }}</text>
            <view
              v-if="vocabularyResult && startVocabularyTask"
              class="lab-tabs"
              role="group"
              :aria-label="t('learning.ks8')"
            >
              <BaseChip
                v-for="interval in vocabularyDelayOptions"
                :key="interval.days"
                :class="{ selected: vocabularyDelayDays === interval.days }"
                :disabled="stopped || busy"
                :aria-disabled="stopped || busy"
                :model-value="vocabularyDelayDays === interval.days"
                @update:model-value="chooseVocabularyDelay(interval.days)"
              >
                {{ learningText(interval.label) }}
              </BaseChip>
            </view>
            <view class="lab-tabs">
              <BaseButton
                v-if="!vocabularyResult"
                class="primary"
                :disabled="stopped || busy || !vocabularyChoice"
                :aria-disabled="stopped || busy || !vocabularyChoice"
                variant="primary"
                @tap="confirmVocabulary"
                >{{ t('learning.kvf') }}</BaseButton
              >
              <BaseButton
                v-if="!vocabularyResult"
                :disabled="stopped || busy"
                :aria-disabled="stopped || busy"
                variant="quiet"
                @tap="wordHelp(vocabularyWord)"
                >{{ t('learning.k49') }}</BaseButton
              >
              <BaseButton
                v-else
                :disabled="stopped || busy"
                :aria-disabled="stopped || busy"
                variant="quiet"
                @tap="openWordCheck(vocabularyWord)"
                >{{ t('learning.kcx') }}</BaseButton
              >
              <BaseButton variant="quiet" @tap="clearVocabulary">{{ t('learning.kdi') }}</BaseButton>
              <BaseButton
                v-if="vocabularyResult && startVocabularyTask"
                :disabled="stopped || busy || !!vocabularyRetest"
                :aria-disabled="stopped || busy || !!vocabularyRetest"
                variant="quiet"
                @tap="wordTask('retest')"
              >
                {{
                  vocabularyRetest
                    ? t('learning.kf0', { v0: vocabularyRetest.day.slice(5).replace('-', '/') })
                    : vocabularyDelayDays === 1
                      ? t('learning.kix')
                      : t('learning.kf5', { v0: vocabularyDelayDays })
                }}
              </BaseButton>
              <BaseButton
                v-if="vocabularyResult && startVocabularyTask"
                :disabled="stopped || busy"
                :aria-disabled="stopped || busy"
                variant="quiet"
                @tap="wordTask('usage')"
                >{{ t('learning.kkm') }}</BaseButton
              >
            </view>
          </view>
          <text v-if="wordMessage" class="lab-feedback" role="status">{{ wordMessage }}</text>
          <BaseInput
            v-model="sentence"
            class="field sentence-input"
            :disabled="stopped || busy"
            :maxlength="writingDraftLimit(writingGenreId)"
            :placeholder="
              stopped
                ? t('learning.keb')
                : writingInParagraphs
                  ? writingIsChinese
                    ? t('learning.kh7')
                    : t('learning.kor')
                  : writingIsChinese
                    ? t('learning.k5o')
                    : t('learning.k5x')
            "
            :label="
              t('learning.ken', {
                v0: writingIndex + 1,
                v1: writingInParagraphs ? '段' : '句',
                v2: writingIsChinese ? '中文' : '英文'
              })
            "
            multiline
          />
          <BaseButton
            v-if="!scaffold"
            :disabled="stopped || busy"
            :aria-disabled="stopped || busy"
            variant="quiet"
            @tap="showScaffold"
          >
            {{ writingInParagraphs ? t('learning.klj') : t('learning.kr7') }}
          </BaseButton>
          <text v-else class="lab-feedback">{{ writingStep.scaffold }} · {{ writingStep.hint }}</text>
          <view class="lab-tabs">
            <BaseButton
              class="primary"
              :disabled="stopped || busy || !sentence.trim()"
              :aria-disabled="stopped || busy || !sentence.trim()"
              variant="primary"
              @tap="checkSentence"
            >
              {{ writingInParagraphs ? t('learning.khh') : t('learning.kc8') }}
            </BaseButton>
            <BaseButton
              v-if="feedback && (feedback.ready || feedback.kind === 'content') && !writingComplete"
              :disabled="stopped || busy"
              :aria-disabled="stopped || busy"
              variant="quiet"
              @tap="nextSentence"
            >
              {{
                !feedback.ready
                  ? writingInParagraphs
                    ? t('learning.kkj')
                    : t('learning.kqk')
                  : writingIndex === writingSteps.length - 1
                    ? writingGenreId === 'notice'
                      ? t('learning.kq3')
                      : t('learning.k7g')
                    : writingInParagraphs
                      ? t('learning.ku1')
                      : t('learning.kp4')
              }}
            </BaseButton>
          </view>
          <text v-if="feedback" class="lab-feedback" role="status" aria-live="polite">{{
            learningText(feedback.message)
          }}</text>
          <view v-if="writingComplete" class="writing-draft">
            <text class="lab-title">{{ t('learning.k63') }}</text
            ><text selectable>{{ sentences.join('\n') }}</text>
            <BaseButton
              class="primary"
              :disabled="stopped || busy"
              :aria-disabled="stopped || busy"
              variant="primary"
              @tap="$emit('writing', context, writingGenreId)"
              >{{ t('learning.k4k') }}</BaseButton
            >
          </view>
          <!-- #ifdef H5 --><a
            v-if="writingGenreId === 'notice'"
            class="writing-source"
            :href="WRITING_SOURCE.url"
            target="_blank"
            rel="noopener noreferrer"
            >{{ t('learning.kd8') }}</a
          ><!-- #endif -->
          <view v-if="writingGenreId === 'argument'" class="reference-note">
            <text class="subtle">{{ t('learning.k2') }}</text>
            <!-- #ifdef H5 -->
            <a
              class="writing-source"
              :href="ARGUMENT_WRITING_BASIS.formatUrl"
              target="_blank"
              rel="noopener noreferrer"
              >{{ t('learning.knf') }}</a
            >
            <a
              class="writing-source"
              :href="ARGUMENT_WRITING_BASIS.criteriaUrl"
              target="_blank"
              rel="noopener noreferrer"
              >{{ t('learning.kvb') }}{{ ARGUMENT_WRITING_BASIS.criteriaVersion }}</a
            >
            <!-- #endif -->
            <!-- #ifndef H5 -->
            <text class="reference-credit" selectable>{{ ARGUMENT_WRITING_BASIS.formatUrl }}</text>
            <text class="reference-credit" selectable>{{ ARGUMENT_WRITING_BASIS.criteriaUrl }}</text>
            <!-- #endif -->
          </view>
          <view v-if="writingGenreId === 'discussion'" class="reference-note">
            <text class="subtle">{{ t('learning.kmy') }}</text>
            <!-- #ifdef H5 -->
            <a
              class="writing-source"
              :href="DISCUSSION_WRITING_BASIS.formatUrl"
              target="_blank"
              rel="noopener noreferrer"
              >{{ t('learning.kcv') }}</a
            >
            <a
              class="writing-source"
              :href="DISCUSSION_WRITING_BASIS.teachingUrl"
              target="_blank"
              rel="noopener noreferrer"
              >{{ t('learning.krd') }}</a
            >
            <!-- #endif -->
            <!-- #ifndef H5 -->
            <text class="reference-credit" selectable>{{ DISCUSSION_WRITING_BASIS.formatUrl }}</text>
            <text class="reference-credit" selectable>{{ DISCUSSION_WRITING_BASIS.teachingUrl }}</text>
            <!-- #endif -->
          </view>
          <view v-if="writingGenreId === 'email'" class="reference-note">
            <text class="subtle">{{ t('learning.kkg') }}</text>
            <!-- #ifdef H5 -->
            <a class="writing-source" :href="EMAIL_WRITING_BASIS.formatUrl" target="_blank" rel="noopener noreferrer">{{
              t('learning.kcv')
            }}</a>
            <a class="writing-source" :href="EMAIL_WRITING_BASIS.sampleUrl" target="_blank" rel="noopener noreferrer">{{
              t('learning.klr')
            }}</a>
            <!-- #endif -->
            <!-- #ifndef H5 -->
            <text class="reference-credit" selectable>{{ EMAIL_WRITING_BASIS.formatUrl }}</text>
            <text class="reference-credit" selectable>{{ EMAIL_WRITING_BASIS.sampleUrl }}</text>
            <!-- #endif -->
          </view>
        </template>
      </template>
      <template v-else>
        <text class="lab-title">{{ map.goal }}</text>
        <text class="subtle">{{ t('learning.kve') }}{{ map.timezone }}</text>
        <view class="heatmap" :aria-label="t('learning.kp')">
          <view
            v-for="cell in map.heat"
            :key="cell.day"
            class="heat-cell"
            :class="{ active: cell.reliable, pending: !cell.reliable && cell.pending }"
            :aria-label="t('learning.k6r', { v0: cell.day, v1: cell.reliable, v2: cell.pending })"
            ><text>{{ cell.day.slice(8) }}</text
            ><text>{{ cell.reliable || '·' }}</text></view
          ></view
        >
        <view class="map-legend" :aria-label="t('learning.ka0')"
          ><text class="legend-reliable">{{ t('learning.k1b') }}</text
          ><text class="legend-pending">{{ t('learning.k4h') }}</text
          ><text>{{ t('learning.kl1') }}</text></view
        >
        <BaseEmpty v-if="!map.nodes.length" state="empty" :title="t('learning.khn')" mascot-size="small" />
        <view v-for="node in map.nodes" :key="node.scope" class="map-node">
          <text class="map-node-title">{{ learningText(node.label) }}</text>
          <text class="subtle"
            >{{ t('learning.k7p') }}{{ node.reliable }}{{ t('learning.kbs') }}{{ node.pending }}{{ t('learning.kpj')
            }}{{ node.helped }}</text
          >
          <view class="map-evidence"
            ><BaseButton
              v-for="evidence in node.evidence.slice(-4)"
              :key="evidence.id"
              variant="quiet"
              @tap="$emit('question', evidence.questionKey, evidence.conversationId)"
              >{{ t('learning.kak') }}{{ evidence.status === 'reliable' ? t('learning.k7p') : t('learning.k4h')
              }}{{ t('learning.k3s') }}</BaseButton
            ></view
          >
        </view>
        <text v-if="map.totalNodes > 40" class="subtle">{{ t('learning.k6w') }}</text>
      </template>
    </view>
  </BaseCard>
</template>

<script setup>
import BaseEmpty from '@/components/base/base-empty/base-empty.vue';
import BaseSegmented from '@/components/base/base-segmented/base-segmented.vue';
import { learningText } from '@/i18n/learning.js';
import { publicError, t } from '@/i18n/index.js';
import BaseCard from '@/components/base/base-card/base-card.vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseChip from '@/components/base/base-chip/base-chip.vue';
import BaseInput from '@/components/base/base-input/base-input.vue';

import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import mascotFrames from '@/components/base/yozi-mascot/mascot-frames.js';
import { bindLearningKeyboard } from '@/services/learning/keyboard-controls.js';
import DiagramConditions from '@/components/business/learning/diagram-conditions.vue';
import VelocityTimeGraph from '@/components/business/learning/velocity-time-graph.vue';
import {
  scienceInput,
  SCIENCE_TRANSFER_CONTRACT,
  MOTION_TRANSFER_CONTRACT,
  GRAPH_TRANSFER_CONTRACT,
  ENERGY_TRANSFER_CONTRACT
} from '../../../../laf-backend/functions/_shared/learning-science.js';
import {
  adaptiveWritingWords,
  vocabularyFeedback
} from '../../../../laf-backend/functions/_shared/learning-vocabulary.js';
import {
  WRITING_GENRES,
  NOTICE_CONTRACT,
  GUIDED_WRITING_CONTRACT,
  EXTENDED_WRITING_CONTRACTS,
  ARGUMENT_WRITING_BASIS,
  DISCUSSION_WRITING_BASIS,
  EMAIL_WRITING_BASIS,
  writingDraftLimit,
  GUIDED_WRITING_STEPS,
  WRITING_WORD_MEANINGS,
  writingGenre,
  writingGenreInfo,
  writingStepsForQuestion,
  guidedSentenceFeedback,
  PUBLIC_WRITING_REFERENCES,
  publicWritingReference,
  writingReferenceNoteLocation
} from '../../../../laf-backend/functions/_shared/learning-writing.js';
import {
  visualRecipe,
  visualFrame,
  MOTION_TEMPLATES,
  VELOCITY_GRAPH_TEMPLATE,
  ENERGY_TEMPLATE,
  ENERGY_BASIS,
  energyInput,
  velocityGraphInput,
  motionInput,
  exactMotionText,
  NOTICE_STEPS,
  WRITING_SOURCE,
  learningEvidenceMap
} from '../../../../laf-backend/functions/_shared/learning-visual.js';
const props = defineProps({
  state: { type: Object, required: true },
  conversationId: { type: String, default: null },
  context: { type: String, default: '' },
  stopped: Boolean,
  busy: Boolean,
  recordWritingHelp: { type: Function, default: null },
  readWritingReference: { type: Function, default: null },
  openVocabulary: { type: Function, default: null },
  vocabularyTaskFor: { type: Function, default: null },
  startVocabularyTask: { type: Function, default: null },
  submitVocabulary: { type: Function, default: null },
  recordDiagramHelp: { type: Function, default: null },
  recordScienceHelp: { type: Function, default: null },
  question: { type: Object, default: null },
  visible: { type: Boolean, default: true },
  request: { type: Object, default: null },
  iconColor: { type: String, default: '' }
});
const emit = defineEmits(['question', 'writing', 'science']);
const tabs = [
  { id: 'visual', label: '互动观察' },
  { id: 'writing', label: '逐句带练' },
  { id: 'map', label: '学习关系图' }
];
const root = ref(null),
  opened = ref(false),
  tab = ref('visual'),
  step = ref(0),
  prediction = ref(''),
  playing = ref(false),
  showVideo = ref(false),
  reducedMotion = ref(false);
const visualError = ref('');
const contextRecipeError = ref(''),
  viewChosen = ref(false),
  appliedRequestId = ref(null),
  recipeSource = ref('example');
let observationHelpKey = '';
const defaultRecipe = visualRecipe({ template: 'distance_displacement' });
const manualRecipe = ref(null),
  exampleRecipe = ref(defaultRecipe),
  exampleVersion = ref(0),
  diagramEditing = ref(false);
const visualExamples = [
  { template: 'distance_displacement', label: '路程与位移' },
  { template: 'constant_net_force', label: '合力与加速度' },
  { template: 'accelerated_motion', label: '初速度与转向' },
  { template: 'changing_net_force', label: '分段合力' },
  { template: VELOCITY_GRAPH_TEMPLATE, label: '速度—时间图' },
  { template: ENERGY_TEMPLATE, label: '功与动能' }
];
const visualVideo = '/static/learning-media/distance-return.mp4';
const recipe = computed(() => manualRecipe.value || exampleRecipe.value);
const motionRecipe = computed(() => MOTION_TEMPLATES.includes(recipe.value.template));
const energyRecipe = computed(() => recipe.value.template === ENERGY_TEMPLATE);
const movingRecipe = computed(() => motionRecipe.value || energyRecipe.value);
const graphRecipe = computed(() => recipe.value.template === VELOCITY_GRAPH_TEMPLATE);
const forceRecipe = computed(() => recipe.value.template === 'constant_net_force' || movingRecipe.value);
const motionConditions = computed(() => {
  const value = recipe.value;
  const schedule = value.segments || [
    { seconds: value.physicalSeconds, netForceN: value.netForceN, direction: value.direction }
  ];
  return schedule
    .map((s, i) =>
      t('learning.motionSegment', {
        index: i + 1,
        seconds: s.seconds,
        force: s.netForceN,
        direction: s.netForceN
          ? t(s.direction === 'left' ? 'learning.left' : 'learning.right')
          : t('learning.noDirection')
      })
    )
    .join(t('learning.segmentSeparator'));
});
const motionTurned = computed(() => frame.value.distance > Math.abs(frame.value.position) + 1e-10);
const motionZeroForce = computed(
  () => !(recipe.value.segments?.[frame.value.phaseIndex]?.netForceN ?? recipe.value.netForceN)
);
const side = computed(() => t(recipe.value.direction === 'left' ? 'learning.kqs' : 'learning.kgd'));
const frame = computed(() => visualFrame(recipe.value, step.value));
const motionOriginLabel = computed(
  () =>
    movingRecipe.value &&
    -frame.value.minimum / (frame.value.maximum - frame.value.minimum) > 0.15 &&
    -frame.value.minimum / (frame.value.maximum - frame.value.minimum) < 0.85
);
const map = computed(() => learningEvidenceMap(props.state, { conversationId: props.conversationId }));
let timer = null,
  unbind = () => {
    /* 尚未绑定键盘。 */
  },
  motionQuery;
const number = (value) => Number(value.toFixed(1));
const physicsNumber = (value) => {
  const rounded = Number(value.toFixed(3));
  return Math.abs(rounded - value) > 1e-10 ? `≈${rounded}` : String(rounded);
};
const displacementText = computed(() =>
  frame.value.displacement === 0 ? '0 m' : `向${side.value} ${number(Math.abs(frame.value.displacement))} m`
);
const forcePosition = (value) =>
  `${
    movingRecipe.value
      ? 8 + (84 * (value - frame.value.minimum)) / (frame.value.maximum - frame.value.minimum)
      : recipe.value.direction === 'left'
        ? 92 - (84 * Math.abs(value)) / frame.value.extent
        : 8 + (84 * Math.abs(value)) / frame.value.extent
  }%`;
function clearDiagram() {
  manualRecipe.value = null;
  resetVisual();
}
function adoptDiagram(value) {
  if (props.stopped || props.busy) return;
  resetVisual();
  manualRecipe.value = value;
}
function chooseExample(template) {
  if (props.stopped || props.busy) return;
  viewChosen.value = true;
  if (manualRecipe.value && recipe.value.template === template) return;
  recipeSource.value = 'example';
  contextRecipeError.value = '';
  clearDiagram();
  exampleVersion.value++;
  exampleRecipe.value =
    template === ENERGY_TEMPLATE
      ? visualRecipe({
          template,
          massKg: 1,
          initialVelocityMps: 4,
          netForceN: 2,
          direction: 'left',
          physicalSeconds: 3
        })
      : template === VELOCITY_GRAPH_TEMPLATE
        ? visualRecipe({
            template,
            points: [
              { time: 0, velocity: 2 },
              { time: 3, velocity: -1 },
              { time: 5, velocity: -1 },
              { time: 8, velocity: 2 }
            ]
          })
        : template === 'accelerated_motion'
          ? visualRecipe({
              template,
              massKg: 0.5,
              netForceN: 0.5,
              direction: 'left',
              initialVelocityMps: 2,
              physicalSeconds: 4
            })
          : template === 'changing_net_force'
            ? visualRecipe({
                template,
                massKg: 0.5,
                initialVelocityMps: 1,
                segments: [
                  { seconds: 2, netForceN: 0.5, direction: 'left' },
                  { seconds: 2, netForceN: 0, direction: 'none' },
                  { seconds: 2, netForceN: 0.5, direction: 'right' }
                ]
              })
            : template === 'constant_net_force'
              ? visualRecipe({ template, massKg: 2, netForceN: 4, direction: 'right' })
              : defaultRecipe;
}
function observedScienceInput(value = recipe.value) {
  return scienceInput(
    value.template === ENERGY_TEMPLATE
      ? energyInput(value)
      : value.template === VELOCITY_GRAPH_TEMPLATE
        ? velocityGraphInput(value)
        : MOTION_TEMPLATES.includes(value.template)
          ? motionInput(value)
          : value.template === 'constant_net_force'
            ? { template: value.template, massKg: value.massKg, netForceN: value.netForceN, direction: value.direction }
            : {
                template: value.template,
                outward: value.outward,
                backward: value.backward,
                direction: value.direction || 'right'
              }
  );
}
function requestScience() {
  if (props.stopped || props.busy || !frame.value.complete) return;
  emit('science', props.context, observedScienceInput());
}
function ensureObservationHelp() {
  // 原图条件确认已先保存图示帮助；普通示例另归当前物理题。
  if (manualRecipe.value || (!props.question?.scienceExercise && props.question?.subject !== '物理')) return true;
  const key = JSON.stringify([
    props.context,
    observedScienceInput(),
    (props.state.attempts || []).filter((a) => a.questionKey === `${props.question.id}@${props.question.version}`)
      .length
  ]);
  if (key === observationHelpKey) return true;
  if (props.recordScienceHelp?.(props.context, observedScienceInput()) !== true) {
    visualError.value = '观察帮助未保存，请重试。';
    return false;
  }
  observationHelpKey = key;
  visualError.value = '';
  return true;
}
function toggleVisualVideo() {
  pause();
  if (showVideo.value) {
    showVideo.value = false;
    return;
  }
  if (!props.stopped && !props.busy && ensureObservationHelp()) showVideo.value = true;
}
function pause() {
  if (timer) clearInterval(timer);
  timer = null;
  playing.value = false;
}
function resetVisual() {
  pause();
  step.value = 0;
  prediction.value = '';
  showVideo.value = false;
  visualError.value = '';
  observationHelpKey = '';
}
function chooseTab(id) {
  viewChosen.value = true;
  if (tab.value === id) return;
  pause();
  showVideo.value = false;
  if (manualRecipe.value) clearDiagram();
  diagramEditing.value = false;
  tab.value = id;
}
function toggleOpened() {
  viewChosen.value = true;
  opened.value = !opened.value;
}
function resetContextRecipe() {
  contextRecipeError.value = '';
  recipeSource.value = 'example';
  exampleRecipe.value = defaultRecipe;
  const exercise = props.question?.scienceExercise;
  if (!exercise) return;
  try {
    const input = scienceInput(exercise.input);
    const contract =
      input.template === ENERGY_TEMPLATE
        ? ENERGY_TRANSFER_CONTRACT
        : input.template === VELOCITY_GRAPH_TEMPLATE
          ? GRAPH_TRANSFER_CONTRACT
          : MOTION_TEMPLATES.includes(input.template)
            ? MOTION_TRANSFER_CONTRACT
            : SCIENCE_TRANSFER_CONTRACT;
    if (exercise.contract !== contract) throw new Error('unsupported science contract');
    exampleRecipe.value = visualRecipe(input);
    recipeSource.value = 'question';
  } catch {
    contextRecipeError.value = '这道题的动画暂不可用，请选择其他观察内容。';
  }
}
const requestedVisual = computed(() => {
  const request = props.request;
  const key = props.question ? `${props.question.id}@${props.question.version}` : null;
  if (
    !request?.id ||
    request.owner !== props.state.owner ||
    request.learningContext !== props.context ||
    request.conversationId !== props.conversationId ||
    (request.questionKey || null) !== key
  )
    return null;
  try {
    return visualRecipe(observedScienceInput(request.recipe));
  } catch {
    return null;
  }
});
const pendingVisual = computed(() => requestedVisual.value && props.request.id !== appliedRequestId.value);
function applyRequestedVisual(explicit = false) {
  if (props.stopped || props.busy || !props.visible || !pendingVisual.value) return;
  if (explicit) viewChosen.value = true;
  manualRecipe.value = null;
  diagramEditing.value = false;
  exampleRecipe.value = requestedVisual.value;
  contextRecipeError.value = '';
  recipeSource.value = 'request';
  appliedRequestId.value = props.request.id;
  exampleVersion.value++;
  resetVisual();
  opened.value = true;
  tab.value = 'visual';
}
function nextFrame() {
  pause();
  if (!props.stopped && !props.busy && prediction.value && !frame.value.complete && ensureObservationHelp())
    step.value++;
}
function togglePlayback() {
  if (playing.value) return pause();
  if (props.stopped || props.busy || !prediction.value || frame.value.complete) return;
  if (reducedMotion.value) return nextFrame();
  if (!ensureObservationHelp()) return;
  playing.value = true;
  timer = setInterval(
    () => {
      if (props.stopped || props.busy || !opened.value || step.value >= recipe.value.steps) return pause();
      step.value++;
      if (step.value >= recipe.value.steps) pause();
    },
    (recipe.value.duration * 1000) / recipe.value.steps
  );
}
const writingIndex = ref(0),
  writingGenreId = ref(writingGenre(props.question)),
  sentence = ref(''),
  sentences = ref([]),
  feedback = ref(null),
  scaffold = ref(false),
  wordMessage = ref(''),
  writingComplete = ref(false);
const writingReference = ref(null);
const writingReferenceId = ref('');
const availableWritingReferences = computed(() =>
  PUBLIC_WRITING_REFERENCES.filter((item) => item.genreId === writingGenreId.value)
);
const currentWritingReference = computed(
  () =>
    availableWritingReferences.value.find((item) => item.id === writingReferenceId.value) ||
    availableWritingReferences.value[0]
);
function chooseWritingReference(id) {
  if (
    !props.visible ||
    props.stopped ||
    props.busy ||
    !writingBound.value ||
    !availableWritingReferences.value.some((item) => item.id === id)
  )
    return;
  if (id === currentWritingReference.value?.id) return;
  writingReferenceId.value = id;
  writingReference.value = null;
}
function openWritingReference() {
  if (!props.visible || props.stopped || props.busy || !writingBound.value) return;
  const reference = currentWritingReference.value;
  const saved = reference && props.readWritingReference?.(props.context, reference.id, reference.version);
  if (saved?.hintId && saved.reference?.id === reference.id && saved.reference.version === reference.version)
    writingReference.value = publicWritingReference(reference.id, reference.version);
}
const vocabularyQuestion = ref(null),
  vocabularyWord = ref(''),
  vocabularyChoice = ref(''),
  vocabularyDelayDays = ref(1),
  showAllWords = ref(false);
const vocabularyDelayOptions = [
  { days: 1, label: '明日' },
  { days: 3, label: '3天后' },
  { days: 7, label: '7天后' }
];
const vocabularyAttempt = computed(() =>
  props.state.attempts.find(
    (a) =>
      a.questionKey ===
      (vocabularyQuestion.value && `${vocabularyQuestion.value.id}@${vocabularyQuestion.value.version}`)
  )
);
const vocabularyResult = computed(() =>
  vocabularyAttempt.value
    ? vocabularyAttempt.value.corrections?.length
      ? '已校对，换句再认。'
      : vocabularyFeedback(vocabularyQuestion.value, vocabularyAttempt.value).message
    : ''
);
const vocabularyRetest = computed(
  () =>
    vocabularyQuestion.value &&
    props.vocabularyTaskFor?.(
      `${vocabularyQuestion.value.id}@${vocabularyQuestion.value.version}`,
      'retest',
      vocabularyDelayDays.value
    )
);
function chooseVocabularyDelay(days) {
  if (props.stopped || props.busy || !writingBound.value || !vocabularyQuestion.value || !vocabularyResult.value)
    return;
  if (vocabularyDelayOptions.some((item) => item.days === days)) vocabularyDelayDays.value = days;
}
function wordTask(phase) {
  if (props.stopped || props.busy || !vocabularyQuestion.value || !vocabularyResult.value) return;
  props.startVocabularyTask?.(
    props.context,
    `${vocabularyQuestion.value.id}@${vocabularyQuestion.value.version}`,
    phase,
    phase === 'retest' ? vocabularyDelayDays.value : 1
  );
}
const writingSteps = computed(() =>
  props.question?.writingExercise && writingGenre(props.question) === writingGenreId.value
    ? writingStepsForQuestion(props.question)
    : writingGenreId.value === 'notice'
      ? NOTICE_STEPS
      : GUIDED_WRITING_STEPS[writingGenreId.value]
);
const writingStep = computed(() => writingSteps.value[writingIndex.value]);
const writingInParagraphs = computed(() => writingDraftLimit(writingGenreId.value) === 2000);
const writingIsChinese = computed(() => writingGenreInfo(writingGenreId.value).language === 'zh');
const writingWords = computed(() =>
  writingBound.value
    ? adaptiveWritingWords(props.state, props.question, writingStep.value.words)
    : writingStep.value.words.map((word) => ({ word, senseId: null, folded: false }))
);
const foldedWords = computed(() => writingWords.value.filter((card) => card.folded).length);
const visibleWritingWords = computed(() => writingWords.value.filter((card) => showAllWords.value || !card.folded));
const writingBound = computed(
  () => !!props.question?.writingExercise && writingGenre(props.question) === writingGenreId.value
);
function chooseWritingGenre(id) {
  if (props.stopped || props.busy || id === writingGenreId.value) return;
  writingGenreInfo(id);
  clearDraft();
  writingGenreId.value = id;
}
function wordHelp(word) {
  if (props.stopped || props.busy) return;
  const content = `${word}：${WRITING_WORD_MEANINGS[word]}`;
  if (saveWritingHelp(content)) wordMessage.value = content;
}
function chooseWord(card) {
  if (card.senseId && props.openVocabulary) openWordCheck(card.word);
  else wordHelp(card.word);
}
function openWordCheck(word) {
  if (props.stopped || props.busy || !writingBound.value || !props.openVocabulary) return;
  const q = props.openVocabulary(props.context, word);
  if (!q?.vocabularyExercise) return;
  vocabularyQuestion.value = q;
  vocabularyWord.value = word;
  vocabularyChoice.value = '';
  vocabularyDelayDays.value = 1;
  wordMessage.value = '';
}
function confirmVocabulary() {
  if (props.stopped || props.busy || !vocabularyQuestion.value || !vocabularyChoice.value || !props.submitVocabulary)
    return;
  const result = props.submitVocabulary(
    props.context,
    `${vocabularyQuestion.value.id}@${vocabularyQuestion.value.version}`,
    vocabularyChoice.value
  );
  if (result?.attemptId) wordMessage.value = '';
}
function clearVocabulary() {
  vocabularyQuestion.value = null;
  vocabularyWord.value = '';
  vocabularyChoice.value = '';
  vocabularyDelayDays.value = 1;
}
function saveWritingHelp(content) {
  return (
    writingBound.value &&
    (!props.recordWritingHelp || props.recordWritingHelp(props.context, content, writingGenreId.value) !== false)
  );
}
function showScaffold() {
  if (!props.stopped && !props.busy && saveWritingHelp(`${writingStep.value.scaffold} · ${writingStep.value.hint}`))
    scaffold.value = true;
}
function checkSentence() {
  if (props.stopped || props.busy) return;
  const result = guidedSentenceFeedback(writingGenreId.value, writingStep.value.id, sentence.value, props.question);
  if (saveWritingHelp(publicError(result))) feedback.value = result;
}
function nextSentence() {
  if (props.stopped || props.busy || !(feedback.value?.ready || feedback.value?.kind === 'content')) return;
  sentences.value[writingIndex.value] = sentence.value.trim();
  if (writingIndex.value === writingSteps.value.length - 1) {
    writingComplete.value = true;
    return;
  }
  writingIndex.value++;
  sentence.value = '';
  feedback.value = null;
  scaffold.value = false;
  wordMessage.value = '';
  clearVocabulary();
  showAllWords.value = false;
}
function clearDraft() {
  writingReference.value = null;
  writingReferenceId.value = '';
  clearVocabulary();
  showAllWords.value = false;
  writingIndex.value = 0;
  sentence.value = '';
  sentences.value = [];
  feedback.value = null;
  scaffold.value = false;
  wordMessage.value = '';
  writingComplete.value = false;
}
function release() {
  diagramEditing.value = false;
  manualRecipe.value = null;
  resetVisual();
  clearDraft();
  opened.value = false;
}
watch(
  [
    () => props.context,
    () => props.state.owner,
    () => props.conversationId,
    () => props.question?.id,
    () => props.question?.version,
    () => props.question?.writingExercise?.contract,
    () => props.question?.writingExercise?.genreId,
    () => props.question?.scienceExercise?.contract,
    () => JSON.stringify(props.question?.scienceExercise?.input)
  ],
  () => {
    release();
    viewChosen.value = false;
    appliedRequestId.value = null;
    resetContextRecipe();
    exampleVersion.value++;
    tab.value = [NOTICE_CONTRACT, GUIDED_WRITING_CONTRACT, ...EXTENDED_WRITING_CONTRACTS].includes(
      props.question?.writingExercise?.contract
    )
      ? 'writing'
      : 'visual';
    writingGenreId.value = writingGenre(props.question);
  },
  { flush: 'sync', immediate: true }
);
watch(
  () => props.busy,
  (value) => {
    if (value) {
      pause();
      showVideo.value = false;
      writingReference.value = null;
    }
  },
  { flush: 'sync' }
);
watch(
  () => props.stopped,
  () => {
    pause();
    showVideo.value = false;
    writingReference.value = null;
  },
  { flush: 'sync' }
);
watch(
  () =>
    props.state.attempts.filter(
      (attempt) => attempt.questionKey === (props.question && `${props.question.id}@${props.question.version}`)
    ).length,
  () => {
    writingReference.value = null;
  },
  { flush: 'sync' }
);
watch(opened, (value) => {
  if (!value) {
    pause();
    showVideo.value = false;
    if (manualRecipe.value) clearDiagram();
    diagramEditing.value = false;
  }
});
watch(sentence, () => {
  feedback.value = null;
  writingComplete.value = false;
});
watch(
  requestedVisual,
  (value) => {
    if (!value) {
      if (recipeSource.value === 'request') {
        resetContextRecipe();
        if (!manualRecipe.value) resetVisual();
      }
      return;
    }
    if (!viewChosen.value) applyRequestedVisual();
  },
  { immediate: true, flush: 'sync' }
);
function motionChanged() {
  reducedMotion.value = motionQuery?.matches || false;
  if (reducedMotion.value) pause();
}
onMounted(() => {
  unbind = bindLearningKeyboard(root.value);
  // #ifdef H5
  motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  motionChanged();
  motionQuery?.addEventListener?.('change', motionChanged);
  // #endif
});
watch(
  () => props.visible,
  (visible) => {
    if (!visible) release();
  },
  { flush: 'sync' }
);
onUnmounted(() => {
  pause();
  unbind();
  motionQuery?.removeEventListener?.('change', motionChanged);
});
</script>

<style scoped>
.public-writing-reference {
  margin: var(--s-3) 0 var(--s-5);
  padding: var(--s-4);
  border: var(--border-thin) solid var(--line);
  border-radius: var(--s-3);
  background: var(--paper);
  overflow-wrap: anywhere;
}
.reference-title,
.reference-excerpt,
.reference-credit {
  display: block;
  margin-bottom: var(--s-3);
}
.reference-excerpt {
  white-space: pre-wrap;
  line-height: 1.75;
  font-size: var(--size-body);
}
.reference-credit {
  color: var(--ink-3);
  font-size: var(--size-caption);
  line-height: 1.6;
}
.reference-links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-4);
}
.reference-links a {
  display: inline-flex;
  align-items: center;
  min-width: var(--touch-min);
}
.reference-links a:focus-visible,
.writing-source:focus-visible {
  outline: var(--border-selected) solid var(--focus);
  outline-offset: var(--s-1);
}
.reference-note {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  margin: var(--s-3) 0;
  line-height: 1.6;
}
.vocabulary-check {
  margin: var(--s-3) 0;
  padding: var(--s-4);
  border: var(--border-thin) solid var(--line);
  border-radius: var(--s-3);
  background: var(--paper);
}
.vocabulary-options {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  margin: var(--s-3) 0;
}
.learning-lab {
  margin: var(--s-6) 0;
  overflow: hidden;
}
.lab-heading {
  display: flex;
  width: 100%;
  gap: var(--s-4);
  align-items: center;
  justify-content: space-between;
}
.lab-heading view,
.lab-content,
.writing-draft {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}
.lab-content {
  padding-top: var(--s-4);
}
.lab-tabs,
.word-list,
.map-evidence,
.scene-readout {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2);
}
.energy-readout {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  padding: var(--s-4);
  background: var(--paper);
  border-radius: var(--s-3);
}
.energy-lane {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}
.energy-track {
  height: var(--s-3);
  background: var(--glass);
  border-radius: var(--s-2);
  overflow: hidden;
}
.energy-bar {
  height: 100%;
  background: var(--paper-sunk);
  border-radius: inherit;
}
.energy-bar.current {
  background: var(--paper-sunk);
}
.lab-title {
  display: block;
  font-size: var(--size-title-3);
  font-weight: var(--weight-ui-emphasis);
  line-height: 1.5;
}
.lab-prompt {
  display: block;
  font-size: var(--size-body);
  line-height: 1.65;
}
.lab-feedback {
  display: block;
  padding: var(--s-3) var(--s-4);
  background: var(--glass);
  border-radius: var(--s-3);
  font-size: var(--size-small);
  line-height: 1.75;
  white-space: pre-wrap;
}
.scene {
  position: relative;
  height: var(--mascot-medium);
  margin: var(--s-2) var(--s-5);
}
.scene-axis,
.scene-trail {
  position: absolute;
  left: 8%;
  top: var(--mascot-medium);
  width: 84%;
  height: var(--s-1);
  border-radius: var(--s-1);
  background: var(--line);
}
.scene-trail {
  background: var(--paper-sunk);
  top: var(--mascot-medium);
}
.scene-character {
  position: absolute;
  top: var(--s-8);
  width: var(--control-height);
  height: var(--control-height);
  transform: translateX(-50%);
}
.scene-start,
.scene-turn {
  position: absolute;
  top: var(--mascot-medium);
  font-size: var(--size-small);
}
.mirrored-start {
  left: auto;
  right: 8%;
  transform: translateX(50%);
}
.mirrored-turn {
  right: auto;
  left: 8%;
  transform: translateX(-50%);
}
.force-lane {
  padding: var(--s-2) 0;
}
.lane-label {
  font-size: var(--size-body);
  font-weight: var(--weight-ui-emphasis);
}
.force-track {
  position: relative;
  height: var(--mascot-medium);
  margin: 0 var(--s-5);
}
.force-axis {
  position: absolute;
  top: var(--mascot-medium);
  left: 8%;
  width: 84%;
  height: var(--s-1);
  background: var(--line);
}
.force-character {
  position: absolute;
  top: var(--s-2);
  width: var(--touch-min);
  height: var(--touch-min);
  transform: translateX(-50%);
}
.force-start,
.force-end {
  position: absolute;
  top: var(--mascot-medium);
  font-size: var(--size-caption);
}
.force-origin {
  position: absolute;
  top: var(--mascot-medium);
  transform: translateX(-50%);
  font-size: var(--size-caption);
}
.force-start {
  left: 8%;
  transform: translateX(-50%);
}
.force-end {
  right: 8%;
  transform: translateX(50%);
}
.force-start.leftward {
  left: auto;
  right: 8%;
  transform: translateX(50%);
}
.force-end.leftward {
  right: auto;
  left: 8%;
  transform: translateX(-50%);
}
.scene-start {
  left: 8%;
  transform: translateX(-50%);
}
.scene-turn {
  right: 8%;
  transform: translateX(50%);
}
.scene-readout {
  justify-content: space-between;
  font-weight: var(--weight-ui-emphasis);
}
.scene-video {
  width: 100%;
  height: var(--mascot-large);
  border-radius: var(--s-3);
}
.writing-progress {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--s-2);
}
.writing-progress view {
  padding: var(--s-2);
  font-size: var(--size-caption);
  border-bottom: var(--border-selected) solid var(--line);
}
.writing-progress .current,
.writing-progress .done {
  border-color: var(--line);
}
.sentence-input {
  width: 100%;
}
.writing-source {
  color: inherit;
  text-decoration: underline;
  min-height: var(--touch-min);
  line-height: var(--touch-min);
  font-size: var(--size-caption);
}
.heatmap {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: var(--s-2);
}
.heat-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-1);
  padding: var(--s-2) 0;
  border: var(--border-thin) solid var(--line);
  border-radius: var(--s-2);
  font-size: var(--size-caption);
}
.heat-cell.active {
  background: var(--violet-soft);
}
.heat-cell.pending {
  border-style: dashed;
}
.map-legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-4);
  font-size: var(--size-caption);
  color: var(--ink-3);
}
.map-legend text::before {
  content: '';
  display: inline-block;
  width: var(--s-3);
  height: var(--s-3);
  margin-right: var(--s-2);
  vertical-align: middle;
  border: var(--border-thin) solid var(--line);
  border-radius: var(--s-1);
}
.map-legend .legend-reliable::before {
  background: var(--violet-soft);
}
.map-legend .legend-pending::before {
  border-style: dashed;
}
.map-node {
  position: relative;
  border-left: var(--border-selected) solid var(--line);
  margin-left: var(--s-3);
  padding: var(--s-1) 0 var(--s-3) var(--s-4);
}
.map-node-title {
  display: block;
  font-size: var(--size-body);
  font-weight: var(--weight-ui-emphasis);
  overflow-wrap: anywhere;
}
.map-evidence {
  padding-top: var(--s-2);
}
@media (max-width: 560px) {
  .writing-progress {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .scene {
    margin: var(--s-2) var(--s-3);
  }
  .scene-readout {
    font-size: var(--size-small);
  }
  .scene-video {
    height: var(--mascot-large);
  }
}
@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {
  .learning-lab,
  .lab-feedback,
  .sentence-input {
    background: var(--paper);
  }
}
</style>
