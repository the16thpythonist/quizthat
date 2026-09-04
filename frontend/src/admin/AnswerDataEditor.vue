<script setup lang="ts">
/**
 * `answer_data`, edited as fields rather than as JSON.
 *
 * Its shape follows `question_type` — the same union the engine grades against
 * in `engine/algorithms.ts` — so there is one small form per type and a raw
 * JSON fallback for anything this file has not been taught yet. The fallback is
 * deliberate: a corpus written by the pipeline may grow a type before the
 * editor does, and a question that cannot be shown is worse than one shown as
 * JSON.
 *
 * Nothing here decides correctness. It edits the data `gradeAnswer()` reads.
 */
import { computed, ref, watch } from 'vue'
import type { QuestionType } from '../types/session'
import { detach } from './api'

const props = defineProps<{
  modelValue: Record<string, unknown>
  questionType: QuestionType | string
}>()
const emit = defineEmits<{ 'update:modelValue': [Record<string, unknown>] }>()

/** A working copy, so a half-typed field does not fight the parent's state. */
const local = ref<Record<string, unknown>>(detach(props.modelValue ?? {}))
watch(
  () => props.modelValue,
  (next) => {
    if (JSON.stringify(next) !== JSON.stringify(local.value)) {
      local.value = detach(next ?? {})
    }
  },
)

function push() {
  emit('update:modelValue', detach(local.value))
}

/** A two-way binding onto one key of the working copy. */
function fieldOf<T>(key: string, fallback: T) {
  return computed<T>({
    get: () => (local.value[key] as T) ?? fallback,
    set: (value) => {
      local.value[key] = value
      push()
    },
  })
}

// -- multiple choice ---------------------------------------------
const options = fieldOf<string[]>('options', [])
const correctIndex = fieldOf<number>('correct_index', 0)

function setOption(index: number, value: string) {
  const next = [...options.value]
  next[index] = value
  options.value = next
}

function addOption() {
  options.value = [...options.value, '']
}

function removeOption(index: number) {
  const next = options.value.filter((_, i) => i !== index)
  options.value = next
  // The correct answer is stored as a position, so deleting a row above it
  // would silently make a different option the right one.
  if (correctIndex.value >= next.length) correctIndex.value = Math.max(0, next.length - 1)
  else if (index < correctIndex.value) correctIndex.value = correctIndex.value - 1
}

// -- sorting -----------------------------------------------------
const items = fieldOf<string[]>('items', [])
const metric = fieldOf<string>('metric', '')
const correctOrder = computed<string>({
  get: () => ((local.value.correct_order as number[]) ?? []).join(', '),
  set: (value) => {
    local.value.correct_order = value
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((n) => Number.isInteger(n))
    push()
  },
})

function setItem(index: number, value: string) {
  const next = [...items.value]
  next[index] = value
  items.value = next
}

// -- numeric -----------------------------------------------------
const correctValue = fieldOf<number>('correct_value', 0)
const tolerance = fieldOf<number>('tolerance', 0)
const unit = fieldOf<string>('unit', '')

// -- map ---------------------------------------------------------
const target = computed(() => (local.value.target as { lat: number; lng: number }) ?? { lat: 0, lng: 0 })

function setTarget(part: 'lat' | 'lng', value: number) {
  local.value.target = { ...target.value, [part]: value }
  push()
}

const scoring = fieldOf<{ radius_km: number; label: string }[]>('scoring', [])

function setBand(index: number, part: 'radius_km' | 'label', value: string) {
  const next = scoring.value.map((band, i) =>
    i === index ? { ...band, [part]: part === 'radius_km' ? Number(value) : value } : band,
  )
  scoring.value = next
}

// -- the fallback ------------------------------------------------
const raw = ref(JSON.stringify(props.modelValue ?? {}, null, 2))
const rawError = ref<string | null>(null)

function commitRaw() {
  try {
    const parsed = JSON.parse(raw.value)
    rawError.value = null
    local.value = parsed
    push()
  } catch (err) {
    rawError.value = err instanceof Error ? err.message : 'Not valid JSON.'
  }
}

