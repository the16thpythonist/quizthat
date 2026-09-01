<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import BoardGrid from './BoardGrid.vue'
import { COLOR_HEX } from '../types/session'

const { t } = useI18n()
const game = useGameStore()

const isOpen = ref(false)
const zoomedPlayerIndex = ref<number | null>(null)

const showOverlay = computed(() => game.status === 'in_progress')

function toggle() {
  isOpen.value = !isOpen.value
  zoomedPlayerIndex.value = null
}

function zoomPlayer(index: number) {
  zoomedPlayerIndex.value = zoomedPlayerIndex.value === index ? null : index
}

const zoomedPlayer = computed(() => {
  if (zoomedPlayerIndex.value === null) return null
  return game.players[zoomedPlayerIndex.value] ?? null
})
</script>

<template>
  <!-- Board viewer button (always visible during game) -->
  <button
    v-if="showOverlay"
    class="fixed top-0 right-0 z-40 px-4 py-3 text-white/50 text-xs uppercase tracking-wider touch-manipulation transition-colors duration-200 hover:text-white/80"
    @click="toggle"
  >
    {{ t('board.viewBoards') }}
  </button>

  <!-- Overlay -->
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center"
  >
    <!-- Backdrop -->
    <div
      class="absolute inset-0 bg-black/70 backdrop-blur-sm"
      @click="toggle"
    ></div>

    <!-- Content -->
    <div
      class="relative z-10 rounded-2xl p-6 max-w-5xl w-full mx-4 max-h-[90vh] overflow-y-auto"
      :style="{
        background: 'linear-gradient(135deg, rgba(12, 12, 20, 0.95) 0%, rgba(8, 8, 15, 0.98) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
      }"
    >
      <div class="flex items-center justify-between mb-6">
        <h2
          class="text-2xl font-bold text-white"
          :style="{ textShadow: '0 2px 8px rgba(0, 0, 0, 0.5)' }"
        >
          {{ t('board.viewBoards') }}
        </h2>
        <button
          class="text-gray-500 hover:text-white text-2xl touch-manipulation transition-colors"
          @click="toggle"
        >
          ✕
        </button>
      </div>

      <!-- Zoomed view -->
      <div v-if="zoomedPlayer" class="flex flex-col items-center">
        <button
          class="text-gray-400 hover:text-white mb-4 touch-manipulation transition-colors"
          @click="zoomedPlayerIndex = null"
        >
          ← Back to all boards
        </button>
        <div class="flex items-center gap-3 mb-4">
          <div
            class="w-8 h-8 rounded-full ring-2 ring-white/10"
            :style="{
              background: `radial-gradient(circle at 35% 35%, ${COLOR_HEX[zoomedPlayer.color]}dd, ${COLOR_HEX[zoomedPlayer.color]})`,
              boxShadow: `0 0 12px ${COLOR_HEX[zoomedPlayer.color]}50`,
            }"
          ></div>
          <span class="text-xl font-bold text-white">
            {{ t('board.title', { name: zoomedPlayer.name }) }}
          </span>
          <span class="text-gray-500">
            {{ t('board.pegs', { count: zoomedPlayer.board.peg_count }) }}
          </span>
        </div>
        <BoardGrid
          :board="zoomedPlayer.board"
          :player-color="zoomedPlayer.color"
        />
      </div>

      <!-- Grid of all boards -->
      <div v-else class="grid grid-cols-2 md:grid-cols-3 gap-6">
        <button
          v-for="player in game.players"
          :key="player.index"
          class="flex flex-col items-center p-4 rounded-xl transition-all duration-200 touch-manipulation hover:scale-[1.02] active:scale-[0.98]"
          :style="{
            background: `linear-gradient(135deg, ${COLOR_HEX[player.color]}10 0%, rgba(15, 15, 25, 0.8) 100%)`,
            border: `1px solid ${COLOR_HEX[player.color]}20`,
            boxShadow: `0 4px 16px rgba(0, 0, 0, 0.3), 0 0 12px ${COLOR_HEX[player.color]}08`,
          }"
          @click="zoomPlayer(player.index)"
        >
          <div class="flex items-center gap-2 mb-3">
            <div
              class="w-6 h-6 rounded-full ring-1 ring-white/10"
              :style="{
                background: `radial-gradient(circle at 35% 35%, ${COLOR_HEX[player.color]}dd, ${COLOR_HEX[player.color]})`,
                boxShadow: `0 0 8px ${COLOR_HEX[player.color]}40`,
              }"
            ></div>
            <span class="text-white font-semibold text-sm">{{ player.name }}</span>
            <span class="text-gray-500 text-xs">
              {{ t('board.pegs', { count: player.board.peg_count }) }}
            </span>
          </div>
          <BoardGrid
            :board="player.board"
            :player-color="player.color"
          />
        </button>
      </div>
    </div>
  </div>
</template>
