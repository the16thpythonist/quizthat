<script setup lang="ts">
import { computed } from 'vue'
import type { Board, PlayerColor } from '../types/session'
import { COLOR_HEX } from '../types/session'

const props = defineProps<{
  board: Board
  playerColor: PlayerColor
}>()

/** Flattened board, so the template can render one <i> per field. */
const fields = computed(() => props.board.fields.flat())
const color = computed(() => COLOR_HEX[props.playerColor])
</script>

<template>
  <div
    class="qt-mini-board"
    :style="{ gridTemplateColumns: `repeat(${board.size}, 8px)` }"
    :aria-label="`${board.peg_count} Pegs`"
  >
    <i
      v-for="(filled, i) in fields"
      :key="i"
      :style="filled ? { background: color } : undefined"
    ></i>
  </div>
</template>
