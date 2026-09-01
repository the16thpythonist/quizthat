<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import JokerTray from '../components/JokerTray.vue'
import type { JokerType } from '../types/session'
import { COLOR_HEX } from '../types/session'

const { t } = useI18n()
const game = useGameStore()

const player = computed(() => game.currentPlayer)
const slots = computed(() => game.turn?.offered_slots ?? [])
const usedJokers = computed(() => game.turn?.jokers_used_this_turn ?? new Set<JokerType>())

const SLOT_BORDER_COLORS = ['#CD7F32', '#C0C0C0', '#C0C0C0', '#FFD700']
const SLOT_LABELS = ['slot1Label', 'slot2Label', 'slot3Label', 'slot4Label']
const MAX_STARS = 4

function difficultyLevel(difficulty: string): number {
  const map: Record<string, number> = { easy: 1, medium: 2, hard: 3, very_hard: 4 }
  return map[difficulty] ?? 1
}

function slotCardStyle(idx: number): Record<string, string> {
  const color = SLOT_BORDER_COLORS[idx]!
  return {
    borderColor: color + '30',
    boxShadow: `0 2px 12px rgba(0,0,0,0.4), 0 0 8px ${color}10`,
  }
}

function placementText(slot: { constraint: { display: string } | null; slot_type: string }): string {
  if (slot.constraint) return slot.constraint.display
  if (slot.slot_type === 'expertise') return t('selection.constraintRandom')
  if (slot.slot_type === 'hard') return t('selection.constraintFree')
  return ''
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
  <div class="flex flex-col min-h-screen bg-game-dark text-white">
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
        <span class="text-lg font-semibold">{{ player?.name }}</span>
      </div>
      <h2 class="text-xl font-bold">{{ t('selection.title') }}</h2>
      <div class="w-16"></div>
    </div>

    <!-- Question Cards — equally spaced -->
    <div class="flex-1 flex flex-col justify-evenly p-4 overflow-y-auto">
      <button
        v-for="(slot, idx) in slots"
        :key="idx"
        class="w-full max-w-xl mx-auto text-left px-5 py-4 rounded-2xl border transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] touch-manipulation relative glass-card inner-shine"
        :style="slotCardStyle(idx)"
        @click="handleSelectSlot(idx)"
      >
        <!-- Top row: category + stars + 2x badge -->
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-400 uppercase tracking-wider">{{ slot.major_category }}</span>
            <div class="flex items-center gap-0.5">
              <span
                v-for="s in MAX_STARS"
                :key="s"
                class="text-[11px]"
                :class="s <= difficultyLevel(slot.difficulty) ? 'text-amber-400' : 'text-gray-700'"
              >★</span>
            </div>
          </div>
          <span
            v-if="slot.has_2x_boost"
            class="bg-amber-500 text-black text-[10px] font-black px-2 py-0.5 rounded-full"
            :style="{ boxShadow: '0 0 12px rgba(245, 158, 11, 0.5)' }"
          >
            {{ t('selection.twoXBadge') }}
          </span>
        </div>

        <!-- Title -->
        <h3 class="text-xl font-bold mb-3">{{ slot.teaser_title }}</h3>

        <!-- Bottom row: tier badge + placement -->
        <div class="flex items-center justify-between">
          <span
            class="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full"
            :style="{
              backgroundColor: SLOT_BORDER_COLORS[idx] + '18',
              color: SLOT_BORDER_COLORS[idx],
              border: `1px solid ${SLOT_BORDER_COLORS[idx]}25`,
            }"
          >
            {{ t('selection.' + SLOT_LABELS[idx]) }}
          </span>
          <span class="text-[11px] text-gray-500">{{ placementText(slot) }}</span>
        </div>
      </button>
    </div>

    <!-- Joker Tray -->
    <div class="px-4 pb-4">
      <JokerTray
        v-if="player"
        :jokers="player.jokers"
        :used-this-turn="usedJokers"
        :player-color="player.color"
        game-state="selection"
        @use-joker="handleUseJoker"
      />
    </div>
  </div>
</template>
