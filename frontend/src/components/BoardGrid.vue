<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { Board, PlayerColor } from '../types/session'
import { COLOR_HEX } from '../types/session'
import { findCompletedLines } from '../engine/algorithms'

const props = withDefaults(defineProps<{
  board: Board
  playerColor: PlayerColor
  candidateFields?: [number, number][]
  interactive?: boolean
  revealingFields?: [number, number][]
  lastPlacedField?: [number, number] | null
  /** Cell edge length in px — smaller inside the board sheet than on the placement screen. */
  cellSize?: number
  /** Show A1..D4 labels; on for placement, off for read-only views. */
  labels?: boolean
}>(), {
  cellSize: 46,
  labels: false,
})

const emit = defineEmits<{
  fieldClick: [row: number, col: number]
}>()

const shaking = ref(false)
// tracked separately so the slam survives re-renders
const slamField = ref<[number, number] | null>(null)

watch(() => props.lastPlacedField, (newVal) => {
  if (newVal) {
    slamField.value = [newVal[0], newVal[1]]
    shaking.value = true
    setTimeout(() => { shaking.value = false }, 350)
    setTimeout(() => { slamField.value = null }, 500)
  }
})

const pegSize = computed(() => Math.round(props.cellSize * 0.65))
const color = computed(() => COLOR_HEX[props.playerColor])

/**
 * Completed lines are derived from the board rather than passed in, so a line
 * lights up the moment it closes and stays lit for the rest of the game. With
 * two lines needed to win, that is how everyone can see who is one line away.
 */
const completed = computed(() => findCompletedLines(props.board).flat())

function isWinningField(row: number, col: number): boolean {
  return completed.value.some(([r, c]) => r === row && c === col)
}

function isCandidateField(row: number, col: number): boolean {
  return props.candidateFields?.some(([r, c]) => r === row && c === col) ?? false
}

function isRevealingField(row: number, col: number): boolean {
  return props.revealingFields?.some(([r, c]) => r === row && c === col) ?? false
}

function isSlamField(row: number, col: number): boolean {
  return slamField.value?.[0] === row && slamField.value?.[1] === col
}

function isFieldEmpty(row: number, col: number): boolean {
  const boardRow = props.board.fields[row]
  return boardRow ? !boardRow[col] : false
}

function handleClick(row: number, col: number) {
  if (!props.interactive) return
  if (isCandidateField(row, col) || (props.candidateFields === undefined && isFieldEmpty(row, col))) {
    emit('fieldClick', row, col)
  }
}

function fieldLabel(row: number, col: number): string {
  return String.fromCharCode(65 + col) + (row + 1)
}

function pegStyle(row: number, col: number): Record<string, string> {
  const c = color.value
  return {
    width: pegSize.value + 'px',
    height: pegSize.value + 'px',
    background: `radial-gradient(circle at 35% 30%, ${c}ee, ${c} 55%, ${c}bb 100%)`,
    ...(isWinningField(row, col)
      ? { boxShadow: `0 0 16px ${c}80, inset 0 -3px 6px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.25)` }
      : {}),
  }
}
</script>

<template>
  <div
    class="qt-board"
    :class="shaking ? 'animate-board-shake' : ''"
    :style="{ gridTemplateColumns: `repeat(${board.size}, ${cellSize}px)` }"
  >
    <template v-for="r in board.size" :key="'row-' + r">
      <div
        v-for="c in board.size"
        :key="'f-' + r + '-' + c"
        class="qt-cell"
        :class="{
          'qt-cell--line': isWinningField(r - 1, c - 1),
          'qt-cell--cand': isCandidateField(r - 1, c - 1) || isRevealingField(r - 1, c - 1),
          'cursor-pointer': interactive && isCandidateField(r - 1, c - 1),
        }"
        :style="{ width: cellSize + 'px', height: cellSize + 'px' }"
        @click="handleClick(r - 1, c - 1)"
      >
        <div
          v-if="isSlamField(r - 1, c - 1)"
          class="absolute inset-0 rounded-[11px] animate-cell-flash"
          :style="{ backgroundColor: color + '60' }"
        ></div>

        <span
          v-if="board.fields[r - 1]?.[c - 1]"
          class="qt-peg"
          :class="isSlamField(r - 1, c - 1) ? 'animate-peg-slam' : ''"
          :style="pegStyle(r - 1, c - 1)"
        ></span>

        <span v-if="labels" class="qt-cell-label">{{ fieldLabel(r - 1, c - 1) }}</span>
      </div>
    </template>
  </div>
</template>
