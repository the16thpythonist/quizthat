<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/game'
import { COLOR_HEX } from '../types/session'

/**
 * How far the round has got, and how close the battle is.
 *
 * One pip per player in turn order, filled with that player's colour once they
 * have played, then a square for the battle that closes the round. Derived
 * entirely from currentPlayerIndex — there is no separate progress state to
 * keep in step.
 */
const game = useGameStore()

const pips = computed(() =>
  game.players.map((player) => ({
    index: player.index,
    color: COLOR_HEX[player.color],
    done: player.index < game.currentPlayerIndex,
    active: player.index === game.currentPlayerIndex,
  })),
)

/** The battle is imminent once the last player is up, and live during it. */
const battleActive = computed(() => game.state.startsWith('battle_'))
const battleNext = computed(
  () => !battleActive.value && game.currentPlayerIndex === game.players.length - 1,
)
</script>

<template>
  <div v-if="pips.length" class="qt-round-track">
    <span
      v-for="pip in pips"
      :key="pip.index"
      class="qt-pip"
      :class="{ 'is-done': pip.done, 'is-active': pip.active }"
      :style="pip.done || pip.active ? { backgroundColor: pip.done ? pip.color : 'transparent', borderColor: pip.color } : undefined"
    ></span>

    <span
      class="qt-pip qt-pip--battle"
      :class="{ 'is-active': battleActive, 'is-next': battleNext }"
    ></span>
  </div>
</template>
