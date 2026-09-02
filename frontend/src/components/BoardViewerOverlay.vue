<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import { useBoardSheet } from '../composables/useBoardSheet'
import BoardGrid from './BoardGrid.vue'
import JokerIcon from './JokerIcon.vue'
import { COLOR_HEX } from '../types/session'
import type { JokerType } from '../types/session'

/**
 * The board sheet: one player per slide, dropping down from under the bar.
 *
 * Opened by the round badge in GameBar. The active player is always the first
 * slide, so the sheet answers "where do I stand" before "where does everyone
 * else stand".
 */
const { t } = useI18n()
const game = useGameStore()
const sheet = useBoardSheet()

const JOKER_ORDER: JokerType[] = [
  'reshuffle_selection',
  'reshuffle_question',
  'reveal_hint',
  'the_gambler',
  'steal',
  'curse',
  'snipe',
  'double_down',
]

/** Players rotated so the one at the device comes first. */
const ordered = computed(() => {
  const list = game.players
  if (list.length === 0) return []
  const start = game.currentPlayerIndex
  return [...list.slice(start), ...list.slice(0, start)]
})

const slide = ref(0)
const current = computed(() => ordered.value[slide.value] ?? null)

// always reopen on the active player
watch(() => sheet.isOpen.value, (open) => {
  if (open) slide.value = 0
})

function go(delta: number) {
  const n = ordered.value.length
  if (n === 0) return
  slide.value = (slide.value + delta + n) % n
}

/** Jokers this player still holds, in a stable order. */
function heldJokers(jokers: Record<JokerType, number>) {
  return JOKER_ORDER.map((type) => ({ type, count: jokers[type] })).filter((j) => j.count > 0)
}

function jokerTotal(jokers: Record<JokerType, number>): number {
  return JOKER_ORDER.reduce((sum, type) => sum + jokers[type], 0)
}

// --- swipe between slides ---
const touchStartX = ref<number | null>(null)

function onTouchStart(e: TouchEvent) {
  touchStartX.value = e.touches[0]?.clientX ?? null
}

function onTouchEnd(e: TouchEvent) {
  if (touchStartX.value === null) return
  const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.value
  if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1)
  touchStartX.value = null
}
</script>

<template>
  <template v-if="sheet.isOpen.value && game.status === 'in_progress'">
    <div class="qt-backdrop" @click="sheet.close()"></div>

    <div
      class="qt-sheet qt-doodles qt-doodles--deep"
      @touchstart="onTouchStart"
      @touchend="onTouchEnd"
    >
      <div class="qt-sheet-title">{{ t('board.viewBoards') }}</div>

      <div class="qt-slide-nav">
        <button class="qt-arrow" :disabled="ordered.length < 2" aria-label="Zurück" @click="go(-1)">‹</button>

        <div v-if="current" class="qt-slide">
          <div class="qt-slide-head">
            <span class="qt-chip" :style="{ backgroundColor: COLOR_HEX[current.color] }"></span>
            <span class="qt-slide-name">{{ current.name }}</span>
            <span v-if="slide === 0" class="qt-slide-badge">{{ t('board.onTurn') }}</span>
          </div>

          <BoardGrid
            :board="current.board"
            :player-color="current.color"
          />

          <div class="qt-slide-stats">
            <div class="qt-stat">
              <span class="qt-stat-value">{{ current.board.peg_count }}</span>
              <span class="qt-stat-label">{{ t('board.pegsLabel') }}</span>
            </div>
            <div class="qt-stat">
              <span class="qt-stat-value">
                {{ current.stats.questions_correct }}/{{ current.stats.questions_attempted }}
              </span>
              <span class="qt-stat-label">{{ t('board.correctLabel') }}</span>
            </div>
            <div class="qt-stat">
              <span class="qt-stat-value">{{ jokerTotal(current.jokers) }}</span>
              <span class="qt-stat-label">{{ t('board.jokersLabel') }}</span>
            </div>
          </div>

          <div v-if="heldJokers(current.jokers).length" class="qt-slide-jokers">
            <div
              v-for="j in heldJokers(current.jokers)"
              :key="j.type"
              class="qt-mini-joker"
              :title="t('jokerNames.' + j.type)"
            >
              <JokerIcon :type="j.type" :size="15" />
              <span v-if="j.count > 1" class="qt-mini-count">{{ j.count }}</span>
            </div>
          </div>

          <div v-if="ordered.length > 1" class="qt-slide-foot">
            <span
              v-for="(p, i) in ordered"
              :key="p.index"
              class="qt-dot"
              :class="i === slide ? 'qt-dot--on' : ''"
            ></span>
          </div>
        </div>

        <button class="qt-arrow" :disabled="ordered.length < 2" aria-label="Weiter" @click="go(1)">›</button>
      </div>
    </div>
  </template>
</template>
