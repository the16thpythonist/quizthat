<script setup lang="ts">
import { ref, computed, reactive, onUnmounted } from 'vue'
import BoardGrid from '../components/BoardGrid.vue'
import type { Board, PlayerColor } from '../types/session'
import { PLAYER_COLORS, COLOR_HEX } from '../types/session'
import { audioManager } from '../audio/audioManager'
import { SFX, RATTLE_PITCH_JITTER } from '../audio/sfx'

// --- Reveal settings, adjustable so the animation can be tuned against the
// --- audio without editing PegPlacementScreen.
const candidateCount = ref(2)
const revealDuration = ref(1000)
const startInterval = ref(60)
const slowdown = ref(240)
const soundOn = ref(true)
const revealCounts = [1, 2, 3, 4]
const durations = [600, 1000, 1600, 2400]

const boardSize = ref(4)
const playerColor = ref<PlayerColor>('red')

const board = reactive<Board>({
  size: 4,
  fields: createFields(4),
  peg_count: 0,
})

function createFields(size: number): boolean[][] {
  return Array.from({ length: size }, () => Array(size).fill(false))
}

function resetBoard() {
  board.size = boardSize.value
  board.fields = createFields(boardSize.value)
  board.peg_count = 0
  revealingFields.value = []
  candidateFields.value = []
  lastPlacedField.value = null
  isRevealing.value = false
}

// --- Reveal animation state ---
const revealingFields = ref<[number, number][]>([])
const candidateFields = ref<[number, number][]>([])
const isRevealing = ref(false)
const lastPlacedField = ref<[number, number] | null>(null)
const revealTimers = ref<ReturnType<typeof setTimeout>[]>([])

function getEmptyFields(): [number, number][] {
  const fields: [number, number][] = []
  for (let r = 0; r < board.size; r++) {
    for (let c = 0; c < board.size; c++) {
      if (!board.fields[r]?.[c]) fields.push([r, c])
    }
  }
  return fields
}

function triggerReveal() {
  clearTimers()
  candidateFields.value = []
  revealingFields.value = []
  isRevealing.value = true
  lastPlacedField.value = null

  const eligible = getEmptyFields()
  if (eligible.length < candidateCount.value) return

  const shuffled = [...eligible].sort(() => Math.random() - 0.5)
  const finalCandidates = shuffled.slice(0, candidateCount.value)

  if (soundOn.value) audioManager.playSfx(SFX.PEG_RISER)

  const totalDuration = revealDuration.value
  let elapsed = 0
  let interval = startInterval.value
  let ticks = 0

  function tick() {
    if (elapsed >= totalDuration) {
      revealingFields.value = []
      candidateFields.value = finalCandidates
      isRevealing.value = false
      if (soundOn.value) audioManager.playSfx(SFX.PEG_LAND)
      lastRevealTicks.value = ticks
      return
    }

    const s = [...eligible].sort(() => Math.random() - 0.5)
    revealingFields.value = s.slice(0, candidateCount.value)
    ticks++
    if (soundOn.value) {
      audioManager.playSfx(SFX.ROULETTE_TICK, { pitchJitter: RATTLE_PITCH_JITTER })
    }

    elapsed += interval
    const progress = elapsed / totalDuration
    interval = startInterval.value + Math.floor(slowdown.value * (progress * progress))

    const timer = setTimeout(tick, interval)
    revealTimers.value.push(timer)
  }

  tick()
}

/** How many rattle hits the last run produced — useful when tuning the curve. */
const lastRevealTicks = ref(0)

/** Fire the reveal repeatedly, for judging whether it wears well. */
const looping = ref(false)
let loopTimer: ReturnType<typeof setTimeout> | null = null
function toggleLoop() {
  looping.value = !looping.value
  if (!looping.value) {
    if (loopTimer) clearTimeout(loopTimer)
    return
  }
  const run = () => {
    resetBoard()
    triggerReveal()
    loopTimer = setTimeout(() => {
      triggerPlacePeg()
      loopTimer = setTimeout(run, 900)
    }, revealDuration.value + 400)
  }
  run()
}

