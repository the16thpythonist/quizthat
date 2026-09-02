<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import type { PlayerColor, Expertise } from '../types/session'
import { COLOR_HEX, PLAYER_COLORS } from '../types/session'
import ExpertisePicker from '../components/ExpertisePicker.vue'

const { t } = useI18n()
const game = useGameStore()

// Start screen vs player setup
const isPlayerSetup = computed(() => game.setupPhase === 'player_setup')

// New player form
const newPlayerName = ref('')
const newPlayerColor = ref<PlayerColor | null>(null)
const newPlayerExpertise = ref<Expertise>({ major_categories: [], subcategories: [] })

// Settings visibility
const showSettings = ref(false)

const availableColors = computed(() => game.getAvailableColors())
const canAddPlayer = computed(
  () =>
    game.players.length < 6 &&
    newPlayerColor.value !== null &&
    // an expertise slot that means nothing is worse than a slower setup
    newPlayerExpertise.value.major_categories.length > 0,
)
const canStart = computed(() => game.players.length >= 2)

/** Generic claims first, then the specific ones. */
function expertiseLine(expertise: Expertise): string {
  return [...expertise.major_categories, ...expertise.subcategories].join(' · ')
}

function isColorTaken(color: PlayerColor): boolean {
  return !availableColors.value.includes(color)
}

function handleAddPlayer() {
  if (!newPlayerColor.value) return
  game.addPlayer(
    newPlayerName.value || '',
    newPlayerColor.value,
    { ...newPlayerExpertise.value },
  )
  newPlayerName.value = ''
  newPlayerColor.value = availableColors.value[0] ?? null
  newPlayerExpertise.value = { major_categories: [], subcategories: [] }
}

function handleRemovePlayer(index: number) {
  game.removePlayer(index)
  if (!newPlayerColor.value && availableColors.value.length > 0) {
    newPlayerColor.value = availableColors.value[0] ?? null
  }
}

function handleStartGame() {
  if (canStart.value) game.startGame()
}

function handleNewGame() {
  game.goToPlayerSetup()
  newPlayerColor.value = availableColors.value[0] ?? null
}

function setPlacementCandidates(n: number) {
  game.updateSettings({ placement_candidates: n })
}

/** The only length dial: the board is always 4x4, so games are shortened by
 *  starting with pegs already on it rather than by shrinking the grid. */
function setStartingPegs(n: number) {
  game.updateSettings({ starting_pegs: n })
}

const CANDIDATE_OPTIONS = [1, 2, 3, 4]
const STARTING_PEG_OPTIONS = [0, 2, 4, 6]
</script>

