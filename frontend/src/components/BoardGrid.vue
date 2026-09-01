<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Board, PlayerColor } from '../types/session'
import { COLOR_HEX } from '../types/session'

const props = defineProps<{
  board: Board
  playerColor: PlayerColor
  winningLine?: [number, number][] | null
  candidateFields?: [number, number][]
  interactive?: boolean
  revealingFields?: [number, number][]
  lastPlacedField?: [number, number] | null
}>()

const emit = defineEmits<{
  fieldClick: [row: number, col: number]
}>()

// Track board shake
const shaking = ref(false)

// Track the slam field separately so it persists across re-renders
const slamField = ref<[number, number] | null>(null)

watch(() => props.lastPlacedField, (newVal) => {
  if (newVal) {
    slamField.value = [newVal[0], newVal[1]]
    shaking.value = true
    setTimeout(() => { shaking.value = false }, 350)
    setTimeout(() => { slamField.value = null }, 500)
  }
})

function isWinningField(row: number, col: number): boolean {
  return props.winningLine?.some(([r, c]) => r === row && c === col) ?? false
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

function colLabel(col: number): string {
  return String.fromCharCode(65 + col)
}

function cellStyle(row: number, col: number): Record<string, string> {
  const winning = isWinningField(row, col)
  const candidate = isCandidateField(row, col)
  const revealing = isRevealingField(row, col)
  const color = COLOR_HEX[props.playerColor]

  return {
    backgroundColor: revealing
      ? color + '40'
      : candidate
        ? color + '25'
        : 'rgba(255, 255, 255, 0.02)',
    border: winning
      ? '1.5px solid rgba(250, 204, 21, 0.6)'
      : revealing
        ? `1px solid ${color}60`
        : '0.5px solid rgba(255, 255, 255, 0.06)',
    boxShadow: winning
      ? '0 0 12px rgba(250, 204, 21, 0.3)'
      : revealing
        ? `0 0 16px ${color}40, inset 0 0 12px ${color}30`
        : candidate
          ? `inset 0 0 12px ${color}20`
          : 'inset 0 1px 2px rgba(0, 0, 0, 0.2)',
    transition: 'background-color 0.1s, border-color 0.1s, box-shadow 0.1s',
  }
}

function pegStyle(row: number, col: number): Record<string, string> {
  const color = COLOR_HEX[props.playerColor]
  const winning = isWinningField(row, col)

  return {
    background: `radial-gradient(circle at 35% 30%, ${color}ee, ${color} 50%, ${color}bb 100%)`,
    boxShadow: winning
      ? `0 0 16px ${color}80, 0 2px 6px rgba(0, 0, 0, 0.5), inset 0 -3px 6px rgba(0, 0, 0, 0.3), inset 0 2px 4px rgba(255, 255, 255, 0.2)`
      : `0 2px 8px rgba(0, 0, 0, 0.5), inset 0 -3px 6px rgba(0, 0, 0, 0.25), inset 0 2px 4px rgba(255, 255, 255, 0.15)`,
  }
}
</script>

<template>
  <div
    class="inline-block p-3 rounded-xl"
    :class="shaking ? 'animate-board-shake' : ''"
    :style="{
      background: 'linear-gradient(135deg, rgba(15, 15, 25, 0.8) 0%, rgba(10, 10, 18, 0.9) 100%)',
      border: '1px solid rgba(255, 255, 255, 0.06)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.03)'
    }"
  >
    <!-- Column labels -->
    <div class="flex ml-8">
      <div
        v-for="c in board.size"
        :key="'col-' + c"
        class="w-12 h-6 flex items-center justify-center text-[10px] text-gray-500 font-mono tracking-wider"
      >
        {{ colLabel(c - 1) }}
      </div>
    </div>
    <!-- Grid rows -->
    <div
      v-for="r in board.size"
      :key="'row-' + r"
      class="flex items-center"
    >
      <!-- Row label -->
      <div class="w-8 h-12 flex items-center justify-center text-[10px] text-gray-500 font-mono tracking-wider">
        {{ r }}
      </div>
      <!-- Fields -->
      <div
        v-for="c in board.size"
        :key="'field-' + r + '-' + c"
        class="w-12 h-12 flex items-center justify-center relative"
        :class="[
          isCandidateField(r - 1, c - 1) ? 'cursor-pointer animate-cell-pulse' : '',
        ]"
        :style="cellStyle(r - 1, c - 1)"
        @click="handleClick(r - 1, c - 1)"
      >
        <!-- Cell flash overlay on slam -->
        <div
          v-if="isSlamField(r - 1, c - 1)"
          class="absolute inset-0 rounded-sm animate-cell-flash"
          :style="{ backgroundColor: COLOR_HEX[playerColor] + '60' }"
        ></div>
        <!-- Peg -->
        <div
          v-if="board.fields[r - 1]?.[c - 1]"
          class="w-8 h-8 rounded-full"
          :class="[
            isWinningField(r - 1, c - 1) ? 'scale-110' : '',
            isSlamField(r - 1, c - 1) ? 'animate-peg-slam' : '',
          ]"
          :style="pegStyle(r - 1, c - 1)"
        ></div>
      </div>
    </div>
  </div>
</template>
