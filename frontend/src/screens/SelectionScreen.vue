<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import GameBar from '../components/GameBar.vue'
import PlayerStrip from '../components/PlayerStrip.vue'
import JokerTray from '../components/JokerTray.vue'
import type { JokerType, OfferedSlot } from '../types/session'
import { SKULL_ICON } from '../components/jokerIcons'

const { t } = useI18n()
const game = useGameStore()

const player = computed(() => game.currentPlayer)
const slots = computed(() => game.turn?.offered_slots ?? [])
const usedJokers = computed(() => game.turn?.jokers_used_this_turn ?? new Set<JokerType>())

const SLOT_LABELS = ['slot1Label', 'slot2Label', 'slot3Label', 'slot4Label']
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

/** Slot 4 always awards a special joker on top of free placement. */
function awardsSpecialJoker(slot: OfferedSlot): boolean {
  return slot.slot_type === 'hard'
}

function handleSelectSlot(index: number) {
  game.selectSlot(index)
}

function handleUseJoker(type: JokerType) {
  if (type === 'reshuffle_selection') {
    game.useJoker('reshuffle_selection')
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
        <span v-if="slot.has_2x_boost || awardsSpecialJoker(slot)" class="qt-chips">
          <span v-if="slot.has_2x_boost" class="qt-boost">{{ t('selection.twoXBadge') }}</span>
          <span v-if="awardsSpecialJoker(slot)" class="qt-special">{{ t('selection.specialJoker') }}</span>
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
            {{ t('selection.' + SLOT_LABELS[idx]) }}
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
  </div>
</template>
