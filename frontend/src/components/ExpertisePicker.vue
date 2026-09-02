<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCorpusStore } from '../stores/corpus'
import type { Expertise } from '../types/session'

/**
 * Two-tier expertise picker.
 *
 * A major category is the generic claim; its subcategories are the specific
 * ones. Picking specific is deliberately a bargain rather than a free upgrade:
 * the engine draws those questions from a harsher difficulty band, so claiming
 * you know Physics never gets you an easy question, while claiming Science
 * still can.
 */
const { t } = useI18n()
const corpus = useCorpusStore()

const props = defineProps<{ modelValue: Expertise }>()
const emit = defineEmits<{ 'update:modelValue': [value: Expertise] }>()

const MAX_MAJORS = 2
const MAX_SUBS = 2

/** Which card is expanded; a card expands on selection but can be folded away. */
const expanded = ref<string | null>(null)

const majors = computed(() => props.modelValue.major_categories)
const subs = computed(() => props.modelValue.subcategories)

function update(next: Partial<Expertise>) {
  emit('update:modelValue', {
    major_categories: next.major_categories ?? [...majors.value],
    subcategories: next.subcategories ?? [...subs.value],
  })
}

function toggleMajor(major: string, subcategories: string[]) {
  if (majors.value.includes(major)) {
    // dropping a major drops the specific picks that belonged to it
    update({
      major_categories: majors.value.filter((m) => m !== major),
      subcategories: subs.value.filter((s) => !subcategories.includes(s)),
    })
    if (expanded.value === major) expanded.value = null
    return
  }
  if (majors.value.length >= MAX_MAJORS) return
  update({ major_categories: [...majors.value, major] })
  expanded.value = major
}

function toggleSub(sub: string) {
  if (subs.value.includes(sub)) {
    update({ subcategories: subs.value.filter((s) => s !== sub) })
    return
  }
  if (subs.value.length >= MAX_SUBS) return
  update({ subcategories: [...subs.value, sub] })
}

function isMajorOn(major: string) {
  return majors.value.includes(major)
}

function canPickMajor(major: string) {
  return isMajorOn(major) || majors.value.length < MAX_MAJORS
}

function canPickSub(sub: string) {
  return subs.value.includes(sub) || subs.value.length < MAX_SUBS
}
</script>

<template>
  <div class="qt-setting">
    <div class="qt-setting-label">
      {{ t('setup.expertise') }} · {{ majors.length }}/{{ MAX_MAJORS }}
      <span v-if="subs.length"> · {{ t('setup.expertiseSpecificShort') }} {{ subs.length }}/{{ MAX_SUBS }}</span>
    </div>
    <p class="qt-expertise-hint">{{ t('setup.expertiseHint') }}</p>

    <p v-if="corpus.categories.length === 0" class="qt-expertise-hint" style="opacity: 0.5">
      {{ t('setup.expertiseLoading') }}
    </p>

    <div v-else class="qt-expertise-list">
      <div v-for="cat in corpus.categories" :key="cat.major">
        <button
          class="qt-cat"
          :class="{ 'is-on': isMajorOn(cat.major) }"
          :disabled="!canPickMajor(cat.major)"
          @click="toggleMajor(cat.major, cat.subcategories)"
        >
          <span class="qt-cat-name">{{ cat.major }}</span>
          <span
            v-if="isMajorOn(cat.major) && cat.subcategories.length"
            class="qt-cat-chevron"
            :class="{ 'is-open': expanded === cat.major }"
            @click.stop="expanded = expanded === cat.major ? null : cat.major"
          ></span>
        </button>

        <!-- the specific tier, revealed once the major is claimed -->
        <div
          v-if="isMajorOn(cat.major) && expanded === cat.major && cat.subcategories.length"
          class="qt-subs"
        >
          <button
            v-for="sub in cat.subcategories"
            :key="sub"
            class="qt-sub"
            :class="{ 'is-on': subs.includes(sub) }"
            :disabled="!canPickSub(sub)"
            @click="toggleSub(sub)"
          >{{ sub }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
