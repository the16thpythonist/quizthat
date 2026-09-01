<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import BoardGrid from '../components/BoardGrid.vue'
import { COLOR_HEX } from '../types/session'

const { t } = useI18n()
const game = useGameStore()

const placingPlayer = computed(() => {
  if (!game.turn) return null
  return game.players[game.turn.placing_player_index] ?? null
})

const board = computed(() => placingPlayer.value?.board ?? null)
const pegsRemaining = computed(() => game.turn?.pegs_remaining ?? 0)

const candidates = computed(() => {
  return game.turn?.candidate_fields ?? []
})

const isFree = computed(() => {
  return game.turn?.placement_rule?.type === 'free'
})

// For free placement, all empty fields are candidates
const effectiveCandidates = computed(() => {
  if (isFree.value && board.value) {
    const fields: [number, number][] = []
    for (let r = 0; r < board.value.size; r++) {
      for (let c = 0; c < board.value.size; c++) {
        if (!board.value.fields[r]?.[c]) {
          fields.push([r, c])
        }
      }
    }
    return fields
  }
  return candidates.value
})

// --- Gambling reveal animation ---
const isRevealing = ref(false)
const revealingFields = ref<[number, number][]>([])
const revealedCandidates = ref<[number, number][]>([])
const revealTimers = ref<ReturnType<typeof setTimeout>[]>([])
const canInteract = ref(false)

// Get all eligible fields for cycling (constraint-aware)
function getEligibleFields(): [number, number][] {
  if (!board.value) return []
  if (isFree.value) {
    // All empty fields
    const fields: [number, number][] = []
    for (let r = 0; r < board.value.size; r++) {
      for (let c = 0; c < board.value.size; c++) {
        if (!board.value.fields[r]?.[c]) fields.push([r, c])
      }
    }
    return fields
  }
  // For constrained/random, use all empty fields on the board
  // (the real candidates are a subset, but we cycle through all empties for drama)
  const fields: [number, number][] = []
  for (let r = 0; r < board.value.size; r++) {
    for (let c = 0; c < board.value.size; c++) {
      if (!board.value.fields[r]?.[c]) fields.push([r, c])
    }
  }
  return fields
}

function startReveal(finalCandidates: [number, number][]) {
  clearRevealTimers()
  isRevealing.value = true
  canInteract.value = false
  revealedCandidates.value = []

  const eligible = getEligibleFields()
  if (eligible.length === 0) {
    finishReveal(finalCandidates)
    return
  }

  const candidateCount = finalCandidates.length
  const totalDuration = 1000
  let elapsed = 0
  let interval = 60 // start fast

  function tick() {
    if (elapsed >= totalDuration) {
      finishReveal(finalCandidates)
      return
    }

    // Pick random subset of eligible fields
    const shuffled = [...eligible].sort(() => Math.random() - 0.5)
    revealingFields.value = shuffled.slice(0, candidateCount)

    elapsed += interval
    // Slow down over time: ease-out curve
    const progress = elapsed / totalDuration
    interval = 60 + Math.floor(240 * (progress * progress))

    const timer = setTimeout(tick, interval)
    revealTimers.value.push(timer)
  }

  tick()
}

function finishReveal(finalCandidates: [number, number][]) {
  revealingFields.value = []
  revealedCandidates.value = finalCandidates
  isRevealing.value = false
  canInteract.value = true
}

function clearRevealTimers() {
  revealTimers.value.forEach(clearTimeout)
  revealTimers.value = []
}

// Trigger reveal when candidates change
watch(effectiveCandidates, (newCandidates) => {
  if (newCandidates.length > 0 && !isFree.value) {
    startReveal(newCandidates)
  } else {
    // Free placement: show all immediately, no reveal
    revealedCandidates.value = newCandidates
    canInteract.value = true
  }
}, { immediate: true })

onUnmounted(() => {
  clearRevealTimers()
})

// --- Peg slam tracking ---
const lastPlacedField = ref<[number, number] | null>(null)

// After placing the last peg, pegsRemaining drops to 0 but we stay on this screen.
// We use a separate flag to prevent the same click that places the peg from
// also triggering the continue action (click bubbles from BoardGrid to outer div).
const awaitingContinueTap = ref(false)

const donePlacing = computed(() => !isRevealing.value && pegsRemaining.value === 0)

function handleFieldClick(row: number, col: number) {
  lastPlacedField.value = [row, col]
  canInteract.value = false
  game.placePeg(row, col)

  // If that was the last peg, enable continue on NEXT click (not this one)
  if (game.turn?.pegs_remaining === 0) {
    setTimeout(() => {
      awaitingContinueTap.value = true
    }, 0)
  }
}

function handleContinueTap() {
  if (!awaitingContinueTap.value) return
  game.confirmEndTurn()
}
</script>

<template>
  <div
    class="flex flex-col items-center justify-center min-h-screen bg-game-dark text-white p-6"
    @click="awaitingContinueTap ? handleContinueTap() : undefined"
  >
    <!-- Player indicator -->
    <div class="flex items-center gap-3 mb-4">
      <div
        class="w-10 h-10 rounded-full ring-2 ring-white/10"
        :style="{
          background: placingPlayer
            ? `radial-gradient(circle at 35% 35%, ${COLOR_HEX[placingPlayer.color]}dd, ${COLOR_HEX[placingPlayer.color]})`
            : '#666',
          boxShadow: placingPlayer ? `0 0 16px ${COLOR_HEX[placingPlayer.color]}50` : 'none'
        }"
      ></div>
      <span class="text-xl font-bold">{{ placingPlayer?.name }}</span>
    </div>

    <!-- Instruction -->
    <h2
      class="text-2xl font-bold mb-2"
      :style="{ textShadow: '0 2px 8px rgba(0, 0, 0, 0.5)' }"
    >
      {{ t('board.placePeg') }}
    </h2>
    <p class="text-gray-400 mb-6">
      {{ donePlacing ? '' : isRevealing ? t('board.revealing', 'Revealing fields...') : t('board.tapToPlace') }}
    </p>

    <!-- Pegs remaining -->
    <div
      v-if="pegsRemaining > 1"
      class="mb-4 text-amber-400 font-semibold px-4 py-1.5 rounded-full"
      :style="{
        background: 'rgba(245, 158, 11, 0.1)',
        border: '1px solid rgba(245, 158, 11, 0.2)',
        boxShadow: '0 0 12px rgba(245, 158, 11, 0.1)'
      }"
    >
      {{ t('board.pegsRemaining', { count: pegsRemaining }) }}
    </div>

    <!-- Board -->
    <div v-if="board && placingPlayer" class="mb-8">
      <BoardGrid
        :board="board"
        :player-color="placingPlayer.color"
        :candidate-fields="canInteract ? revealedCandidates : []"
        :revealing-fields="revealingFields"
        :interactive="canInteract"
        :last-placed-field="lastPlacedField"
        @field-click="handleFieldClick"
      />
    </div>

    <!-- Peg count -->
    <p v-if="!donePlacing" class="text-gray-500 text-sm">
      {{ t('board.pegs', { count: board?.peg_count ?? 0 }) }}
    </p>

    <!-- Tap to continue after last peg -->
    <p v-if="donePlacing" class="text-white/50 text-lg mt-4 animate-pulse">
      {{ t('answer.continue', 'Tap to continue') }}
    </p>
  </div>
</template>
