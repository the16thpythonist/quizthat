<script setup lang="ts">
import { computed } from 'vue'
import type { JokerType } from '../types/session'
import { JOKER_ICONS } from './jokerIcons'

const props = withDefaults(defineProps<{ type: JokerType; size?: number }>(), {
  size: 22,
})

const icon = computed(() => JOKER_ICONS[props.type])
</script>

<template>
  <svg
    class="qt-ji"
    :viewBox="icon.viewBox"
    :width="size"
    :height="size"
    aria-hidden="true"
  >
    <path :d="icon.d" />
  </svg>
</template>