<template>
  <!-- ---------- Title ---------- -->
  <div v-if="!isPlayerSetup" class="qt-screen">
    <div class="qt-title-wrap">
      <span class="qt-drift qt-drift--far"></span>
      <span class="qt-drift qt-drift--near"></span>

      <h1 class="qt-game-title">{{ t('app.title') }}</h1>
      <p class="qt-game-sub">{{ t('start.tagline') }}</p>

      <div class="qt-menu">
        <button class="qt-cta qt-cta--accent" @click="handleNewGame">{{ t('start.newGame') }}</button>
        <button class="qt-cta qt-cta--ghost">{{ t('start.settings') }}</button>
        <button class="qt-cta qt-cta--ghost">{{ t('start.howToPlay') }}</button>
      </div>
    </div>
  </div>

  <!-- ---------- Player setup ---------- -->
  <div v-else class="qt-screen">
    <div class="qt-topbar qt-doodles qt-doodles--deep">
      <button class="qt-icon-btn" :aria-label="t('setup.backToMenu')" @click="game.goToStart()">‹</button>
      <button class="qt-icon-btn" aria-label="Einstellungen" @click="showSettings = !showSettings">⚙</button>
    </div>

    <div class="qt-setup-body qt-doodles">
      <!-- current players -->
      <div v-if="game.players.length === 0" class="qt-setting">
        <div class="qt-setting-label">{{ t('setup.title') }}</div>
        <p style="margin: 0 0 8px; font-weight: 900; font-size: 13px">
          {{ t('setup.minPlayers') }}
        </p>
        <p style="margin: 0; font-weight: 700; font-size: 12px; line-height: 1.55; opacity: 0.65">
          {{ t('setup.introExpertise') }}
        </p>
        <p style="margin: 8px 0 0; font-weight: 700; font-size: 12px; line-height: 1.55; opacity: 0.65">
          {{ t('setup.introTrade') }}
        </p>
      </div>

      <div v-for="(player, idx) in game.players" :key="idx" class="qt-player-row">
        <div class="qt-avatar" :style="{ backgroundColor: COLOR_HEX[player.color] }">
          {{ player.name.charAt(0).toUpperCase() }}
        </div>
        <div class="flex-1 min-w-0">
          <b style="display: block; font-size: 16px; font-weight: 900">{{ player.name }}</b>
          <span
            v-if="expertiseLine(player.expertise)"
            style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; opacity: 0.6"
          >{{ expertiseLine(player.expertise) }}</span>
        </div>
        <button class="qt-row-x" :aria-label="t('setup.removePlayer')" @click="handleRemovePlayer(idx)">✕</button>
      </div>

      <!-- add a player -->
      <div v-if="game.players.length < 6" class="qt-setting">
        <div class="qt-setting-label">{{ t('setup.addPlayer') }}</div>
        <input
          v-model="newPlayerName"
          class="qt-input"
          :placeholder="t('setup.playerName')"
          maxlength="16"
        />
        <div class="qt-setting-label" style="margin: 12px 0 8px">{{ t('setup.playerColor') }}</div>
        <div class="qt-swatches">
          <button
            v-for="color in PLAYER_COLORS"
            :key="color"
            class="qt-swatch"
            :class="{ 'is-on': newPlayerColor === color }"
            :style="{ backgroundColor: COLOR_HEX[color] }"
            :disabled="isColorTaken(color)"
            :aria-label="t('colors.' + color)"
            @click="newPlayerColor = color"
          ></button>
        </div>
      </div>

      <ExpertisePicker v-if="game.players.length < 6" v-model="newPlayerExpertise" />

      <button class="qt-cta qt-cta--ghost" :disabled="!canAddPlayer" @click="handleAddPlayer">
        + {{ t('setup.addPlayer') }}
      </button>

      <!-- settings -->
      <template v-if="showSettings">
        <div class="qt-setting">
          <div class="qt-setting-label">{{ t('setup.boardSize') }}</div>
          <p style="margin: 0; font-weight: 900; font-size: 15px">{{ t('setup.boardFixed') }}</p>
          <p style="margin: 4px 0 0; font-weight: 700; font-size: 11px; opacity: 0.55">
            {{ t('setup.boardFixedHint') }}
          </p>
        </div>

        <div class="qt-setting">
          <div class="qt-setting-label">{{ t('setup.placementCandidates') }}</div>
          <div class="qt-seg">
            <button
              v-for="n in CANDIDATE_OPTIONS"
              :key="n"
              :class="{ 'is-on': game.settings.placement_candidates === n }"
              @click="setPlacementCandidates(n)"
            >{{ n }}</button>
          </div>
        </div>

        <div class="qt-setting">
          <div class="qt-setting-label">{{ t('setup.startingPegs') }}</div>
          <div class="qt-seg">
            <button
              v-for="n in STARTING_PEG_OPTIONS"
              :key="n"
              :class="{ 'is-on': game.settings.starting_pegs === n }"
              @click="setStartingPegs(n)"
            >{{ n }}</button>
          </div>
        </div>
      </template>
    </div>

    <div class="qt-cta-bar">
      <button class="qt-cta qt-cta--accent" :disabled="!canStart" @click="handleStartGame">
        {{ t('setup.startGame') }}
      </button>
    </div>
  </div>
</template>
