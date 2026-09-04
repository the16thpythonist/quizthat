<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import { useActions } from '../composables/useActions'
import GameBar from '../components/GameBar.vue'
import PlayerStrip from '../components/PlayerStrip.vue'
import JokerTray from '../components/JokerTray.vue'
import JokerTargetSheet from '../components/JokerTargetSheet.vue'
import type { JokerType, OfferedSlot } from '../types/session'
import { SKULL_ICON } from '../components/jokerIcons'

const { t } = useI18n()
const game = useGameStore()
const act = useActions()

const player = computed(() => game.currentPlayer)
const slots = computed(() => game.turn?.offered_slots ?? [])
const usedJokers = computed(() => game.turn?.jokers_used_this_turn ?? new Set<JokerType>())

/**
 * The badge follows the slot's own type rather than its position. Keying it on
 * the index meant that if a card was ever missing, the remaining ones inherited
 * the wrong labels — a hard slot showing "Standard".
 */
const SLOT_LABEL_BY_TYPE: Record<string, string> = {
  expertise: 'slot1Label',
  standard: 'slot2Label',
  hard: 'slot4Label',
}
const MAX_SKULLS = 4

/** Difficulty is shown as filled skulls — comparable across categories,
 *  since IDEA.md calibrates difficulty consistently between them. */
function difficultyLevel(difficulty: string): number {
  const map: Record<string, number> = { easy: 1, medium: 2, hard: 3, very_hard: 4 }
  return map[difficulty] ?? 1
}

function placementText(slot: OfferedSlot): string {
  if (slot.constraint) return slot.constraint.display
  if (slot.slot_type === 'expertise') return t('selection.constraintRandom')
  if (slot.slot_type === 'hard') return t('selection.constraintFree')
  return ''
}

/** Slot 4 always awards one; standard slots sometimes do — that is the bait. */
function awardsJoker(slot: OfferedSlot): boolean {
  return slot.awards_joker
}

function handleSelectSlot(index: number) {
  act.selectSlot(index)
}

/** Curse, Snipe and Duel all need a target, so they open the same sheet. */
const targeting = ref<'curse' | 'snipe' | 'duel' | null>(null)

function handleUseJoker(type: JokerType) {
  if (type === 'reshuffle_selection') {
    void act.reshuffleSelection()
  } else if (type === 'the_gambler') {
    act.startGambler()
  } else if (type === 'curse' || type === 'snipe' || type === 'duel') {
    targeting.value = type
  }
}
</script>

<template>
  <div class="qt-screen">
    <GameBar />
    <PlayerStrip :player="player" :context="t('selection.title')" />

    <div class="qt-slots qt-doodles">
      <button
        v-for="(slot, idx) in slots"
        :key="idx"
        class="qt-slot-card"
        :class="{ 'qt-slot-card--special': slot.slot_type === 'hard' }"
        @click="handleSelectSlot(idx)"
      >
        <span v-if="slot.has_2x_boost || awardsJoker(slot)" class="qt-chips">
          <span v-if="slot.has_2x_boost" class="qt-boost">{{ t('selection.twoXBadge') }}</span>
          <span v-if="awardsJoker(slot)" class="qt-special">{{ t('selection.specialJoker') }}</span>
        </span>

        <div class="qt-slot-top">
          <span class="qt-slot-cat">{{ slot.major_category }}</span>
          <span class="qt-diff" :title="`${difficultyLevel(slot.difficulty)}/${MAX_SKULLS}`">
            <svg
              v-for="s in MAX_SKULLS"
              :key="s"
              class="qt-sk"
              :class="{ on: s <= difficultyLevel(slot.difficulty) }"
              :viewBox="SKULL_ICON.viewBox"
              width="13"
              height="13"
              aria-hidden="true"
            >
              <path :d="SKULL_ICON.d" />
            </svg>
          </span>
        </div>

        <div class="qt-slot-title">{{ slot.teaser_title }}</div>

        <div class="qt-slot-bottom">
          <span class="qt-tier" :class="{ 'qt-tier--special': slot.slot_type === 'hard' }">
            {{ t('selection.' + (SLOT_LABEL_BY_TYPE[slot.slot_type] ?? 'slot2Label')) }}
          </span>
          <span class="qt-placement">{{ placementText(slot) }}</span>
        </div>
      </button>
    </div>

    <JokerTray
      v-if="player"
      :jokers="player.jokers"
      :used-this-turn="usedJokers"
      :player-color="player.color"
      game-state="selection"
      @use-joker="handleUseJoker"
    />

    <JokerTargetSheet
      v-if="targeting"
      :joker="targeting"
      @close="targeting = null"
    />
  </div>
</template>
