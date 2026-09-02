<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import JokerTray from '../components/JokerTray.vue'
import MapQuestion from '../components/MapQuestion.vue'
import GameBar from '../components/GameBar.vue'
import PlayerStrip from '../components/PlayerStrip.vue'
import type {
  JokerType,
  MultipleChoiceAnswerData,
  SortingAnswerData,
  CalculationAnswerData,
  MapLocationAnswerData,
} from '../types/session'
import { JOKER_ICONS } from '../components/jokerIcons'

const { t } = useI18n()
const game = useGameStore()

const player = computed(() => game.currentPlayer)
const question = computed(() => game.currentQuestion)
const isPassPhase = computed(() => game.state === 'pass_answering')
const usedJokers = computed(() => game.turn?.jokers_used_this_turn ?? new Set<JokerType>())
const hintRevealed = computed(() => game.turn?.hint_revealed ?? false)
const doubleDownActive = computed(() => game.turn?.double_down_active ?? false)

/** The slot this question came from — it carries the category, which the
 *  question payload itself does not. */
/**
 * During a pass, the same screen is being answered by a *different* player, so
 * the answer belongs to the pass flow. Routing it through submitAnswer() instead
 * re-ran the whole verdict: a wrong pass answer set state to answer_wrong, which
 * handed the question on again, and again — an endless chain of second chances.
 * It also credited the attempt to the wrong player's stats.
 */
function submitCurrentAnswer(correct: boolean) {
  if (isPassPhase.value) {
    game.submitPassAnswer(correct ? 'correct' : 'wrong')
  } else {
    game.submitAnswer(correct)
  }
}

/**
 * Whether a wrong answer may reveal the solution straight away.
 *
 * It may not while the question still has somewhere to go: per IDEA.md the
 * answer stays hidden until the player one round behind has also had their
 * turn. During the pass itself revealing is fine, since PassResolve shows it
 * immediately afterwards anyway.
 */
const revealOnWrong = computed(() => {
  if (isPassPhase.value) return true
  const idx = game.turn?.previous_round_player_index
  return !(game.round >= 2 && idx !== null && idx !== undefined)
})

const selectedSlot = computed(() => {
  const idx = game.turn?.selected_slot_index
  if (idx === null || idx === undefined) return null
  return game.turn?.offered_slots[idx] ?? null
})

// Time limit visual effect
const timeFraction = ref(1)
const timerInterval = ref<ReturnType<typeof setInterval> | null>(null)

onUnmounted(() => {
  if (timerInterval.value) clearInterval(timerInterval.value)
})

// Background color shift for soft time limit
const bgStyle = computed(() => {
  if (timeFraction.value > 0.5) return {}
  if (timeFraction.value > 0.25) {
    return { backgroundColor: `rgba(245, 158, 11, ${0.1 * (1 - timeFraction.value)})` }
  }
  return { backgroundColor: 'rgba(239, 68, 68, 0.15)' }
})

// --- Multiple Choice ---
function handleMultipleChoiceAnswer(index: number) {
  if (!question.value || question.value.question_type !== 'multiple_choice') return
  const data = question.value.answer_data as MultipleChoiceAnswerData
  const correct = index === data.correct_index
  submitCurrentAnswer(correct)
}

// --- Sorting (drag & drop) ---
const sortItems = ref<{ text: string; originalIndex: number }[]>([])
const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

function initSorting() {
  if (!question.value || question.value.question_type !== 'sorting') return
  const data = question.value.answer_data as SortingAnswerData
  sortItems.value = data.items.map((text, i) => ({ text, originalIndex: i }))
  for (let i = sortItems.value.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = sortItems.value[i]!
    sortItems.value[i] = sortItems.value[j]!
    sortItems.value[j] = tmp
  }
}

function onDragStart(idx: number, e: DragEvent) {
  dragIndex.value = idx
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(idx))
  }
}

function onDragOver(idx: number, e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  if (dragIndex.value === null || idx === dragIndex.value) return
  if (dragOverIndex.value === idx) return
  dragOverIndex.value = idx

  // Reorder live as user drags over items
  const items = [...sortItems.value]
  const dragged = items.splice(dragIndex.value, 1)[0]!
  items.splice(idx, 0, dragged)
  sortItems.value = items
  dragIndex.value = idx
}

function onDragEnd() {
  dragIndex.value = null
  dragOverIndex.value = null
}

// Touch drag fallback
const touchDragIdx = ref<number | null>(null)
const touchClone = ref<HTMLElement | null>(null)
const sortListEl = ref<HTMLElement | null>(null)

