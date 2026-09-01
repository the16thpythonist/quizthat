<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import JokerTray from '../components/JokerTray.vue'
import MapQuestion from '../components/MapQuestion.vue'
import type {
  JokerType,
  MultipleChoiceAnswerData,
  SortingAnswerData,
  CalculationAnswerData,
  MapLocationAnswerData,
} from '../types/session'
import { COLOR_HEX } from '../types/session'

const { t } = useI18n()
const game = useGameStore()

const player = computed(() => game.currentPlayer)
const question = computed(() => game.currentQuestion)
const isPassPhase = computed(() => game.state === 'pass_answering')
const usedJokers = computed(() => game.turn?.jokers_used_this_turn ?? new Set<JokerType>())
const hintRevealed = computed(() => game.turn?.hint_revealed ?? false)
const doubleDownActive = computed(() => game.turn?.double_down_active ?? false)

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
  game.submitAnswer(correct)
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
  game.submitAnswer(correct)
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
  game.submitAnswer(correct)
}

function calcKeyStyle(key: string): Record<string, string> {
  if (key === 'submit') {
    return {
      background: 'linear-gradient(180deg, #16a34a 0%, #15803d 100%)',
      border: '1px solid rgba(34, 197, 94, 0.3)',
      boxShadow: '0 0 12px rgba(34, 197, 94, 0.2), 0 2px 8px rgba(0, 0, 0, 0.3)',
    }
  }
  if (key === 'backspace') {
    return {
      background: 'linear-gradient(180deg, rgba(127, 29, 29, 0.7) 0%, rgba(80, 20, 20, 0.8) 100%)',
      border: '1px solid rgba(239, 68, 68, 0.2)',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
    }
  }
  return {
    background: 'linear-gradient(180deg, rgba(55, 55, 75, 0.9) 0%, rgba(40, 40, 55, 0.95) 100%)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
  }
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

// Init sorting if needed
if (question.value?.question_type === 'sorting') {
  initSorting()
}

const CALC_KEYS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  ['-', '0', '.'],
  [',', 'backspace', 'submit'],
]
</script>