const known = computed(() =>
  ['multiple_choice', 'sorting', 'map_location', 'battle_map', 'calculation', 'estimation'].includes(
    String(props.questionType),
  ),
)

const field = 'w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm outline-none focus:border-white/30'
const label = 'mb-1 block text-[11px] uppercase tracking-wide text-slate-500'
</script>

<template>
  <div>
    <!-- multiple choice -->
    <div v-if="questionType === 'multiple_choice'" class="space-y-2">
      <span :class="label">Options — the radio marks the correct one</span>
      <div v-for="(option, index) in options" :key="index" class="flex items-center gap-2">
        <input
          type="radio"
          :checked="correctIndex === index"
          :aria-label="`Option ${index + 1} is correct`"
          @change="correctIndex = index"
        />
        <input
          :value="option"
          :class="field"
          @input="setOption(index, ($event.target as HTMLInputElement).value)"
        />
        <button
          class="px-2 text-slate-600 hover:text-red-400"
          :aria-label="`Remove option ${index + 1}`"
          @click="removeOption(index)"
        >
          ×
        </button>
      </div>
      <button class="text-xs text-slate-400 underline" @click="addOption">add an option</button>
    </div>

    <!-- sorting -->
    <div v-else-if="questionType === 'sorting'" class="space-y-3">
      <div class="space-y-2">
        <span :class="label">Items, as shown to the player</span>
        <input
          v-for="(item, index) in items"
          :key="index"
          :value="item"
          :class="field"
          @input="setItem(index, ($event.target as HTMLInputElement).value)"
        />
      </div>
      <div>
        <span :class="label">Correct order — item positions, comma separated</span>
        <input v-model="correctOrder" :class="field" placeholder="2, 0, 1" />
      </div>
      <div>
        <span :class="label">Metric being sorted by</span>
        <input v-model="metric" :class="field" />
      </div>
    </div>

    <!-- numeric -->
    <div
      v-else-if="questionType === 'calculation' || questionType === 'estimation'"
      class="flex gap-3"
    >
      <div class="flex-1">
        <span :class="label">Correct value</span>
        <input v-model.number="correctValue" type="number" step="any" :class="field" />
      </div>
      <div v-if="questionType === 'calculation'" class="flex-1">
        <span :class="label">Tolerance</span>
        <input v-model.number="tolerance" type="number" step="any" :class="field" />
      </div>
      <div class="flex-1">
        <span :class="label">Unit</span>
        <input v-model="unit" :class="field" />
      </div>
    </div>

    <!-- map -->
    <div v-else-if="questionType === 'map_location' || questionType === 'battle_map'" class="space-y-3">
      <div class="flex gap-3">
        <div class="flex-1">
          <span :class="label">Latitude</span>
          <input
            :value="target.lat"
            type="number"
            step="any"
            :class="field"
            @input="setTarget('lat', Number(($event.target as HTMLInputElement).value))"
          />
        </div>
        <div class="flex-1">
          <span :class="label">Longitude</span>
          <input
            :value="target.lng"
            type="number"
            step="any"
            :class="field"
            @input="setTarget('lng', Number(($event.target as HTMLInputElement).value))"
          />
        </div>
      </div>
      <div v-if="questionType === 'map_location'" class="space-y-2">
        <span :class="label">Scoring bands — how close counts as what</span>
        <div v-for="(band, index) in scoring" :key="index" class="flex gap-2">
          <input
            :value="band.radius_km"
            type="number"
            :class="field"
            class="w-28"
            @input="setBand(index, 'radius_km', ($event.target as HTMLInputElement).value)"
          />
          <input
            :value="band.label"
            :class="field"
            @input="setBand(index, 'label', ($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>
    </div>

    <!-- anything this editor does not know yet -->
    <div v-if="!known">
      <span :class="label">
        answer_data — no form for “{{ questionType }}” yet, so this is the file itself
      </span>
      <textarea
        v-model="raw"
        rows="10"
        class="w-full rounded border border-white/10 bg-black/30 p-2 font-mono text-xs
               outline-none focus:border-white/30"
        @blur="commitRaw"
      />
      <p v-if="rawError" class="text-xs text-red-400">{{ rawError }}</p>
    </div>
  </div>
</template>
