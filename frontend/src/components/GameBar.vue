<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/game'
import { useBoardSheet } from '../composables/useBoardSheet'
import MiniBoard from './MiniBoard.vue'

/**
 * The chrome every in-game screen shares: the current player's own board as a
 * hushed read-out on the left, the round badge in the middle (which is also
 * the handle for the board sheet), and settings on the right.
 */
const game = useGameStore()
const sheet = useBoardSheet()

const player = computed(() => game.currentPlayer)
</script>

<template>
  <div class="qt-topbar qt-doodles qt-doodles--deep">
    <MiniBoard
      v-if="player"
      :board="player.board"
      :player-color="player.color"
    />
    <!-- keeps the bar balanced before a game has started -->
    <div v-else style="width: 44px"></div>

    <button
      class="qt-badge"
      :aria-expanded="sheet.isOpen.value"
      aria-label="Spielfelder"
      @click="sheet.toggle()"
    >
      <span class="qt-badge-value">{{ game.round }}</span>
      <span class="qt-badge-chevron"></span>
    </button>

    <button class="qt-icon-btn" aria-label="Einstellungen">⚙</button>
  </div>
</template>