<template>
  <div
    class="flex flex-col min-h-screen bg-game-dark text-white transition-colors duration-1000"
    :style="bgStyle"
  >
    <!-- Header -->
    <div
      class="flex items-center justify-between px-6 py-3 glass-surface"
      :style="player ? {
        background: `${COLOR_HEX[player.color]}15`,
        borderBottom: `1px solid ${COLOR_HEX[player.color]}25`,
      } : {}"
    >
      <div class="flex items-center gap-3">
        <div
          class="w-8 h-8 rounded-full ring-2 ring-white/10"
          :style="{
            backgroundColor: player ? COLOR_HEX[player.color] : '#666',
            boxShadow: player ? `0 0 12px ${COLOR_HEX[player.color]}60` : 'none'
          }"
        ></div>
        <span class="font-semibold">{{ player?.name }}</span>
      </div>
      <div v-if="doubleDownActive" class="text-amber-400 font-bold text-sm animate-pulse">
        {{ t('question.doubleDownActive') }}
      </div>
    </div>

    <!-- Question content -->
    <div class="flex-1 flex flex-col overflow-y-auto p-6">
      <!-- Loading state when question data hasn't arrived yet -->
      <div v-if="!question" class="flex items-center justify-center h-full">
        <p class="text-gray-500 text-lg animate-pulse">Loading question…</p>
      </div>

      <div v-else class="max-w-2xl mx-auto w-full" :class="question.question_type === 'map_location' ? 'flex flex-col flex-1 max-w-none' : ''">
        <!-- Question mark icon -->
        <div class="flex justify-center mb-5">
          <div
            class="w-16 h-16 rounded-full flex items-center justify-center text-3xl font-black"
            :style="{
              background: player ? `${COLOR_HEX[player.color]}18` : 'rgba(255,255,255,0.06)',
              border: `2px solid ${player ? COLOR_HEX[player.color] + '40' : 'rgba(255,255,255,0.1)'}`,
              color: player ? COLOR_HEX[player.color] : '#999',
              boxShadow: player ? `0 0 20px ${COLOR_HEX[player.color]}20` : 'none',
            }"
          >?</div>
        </div>

        <!-- Question text -->
        <h2
          class="text-2xl md:text-3xl font-bold mb-8 leading-relaxed text-center"
          :style="{ textShadow: '0 2px 8px rgba(0, 0, 0, 0.5)' }"
        >
          {{ question.question_text }}
        </h2>

        <!-- Hint -->
        <div
          v-if="hintRevealed && question?.hint"
          class="mb-6 p-4 rounded-xl backdrop-blur-sm"
          :style="{
            background: 'linear-gradient(135deg, rgba(120, 53, 15, 0.25) 0%, rgba(80, 35, 10, 0.3) 100%)',
            border: '1px solid rgba(217, 119, 6, 0.3)',
            boxShadow: '0 0 20px rgba(245, 158, 11, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
          }"
        >
          <span class="text-sm text-amber-400 font-semibold">{{ t('question.hint') }}:</span>
          <p class="text-amber-200 mt-1">{{ question.hint }}</p>
        </div>

        <!-- Multiple Choice answers -->
        <div
          v-if="question?.question_type === 'multiple_choice'"
          class="space-y-3"
        >
          <button
            v-for="(option, idx) in (question.answer_data as MultipleChoiceAnswerData).options"
            :key="idx"
            class="w-full text-left p-5 rounded-2xl text-xl transition-all duration-200 touch-manipulation glass-card inner-shine hover:scale-[1.01] active:scale-[0.99]"
            @click="handleMultipleChoiceAnswer(idx)"
          >
            <span class="text-gray-500 font-mono mr-3 text-sm bg-white/5 w-7 h-7 inline-flex items-center justify-center rounded-lg">{{ String.fromCharCode(65 + idx) }}</span>
            {{ option }}
          </button>
        </div>

        <!-- Sorting -->
        <div v-else-if="question?.question_type === 'sorting'" class="space-y-4">
          <p class="text-gray-400 text-sm mb-4">
            {{ t('question.sortInstruction', { metric: (question.answer_data as SortingAnswerData).metric }) }}
          </p>
          <div ref="sortListEl" class="space-y-2" @touchmove.prevent="onTouchMove" @touchend="onTouchEnd">
            <div
              v-for="(item, idx) in sortItems"
              :key="item.originalIndex"
              draggable="true"
              class="w-full p-5 rounded-2xl text-xl font-medium glass-card cursor-grab select-none"
              :class="[
                dragIndex === idx || touchDragIdx === idx ? 'opacity-40 scale-[0.97]' : 'hover:scale-[1.01]',
              ]"
              :style="{ transition: 'transform 0.2s, opacity 0.2s' }"
              @dragstart="onDragStart(idx, $event)"
              @dragover="onDragOver(idx, $event)"
              @dragend="onDragEnd"
              @touchstart="onTouchStart(idx, $event)"
            >
              <div class="flex items-center">
                <span class="text-gray-500 mr-3 text-base">⠿</span>
                <span class="text-gray-400 mr-3">{{ idx + 1 }}.</span>
                {{ item.text }}
              </div>
            </div>
          </div>
          <button
            class="w-full py-4 text-white text-lg font-bold rounded-2xl transition-all duration-200 touch-manipulation mt-4 hover:scale-[1.01] active:scale-[0.99]"
            :style="{
              background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
              boxShadow: '0 0 20px rgba(34, 197, 94, 0.2), 0 4px 16px rgba(0, 0, 0, 0.3)',
              border: '1px solid rgba(34, 197, 94, 0.3)'
            }"
            @click="submitSortAnswer"
          >
            {{ t('question.submit') }}
          </button>
        </div>

        <!-- Calculation -->
        <div v-else-if="question?.question_type === 'calculation'" class="space-y-4">
          <p class="text-gray-400 text-sm">{{ t('question.calcInstruction') }}</p>
          <!-- Display -->
          <div
            class="rounded-xl p-4 text-right glass-card"
            :style="{ boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.3)' }"
          >
            <span class="text-3xl font-mono">
              {{ calcInput || '0' }}
            </span>
            <span class="text-gray-400 text-lg ml-2">
              {{ (question.answer_data as CalculationAnswerData).unit }}
            </span>
          </div>
          <!-- Keypad -->
          <div class="space-y-2">
            <div
              v-for="(row, rowIdx) in CALC_KEYS"
              :key="rowIdx"
              class="flex gap-2"
            >
              <button
                v-for="key in row"
                :key="key"
                class="flex-1 py-4 rounded-xl text-xl font-bold transition-all duration-150 touch-manipulation hover:scale-[1.03] active:scale-[0.97] text-white"
                :class="key === 'backspace' ? 'text-red-300' : ''"
                :style="calcKeyStyle(key)"
                @click="handleCalcKey(key)"
              >
                {{ key === 'backspace' ? '⌫' : key === 'submit' ? '✓' : key }}
              </button>
            </div>
          </div>
        </div>

        <!-- Map Location -->
        <div v-else-if="question?.question_type === 'map_location'" class="flex flex-col flex-1">
          <p class="text-gray-400 text-sm mb-3 text-center">{{ t('question.mapInstruction') }}</p>
          <MapQuestion
            :answer-data="(question.answer_data as MapLocationAnswerData)"
            @answer="(correct: boolean) => game.submitAnswer(correct)"
          />
        </div>

        <!-- Pass: Decline button -->
        <div v-if="isPassPhase" class="mt-6">
          <button
            class="w-full py-3 text-gray-300 text-lg rounded-2xl transition-all duration-200 touch-manipulation glass-card hover:scale-[1.01] active:scale-[0.99]"
            @click="handleDecline"
          >
            Decline
          </button>
        </div>
      </div>
    </div>

    <!-- Joker Tray (not during pass) -->
    <div v-if="!isPassPhase && player" class="px-4 pb-4">
      <JokerTray
        :jokers="player.jokers"
        :used-this-turn="usedJokers"
        :player-color="player.color"
        game-state="question_display"
        @use-joker="handleUseJoker"
      />
    </div>
  </div>
</template>