function triggerPlacePeg() {
  // Place on a random candidate, or random empty field
  const targets = candidateFields.value.length > 0 ? candidateFields.value : getEmptyFields()
  if (targets.length === 0) return
  if (soundOn.value) audioManager.playSfx(SFX.PEG_DROP)

  const [row, col] = targets[Math.floor(Math.random() * targets.length)]!
  const boardRow = board.fields[row]
  if (!boardRow || boardRow[col]) return

  boardRow[col] = true
  board.peg_count++
  lastPlacedField.value = [row, col]

  // Remove placed field from candidates
  candidateFields.value = candidateFields.value.filter(([r, c]) => !(r === row && c === col))
}

function handleFieldClick(row: number, col: number) {
  const boardRow = board.fields[row]
  if (!boardRow || boardRow[col]) return
  if (soundOn.value) audioManager.playSfx(SFX.PEG_DROP)

  boardRow[col] = true
  board.peg_count++
  lastPlacedField.value = [row, col]
  candidateFields.value = candidateFields.value.filter(([r, c]) => !(r === row && c === col))
}

function clearTimers() {
  revealTimers.value.forEach(clearTimeout)
  revealTimers.value = []
}

const boardSizes = [3, 4, 5]

const displayCandidates = computed(() => {
  return isRevealing.value ? [] : candidateFields.value
})

function goBack() {
  if (loopTimer) clearTimeout(loopTimer)
  looping.value = false
  window.location.hash = ''
}

onUnmounted(() => {
  if (loopTimer) clearTimeout(loopTimer)
})
</script>

