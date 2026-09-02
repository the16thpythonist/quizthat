<script setup lang="ts">
import type { Player } from '../types/session'
import RoundTrack from './RoundTrack.vue'
import { COLOR_HEX } from '../types/session'

/**
 * Identity on the left, what this screen wants from you on the right, and an
 * 86px gutter between them so neither slides under the badge hanging down
 * from the bar.
 */
defineProps<{
  player: Player | null
  context?: string
}>()
</script>

<template>
  <div v-if="player">
  <div class="qt-strip">
    <div class="qt-strip-left">
      <div class="qt-strip-identity">
        <div class="qt-chip" :style="{ backgroundColor: COLOR_HEX[player.color] }"></div>
        <div class="qt-pname">{{ player.name }}</div>
      </div>
    </div>

    <div class="qt-strip-gutter"></div>

    <div class="qt-strip-right">
      <div v-if="context" class="qt-pmeta">{{ context }}</div>
    </div>
  </div>
  <RoundTrack />
  </div>
</template>