function onTouchStart(idx: number, e: TouchEvent) {
  const touch = e.touches[0]
  if (!touch) return
  touchDragIdx.value = idx

  const target = e.currentTarget as HTMLElement
  const clone = target.cloneNode(true) as HTMLElement
  clone.style.position = 'fixed'
  clone.style.left = '0'
  clone.style.width = target.offsetWidth + 'px'
  clone.style.top = (touch.clientY - target.offsetHeight / 2) + 'px'
  clone.style.zIndex = '100'
  clone.style.opacity = '0.9'
  clone.style.pointerEvents = 'none'
  clone.style.transform = 'scale(1.03)'
  clone.style.transition = 'none'
  document.body.appendChild(clone)
  touchClone.value = clone
}

function onTouchMove(e: TouchEvent) {
  if (touchDragIdx.value === null || !touchClone.value || !sortListEl.value) return
  e.preventDefault()
  const touch = e.touches[0]
  if (!touch) return
  touchClone.value.style.top = (touch.clientY - touchClone.value.offsetHeight / 2) + 'px'

  // Find which item we're over
  const children = Array.from(sortListEl.value.children) as HTMLElement[]
  for (let i = 0; i < children.length; i++) {
    const rect = children[i]!.getBoundingClientRect()
    if (touch.clientY >= rect.top && touch.clientY <= rect.bottom && i !== touchDragIdx.value) {
      const items = [...sortItems.value]
      const dragged = items.splice(touchDragIdx.value, 1)[0]!
      items.splice(i, 0, dragged)
      sortItems.value = items
      touchDragIdx.value = i
      break
    }
  }
}

function onTouchEnd() {
  touchDragIdx.value = null
  if (touchClone.value) {
    touchClone.value.remove()
    touchClone.value = null
  }
}

function submitSortAnswer() {
  if (!question.value || question.value.question_type !== 'sorting') return
  const data = question.value.answer_data as SortingAnswerData
  const userOrder = sortItems.value.map((item) => item.originalIndex)
  const correct = userOrder.every((val, idx) => val === data.correct_order[idx])
  submitCurrentAnswer(correct)
}

// --- Calculation ---
const calcInput = ref('')

function handleCalcKey(key: string) {
  if (key === 'backspace') {
    calcInput.value = calcInput.value.slice(0, -1)
  } else if (key === 'submit') {
    submitCalcAnswer()
  } else {
    calcInput.value += key
  }
}

function submitCalcAnswer() {
  if (!question.value || question.value.question_type !== 'calculation') return
  const data = question.value.answer_data as CalculationAnswerData
  const userValue = parseFloat(calcInput.value.replace(/,/g, ''))
  if (isNaN(userValue)) return
  const diff = Math.abs(userValue - data.correct_value)
  const threshold = Math.abs(data.correct_value * data.tolerance)
  const correct = diff <= threshold
  submitCurrentAnswer(correct)
}

// --- Joker handlers ---
function handleUseJoker(type: JokerType) {
  if (type === 'reveal_hint') {
    game.revealHint()
  } else if (type === 'double_down') {
    game.activateDoubleDown()
  } else if (type === 'reshuffle_question') {
    game.useJoker('reshuffle_question')
  }
}

// --- Pass decline ---
function handleDecline() {
  game.submitPassAnswer('declined')
}

/** What the strip's right-hand line says on this screen. */
const contextLine = computed(() => {
  const q = question.value
  if (!q) return ''
  if (q.question_type === 'sorting') {
    return t('question.sortInstruction', { metric: (q.answer_data as SortingAnswerData).metric })
  }
  if (q.question_type === 'calculation') return t('question.calcInstruction')
  if (q.question_type === 'map_location') return t('question.mapInstruction')
  return selectedSlot.value?.major_category ?? ''
})

// Init sorting if needed
if (question.value?.question_type === 'sorting') {
  initSorting()
}

const CALC_KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', ',', '0', 'backspace']

/** The hint bulb matches the joker that produced it. */
const HINT_ICON = JOKER_ICONS.reveal_hint
</script>

