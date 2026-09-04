<script setup lang="ts">
/**
 * The game as seen by a device that is not the one playing it.
 *
 * It renders the *real* screens — the same `screenForState` that drives a
 * player's device — so a television follows the whole flow: the turn gate, the
 * four cards, the verdict, the pegs landing, the battle reveal, the victory.
 * An earlier version of this was a bespoke summary of everyone's boards, which
 * was both less useful and a second layout to keep in step with the first.
 *
 * Two things make it safe to show:
 *
 * - **It cannot act.** `net.act()` refuses when this device is not the one the
 *   game is waiting on. That is the real guard, not the pointer-events below:
 *   PegPlacementScreen places its pegs from a watcher and JokerTargetSheet
 *   curses on mount, and neither of those is a tap.
 * - **It cannot see a secret.** Whatever a player is part-way through — the
 *   option they are hovering, the number they are typing, the pin they have
 *   dropped — is local to their own device and never enters the session. The
 *   answers already given in a battle are cut out by `redactSessionFor`. So the
 *   question and its options are on screen, and the answering is not.
 */
import { computed, onMounted, onUnmounted } from 'vue'
import { useGameStore } from '../stores/game'
import { useNetStore } from '../stores/net'
import { screenForState } from '../engine/screenMap'
import { audioManager } from '../audio/audioManager'

const game = useGameStore()
const net = useNetStore()

const mirrored = computed(() => screenForState(game.state))

/**
 * Only a television speaks.
 *
 * The mirrored screens play their own stings and voice lines on mount, which is
 * exactly what the room's screen should do. But a player watching somebody
 * else's turn is looking at the same screens on their own phone, and four
 * phones narrating the same game a beat apart is unlistenable — so everything
 * except the TV mirrors silently. Music is untouched; it belongs to the room.
 */
onMounted(() => {
  if (net.role !== 'spectator') audioManager.setSilenced(true)
})

onUnmounted(() => {
  audioManager.setSilenced(false)
})
</script>

<template>
  <!--
    inert as well as pointer-events: none, so the screens are also skipped by
    the keyboard and by assistive technology — a mirrored button is not a
    control, it is a picture of one.
  -->
  <div class="qt-mirror" inert>
    <component :is="mirrored" />
  </div>
</template>

<style scoped>
.qt-mirror {
  display: contents;
  pointer-events: none;
}
</style>
