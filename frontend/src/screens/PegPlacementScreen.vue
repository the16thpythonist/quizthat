<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import { audioManager } from '../audio/audioManager'
import { SFX, RATTLE_PITCH_JITTER } from '../audio/sfx'
import BoardGrid from '../components/BoardGrid.vue'
import GameBar from '../components/GameBar.vue'
import PlayerStrip from '../components/PlayerStrip.vue'

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

/**
 * 'auto' means the reveal settles and the fields are simply taken — the player
 * has no say. That covers a placement setting of 1, the second chance, and the
 * Gambler, whose three fields rattle together and all land.
 */
const isAuto = computed(() => game.turn?.placement_rule?.mode === 'auto')

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

  // Swell under the whole reveal; the rattle ticks ride on top of it, one per
  // visual step, so the audio decelerates exactly as the animation does.
  audioManager.playSfx(SFX.PEG_RISER)

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
    audioManager.playSfx(SFX.ROULETTE_TICK, { pitchJitter: RATTLE_PITCH_JITTER })

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
  audioManager.playSfx(SFX.PEG_LAND)
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
  audioManager.playSfx(SFX.PEG_DROP)
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

/** The constraint from the selection screen, restated so the player can check
 *  the highlighted fields against what they were promised. */
const constraintLabel = computed(() => {
  const rule = game.turn?.placement_rule
  if (!rule) return ''
  if (rule.type === 'free') return t('selection.constraintFree')
  if (rule.constraint) return rule.constraint.display
  return t('selection.constraintRandom')
})

function handleContinueTap() {
  if (!awaitingContinueTap.value) return
  game.confirmEndTurn()
}
</script>

<template>
  <div class="qt-screen" @click="awaitingContinueTap ? handleContinueTap() : undefined">
    <GameBar />
    <PlayerStrip :player="placingPlayer" :context="t('board.placePeg')" />

    <div class="qt-verdict qt-doodles" style="justify-content: flex-start; padding-top: 30px">
      <h1 style="font-size: 24px; font-weight: 900; margin: 0 0 6px">
        {{ isFree ? t('board.placeFreely') : t('board.placePeg') }}
      </h1>
      <p class="qt-gate-sub" style="margin-bottom: 24px">
        <template v-if="isRevealing">{{ t('board.revealing') }}</template>
        <template v-else-if="pegsRemaining > 1">
          {{ t('board.pegsRemaining', { count: pegsRemaining }) }}
        </template>
        <template v-else-if="donePlacing">{{ t('answer.continue') }}</template>
        <template v-else>{{ constraintLabel }}</template>
      </p>

      <BoardGrid
        v-if="board && placingPlayer"
        :board="board"
        :player-color="placingPlayer.color"
        :candidate-fields="canInteract ? revealedCandidates : []"
        :revealing-fields="revealingFields"
        :interactive="canInteract"
        :last-placed-field="lastPlacedField"
        labels
        @field-click="handleFieldClick"
      />

      <p v-if="donePlacing" class="qt-gate-tap animate-pulse" style="margin-top: 26px">
        {{ t('board.tapToContinue') }}
      </p>
      <p v-else-if="!isRevealing && !isAuto" class="qt-gate-tap" style="margin-top: 26px">
        {{ t('board.tapToPlace') }}
      </p>
    </div>
  </div>
</template>