<template>
  <div class="qt-screen" :style="bgStyle">
    <GameBar />
    <PlayerStrip :player="player" :context="contextLine" />

    <!-- Loading state when question data hasn't arrived yet -->
    <div v-if="!question" class="flex flex-1 items-center justify-center">
      <p class="qt-gate-sub animate-pulse">Loading…</p>
    </div>

    <template v-else>
      <!-- The question itself, in the one bright region on the screen -->
      <div class="qt-panel qt-doodles qt-doodles--ink">
        <div v-if="question.teaser_title" class="qt-teaser">{{ question.teaser_title }}</div>
        <div class="qt-qtext">{{ question.question_text }}</div>

        <div v-if="doubleDownActive" class="qt-teaser" style="color: var(--qt-accent); margin: 10px 0 0">
          {{ t('question.doubleDownActive') }}
        </div>

        <div v-if="hintRevealed && question.hint" class="qt-hintbox">
          <svg
            :viewBox="HINT_ICON.viewBox"
            width="13"
            height="13"
            aria-hidden="true"
            style="display: inline-block; vertical-align: -1px; fill: #7d5a10; margin-right: 4px"
          ><path :d="HINT_ICON.d" /></svg>
          {{ t('question.hint') }}: {{ question.hint }}
        </div>
      </div>

      <!-- Multiple Choice -->
      <div v-if="question.question_type === 'multiple_choice'" class="qt-options">
        <button
          v-for="(option, idx) in (question.answer_data as MultipleChoiceAnswerData).options"
          :key="idx"
          class="qt-pill"
          @click="handleMultipleChoiceAnswer(idx)"
        >
          <span class="qt-pill-letter">{{ String.fromCharCode(65 + idx) }}</span>
          <span class="flex-1">{{ option }}</span>
        </button>
      </div>

      <!-- Sorting -->
      <div
        v-else-if="question.question_type === 'sorting'"
        ref="sortListEl"
        class="qt-sort-list"
        @touchmove.prevent="onTouchMove"
        @touchend="onTouchEnd"
      >
        <div
          v-for="(item, idx) in sortItems"
          :key="item.originalIndex"
          draggable="true"
          class="qt-sort-item select-none"
          :class="dragIndex === idx || touchDragIdx === idx ? 'qt-sort-item--drag' : ''"
          @dragstart="onDragStart(idx, $event)"
          @dragover="onDragOver(idx, $event)"
          @dragend="onDragEnd"
          @touchstart="onTouchStart(idx, $event)"
        >
          <span class="qt-sort-rank">{{ idx + 1 }}</span>
          <span>{{ item.text }}</span>
          <span class="qt-sort-grip">⠿</span>
        </div>
      </div>

      <!-- Calculation -->
      <div v-else-if="question.question_type === 'calculation'" class="qt-calc-wrap">
        <div class="qt-calc-display">
          <span class="qt-calc-value">{{ calcInput || '0' }}</span>
          <span class="qt-calc-unit">{{ (question.answer_data as CalculationAnswerData).unit }}</span>
        </div>
        <div class="qt-keypad">
          <button
            v-for="key in CALC_KEYS"
            :key="key"
            class="qt-key"
            :class="key === 'backspace' ? 'qt-key--del' : ''"
            @click="handleCalcKey(key)"
          >
            {{ key === 'backspace' ? '⌫' : key }}
          </button>
        </div>
      </div>

      <!-- Map Location — fills everything below the panel, action floats on it -->
      <div v-else-if="question.question_type === 'map_location'" class="qt-map-wrap">
        <div class="qt-map-frame">
          <MapQuestion
            :answer-data="(question.answer_data as MapLocationAnswerData)"
            :reveal-on-wrong="revealOnWrong"
            @answer="submitCurrentAnswer"
          />
        </div>
      </div>

      <!-- Submit, for the types that need an explicit confirm -->
      <div v-if="question.question_type === 'sorting'" class="qt-cta-bar">
        <button class="qt-cta qt-cta--accent" @click="submitSortAnswer">{{ t('question.submit') }}</button>
      </div>
      <div v-else-if="question.question_type === 'calculation'" class="qt-cta-bar">
        <button class="qt-cta qt-cta--accent" @click="submitCalcAnswer">{{ t('question.submit') }}</button>
      </div>

      <!-- Pass: the inheriting player may decline rather than guess -->
      <div v-if="isPassPhase" class="qt-cta-bar">
        <button class="qt-cta qt-cta--ghost" @click="handleDecline">{{ t('passResolve.declined') }}</button>
      </div>

      <JokerTray
        v-if="!isPassPhase && player"
        :jokers="player.jokers"
        :used-this-turn="usedJokers"
        :player-color="player.color"
        game-state="question_display"
        @use-joker="handleUseJoker"
      />
    </template>
  </div>
</template>