<template>
  <div class="flex flex-col items-center min-h-screen bg-game-dark text-white p-6 overflow-y-auto">
    <h1 class="text-2xl font-bold mb-6" :style="{ textShadow: '0 2px 8px rgba(0, 0, 0, 0.5)' }">
      Animation Test
    </h1>

    <!-- Controls -->
    <div class="flex flex-wrap items-center justify-center gap-4 mb-8">
      <!-- Board size -->
      <div class="flex items-center gap-2">
        <span class="text-gray-400 text-sm">Size:</span>
        <button
          v-for="s in boardSizes"
          :key="s"
          class="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
          :style="{
            background: boardSize === s ? 'rgba(99, 102, 241, 0.3)' : 'rgba(255, 255, 255, 0.05)',
            border: boardSize === s ? '1px solid rgba(99, 102, 241, 0.5)' : '1px solid rgba(255, 255, 255, 0.08)',
          }"
          @click="boardSize = s; resetBoard()"
        >
          {{ s }}×{{ s }}
        </button>
      </div>

      <!-- Player color -->
      <div class="flex items-center gap-2">
        <span class="text-gray-400 text-sm">Color:</span>
        <button
          v-for="c in PLAYER_COLORS"
          :key="c"
          class="w-8 h-8 rounded-full transition-all"
          :style="{
            backgroundColor: COLOR_HEX[c],
            border: playerColor === c ? '2px solid white' : '2px solid transparent',
            opacity: playerColor === c ? 1 : 0.5,
            boxShadow: playerColor === c ? `0 0 12px ${COLOR_HEX[c]}60` : 'none',
          }"
          @click="playerColor = c"
        ></button>
      </div>
    </div>

    <!-- Reveal + audio settings -->
    <div class="flex flex-wrap items-center justify-center gap-4 mb-6">
      <div class="flex items-center gap-2">
        <span class="text-gray-400 text-sm">Candidates:</span>
        <button
          v-for="n in revealCounts"
          :key="'c' + n"
          class="px-3 py-1.5 rounded-lg text-sm font-medium"
          :style="{
            background: candidateCount === n ? 'rgba(99, 102, 241, 0.3)' : 'rgba(255, 255, 255, 0.05)',
            border: candidateCount === n ? '1px solid rgba(99, 102, 241, 0.5)' : '1px solid rgba(255, 255, 255, 0.08)',
          }"
          @click="candidateCount = n"
        >{{ n }}</button>
      </div>

      <div class="flex items-center gap-2">
        <span class="text-gray-400 text-sm">Duration:</span>
        <button
          v-for="d in durations"
          :key="'d' + d"
          class="px-3 py-1.5 rounded-lg text-sm font-medium"
          :style="{
            background: revealDuration === d ? 'rgba(99, 102, 241, 0.3)' : 'rgba(255, 255, 255, 0.05)',
            border: revealDuration === d ? '1px solid rgba(99, 102, 241, 0.5)' : '1px solid rgba(255, 255, 255, 0.08)',
          }"
          @click="revealDuration = d"
        >{{ d }}ms</button>
      </div>

      <div class="flex items-center gap-2">
        <span class="text-gray-400 text-sm">Slowdown:</span>
        <input v-model.number="slowdown" type="range" min="0" max="600" step="20" class="w-32" />
        <span class="text-gray-300 text-sm w-10">{{ slowdown }}</span>
      </div>

      <label class="flex items-center gap-2 text-sm text-gray-300">
        <input v-model="soundOn" type="checkbox" /> sound
      </label>

      <span class="text-gray-500 text-xs">last run: {{ lastRevealTicks }} rattle hits</span>
    </div>

    <!-- Action buttons -->
    <div class="flex gap-3 mb-8">
      <button
        class="px-5 py-2.5 rounded-xl font-semibold text-sm transition-all hover:scale-[1.03] active:scale-[0.97]"
        :style="{
          background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
          boxShadow: '0 0 16px rgba(99, 102, 241, 0.3), 0 4px 12px rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(129, 140, 248, 0.3)',
        }"
        :disabled="isRevealing"
        @click="triggerReveal"
      >
        Reveal Candidates
      </button>
      <button
        class="px-5 py-2.5 rounded-xl font-semibold text-sm transition-all hover:scale-[1.03] active:scale-[0.97]"
        :style="{
          background: `linear-gradient(135deg, ${COLOR_HEX[playerColor]}, ${COLOR_HEX[playerColor]}cc)`,
          boxShadow: `0 0 16px ${COLOR_HEX[playerColor]}30, 0 4px 12px rgba(0, 0, 0, 0.3)`,
          border: `1px solid ${COLOR_HEX[playerColor]}50`,
        }"
        @click="triggerPlacePeg"
      >
        Place Peg
      </button>
      <button
        class="px-5 py-2.5 rounded-xl font-semibold text-sm transition-all hover:scale-[1.03] active:scale-[0.97]"
        :style="{
          background: 'rgba(255, 255, 255, 0.06)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }"
        @click="resetBoard"
      >
        Reset
      </button>
          <button
        class="px-4 py-2 rounded-lg text-sm font-medium"
        :style="{
          background: looping ? 'rgba(220, 80, 80, 0.35)' : 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.12)',
        }"
        @click="toggleLoop"
      >{{ looping ? 'Stop loop' : 'Loop reveal' }}</button>
</div>

    <!-- Board -->
    <BoardGrid
      :board="board"
      :player-color="playerColor"
      :candidate-fields="displayCandidates"
      :revealing-fields="revealingFields"
      :interactive="!isRevealing"
      :last-placed-field="lastPlacedField"
      @field-click="handleFieldClick"
    />

    <!-- Info -->
    <p class="text-gray-500 text-sm mt-6">
      {{ board.peg_count }} pegs placed · {{ getEmptyFields().length }} empty
    </p>

    <!-- Back link -->
    <a
      href="#"
      class="mt-8 text-gray-500 text-sm hover:text-white transition-colors"
      @click.prevent="goBack"
    >
      ← Back to game
    </a>
  </div>
</template>
