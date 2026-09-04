<script setup lang="ts">
/**
 * What the question will look like at the table — approximately.
 *
 * Deliberately *not* the game's own screens. Those take a live `GameSession`, a
 * seat and a turn; feeding them a stub from here would mean the editor knowing
 * about state the engine owns, and it would break the moment a screen started
 * reading one more field. This is a standalone read of the same data, close
 * enough to judge phrasing and length by — which is what the preview is for.
 *
 * It will drift from the real screens. When it matters, play the question.
 */
import { computed } from 'vue'
import type { QuestionBody } from './api'

const props = defineProps<{ body: QuestionBody; questionType: string }>()

const answer = computed(() => props.body.answer_data ?? {})

const options = computed(() => (answer.value.options as string[]) ?? [])
const correctIndex = computed(() => Number(answer.value.correct_index ?? -1))
const items = computed(() => (answer.value.items as string[]) ?? [])
const correctOrder = computed(() => (answer.value.correct_order as number[]) ?? [])
const target = computed(() => answer.value.target as { lat: number; lng: number } | undefined)

/** The sorted items, spelled out, so the answer is readable rather than indices. */
const sortedItems = computed(() => correctOrder.value.map((index) => items.value[index] ?? '?'))

const numericAnswer = computed(() => {
  if (answer.value.correct_value === undefined) return null
  const unit = answer.value.unit ? ` ${answer.value.unit}` : ''
  const tolerance = answer.value.tolerance ? ` ± ${answer.value.tolerance}` : ''
  return `${answer.value.correct_value}${tolerance}${unit}`
})
</script>

<template>
  <div class="space-y-3">
    <!-- the teaser, as it sits in a slot on the board -->
    <div class="glass-card inner-shine rounded-lg px-4 py-3">
      <p class="text-[10px] uppercase tracking-widest text-slate-500">Teaser</p>
      <p class="mt-1 text-lg font-bold text-white">
        {{ body.teaser_title || '—' }}
      </p>
    </div>

    <!-- the question itself -->
    <div class="glass-card inner-shine rounded-lg px-4 py-4">
      <p class="text-base leading-relaxed text-slate-100">
        {{ body.question_text || '—' }}
      </p>

      <ul v-if="options.length" class="mt-3 space-y-1.5">
        <li
          v-for="(option, index) in options"
          :key="index"
          class="rounded border px-3 py-1.5 text-sm"
          :class="
            index === correctIndex
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-white/10 text-slate-300'
          "
        >
          {{ option || '—' }}
        </li>
      </ul>

      <ol v-else-if="items.length" class="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-300">
        <li v-for="(item, index) in items" :key="index">{{ item }}</li>
      </ol>

      <p v-if="body.hint" class="mt-3 border-t border-white/5 pt-2 text-sm text-amber-200/80">
        Hint: {{ body.hint }}
      </p>
    </div>

    <!-- what counts as right -->
    <div class="rounded-lg border border-emerald-500/20 bg-emerald-950/30 px-4 py-3 text-sm">
      <p class="text-[10px] uppercase tracking-widest text-emerald-500/70">Answer</p>
      <p v-if="numericAnswer" class="mt-1 text-emerald-200">{{ numericAnswer }}</p>
      <p v-else-if="options.length" class="mt-1 text-emerald-200">
        {{ options[correctIndex] ?? '— nothing marked correct —' }}
      </p>
      <p v-else-if="sortedItems.length" class="mt-1 text-emerald-200">
        {{ sortedItems.join(' → ') }}
      </p>
      <p v-else-if="target" class="mt-1 font-mono text-xs text-emerald-200">
        {{ target.lat }}, {{ target.lng }}
      </p>
      <p v-else class="mt-1 text-slate-500">No answer data for a “{{ questionType }}” question.</p>
    </div>
  </div>
</template>
