<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import { COLOR_HEX } from '../types/session'
import BoardGrid from './BoardGrid.vue'
import JokerIcon from './JokerIcon.vue'

/**
 * Target picker for the jokers that reach across the table.
 *
 * Curse and Duel need only a player. Snipe needs a player and then one of their
 * pegs, so it runs the same picker and follows it with their board. With a
 * single opponent the player step is skipped — there is nothing to choose.
 */
const { t } = useI18n()
const game = useGameStore()

const props = defineProps<{ joker: 'curse' | 'snipe' | 'duel' }>()
const emit = defineEmits<{ close: [] }>()

const opponents = computed(() =>
  game.players.filter((p) => p.index !== game.currentPlayerIndex),
)

/** Snipe and Duel are both pointless against an empty board — there is
 *  nothing there to take. */
const eligible = computed(() =>
  props.joker === 'curse'
    ? opponents.value
    : opponents.value.filter((p) => p.board.peg_count > 0),
)

const chosenIndex = ref<number | null>(
  eligible.value.length === 1 ? (eligible.value[0]?.index ?? null) : null,
)

const chosen = computed(() =>
  chosenIndex.value === null ? null : game.players[chosenIndex.value] ?? null,
)

function choose(index: number) {
  if (props.joker === 'curse') {
    game.applyCurse(index)
    emit('close')
    return
  }
  if (props.joker === 'duel') {
    game.startDuel(index)
    emit('close')
    return
  }
  chosenIndex.value = index
}

function snipe(row: number, col: number) {
  if (chosenIndex.value === null) return
  game.snipePeg(chosenIndex.value, row, col)
  emit('close')
}

/**
 * A single eligible opponent and a Curse needs no interaction at all — a Duel
 * still asks, because it is worth seeing who you are about to take on.
 *
 * In onMounted rather than in setup: a mutating store call during setup fires
 * on every render pass that constructs the component, not on a player's
 * decision. `applyCurse` now refuses when the joker is already spent, so a
 * repeat is harmless, but the effect still belongs to a lifecycle event.
 */
onMounted(() => {
  if (props.joker !== 'curse' || eligible.value.length !== 1) return
  const only = eligible.value[0]
  if (!only) return
  game.applyCurse(only.index)
  emit('close')
})
</script>

<template>
  <div class="qt-backdrop qt-backdrop--over" @click="emit('close')"></div>
  <div class="qt-sheet qt-sheet--up qt-sheet--over qt-sheet--tall">
    <div class="qt-sheet-title">{{ t('jokerNames.' + joker) }}</div>

    <div class="qt-joker-hero" style="width: 52px; height: 52px; border-radius: 17px">
      <JokerIcon :type="joker" :size="24" />
    </div>

    <p v-if="eligible.length === 0" class="qt-joker-desc">{{ t('joker.noTarget') }}</p>

    <!-- choose a player -->
    <template v-else-if="!chosen || joker === 'duel'">
      <p class="qt-joker-desc">{{ t(joker === 'duel' ? 'joker.chooseOpponent' : 'joker.chooseTarget') }}</p>
      <div class="qt-settings-list">
        <button
          v-for="opponent in eligible"
          :key="opponent.index"
          class="qt-player-row"
          style="width: 100%"
          @click="choose(opponent.index)"
        >
          <div class="qt-avatar" :style="{ backgroundColor: COLOR_HEX[opponent.color] }">
            {{ opponent.name.charAt(0).toUpperCase() }}
          </div>
          <div class="flex-1 min-w-0" style="text-align: left">
            <b style="display: block; font-size: 15px; font-weight: 900">{{ opponent.name }}</b>
            <span class="qt-stat-label">{{ t('board.pegs', { count: opponent.board.peg_count }) }}</span>
          </div>
        </button>
      </div>
    </template>

    <!-- then, for Snipe, one of their pegs -->
    <template v-else>
      <p class="qt-joker-desc">{{ t('joker.choosePeg', { name: chosen.name }) }}</p>
      <div class="flex justify-center">
        <BoardGrid
          :board="chosen.board"
          :player-color="chosen.color"
          :candidate-fields="[]"
          interactive
          :cell-size="46"
          labels
          @field-click="snipe"
        />
      </div>
    </template>

    <div class="qt-sheet-foot">
      <button class="qt-cta qt-cta--ghost" @click="emit('close')">{{ t('joker.cancel') }}</button>
    </div>
  </div>
</template>
