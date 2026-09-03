<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import type { PlayerColor, Expertise } from '../types/session'
import { COLOR_HEX, PLAYER_COLORS } from '../types/session'
import ExpertisePicker from '../components/ExpertisePicker.vue'
import SettingsPanel from '../components/SettingsPanel.vue'

const { t } = useI18n()
const game = useGameStore()

// Title -> player list -> game settings. Each phase is matched explicitly:
// a negated condition would have swallowed the third phase.
const isStart = computed(() => game.setupPhase === 'start')
const isPlayerSetup = computed(() => game.setupPhase === 'player_setup')
const isGameSettings = computed(() => game.setupPhase === 'game_settings')
const isAppSettings = computed(() => game.setupPhase === 'app_settings')

// New player form
const newPlayerName = ref('')
const newPlayerColor = ref<PlayerColor | null>(null)
const newPlayerExpertise = ref<Expertise>({ major_categories: [], subcategories: [] })

const availableColors = computed(() => game.getAvailableColors())
const canAddPlayer = computed(
  () =>
    game.players.length < 6 &&
    newPlayerColor.value !== null &&
    // an expertise slot that means nothing is worse than a slower setup
    newPlayerExpertise.value.major_categories.length > 0,
)
const canStart = computed(() => game.players.length >= 2)

/** Who was playing and where they had got to, so the offer is recognisable. */
const resumeSummary = computed(() => {
  const saved = game.resumableSession
  if (!saved) return ''
  return t('start.resumeSummary', {
    names: saved.players.map((p) => p.name).join(', '),
    round: saved.round,
    current: saved.players[saved.current_player_index]?.name ?? '',
  })
})

/** Generic claims first, then the specific ones. */
function expertiseLine(expertise: Expertise): string {
  return [...expertise.major_categories, ...expertise.subcategories].join(' · ')
}

/**
 * Which expertise the sheet is editing: the player being added, or the index
 * of one already in the list.
 */
const editingExpertise = ref<'new' | number | null>(null)

const sheetExpertise = computed<Expertise>({
  get() {
    if (editingExpertise.value === 'new') return newPlayerExpertise.value
    if (typeof editingExpertise.value === 'number') {
      return game.players[editingExpertise.value]?.expertise
        ?? { major_categories: [], subcategories: [] }
    }
    return { major_categories: [], subcategories: [] }
  },
  set(value) {
    if (editingExpertise.value === 'new') {
      newPlayerExpertise.value = value
    } else if (typeof editingExpertise.value === 'number') {
      game.updatePlayerExpertise(editingExpertise.value, value)
    }
  },
})

const sheetTitle = computed(() => {
  if (typeof editingExpertise.value === 'number') {
    return game.players[editingExpertise.value]?.name ?? t('setup.expertise')
  }
  return t('setup.expertise')
})

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

function setLinesToWin(n: number) {
  game.updateSettings({ lines_to_win: n })
}

const CANDIDATE_OPTIONS = [1, 2, 3, 4]
const STARTING_PEG_OPTIONS = [0, 2, 4, 6]
const LINES_TO_WIN_OPTIONS = [1, 2]
</script>

<template>
  <!-- ---------- Title ---------- -->
  <div v-if="isStart" class="qt-screen">
    <div class="qt-title-wrap">
      <span class="qt-drift qt-drift--far"></span>
      <span class="qt-drift qt-drift--near"></span>

      <h1 class="qt-game-title">{{ t('app.title') }}</h1>
      <p class="qt-game-sub">{{ t('start.tagline') }}</p>

      <!--
        An interrupted game takes over the menu until it is answered: offering
        "New Game" alongside it invites losing the save by reflex. Declining
        deletes it and falls back to the ordinary menu (SPEC §9).
      -->
      <div v-if="game.resumableSession" class="qt-menu qt-resume">
        <p class="qt-resume-prompt">{{ t('start.resumePrompt') }}</p>
        <p class="qt-resume-summary">{{ resumeSummary }}</p>
        <button class="qt-cta qt-cta--accent" @click="game.resumeGame()">
          {{ t('start.resumeYes') }}
        </button>
        <button class="qt-cta qt-cta--ghost" @click="game.discardResumableGame()">
          {{ t('start.resumeNo') }}
        </button>
      </div>

      <div v-else class="qt-menu">
        <button class="qt-cta qt-cta--accent" @click="handleNewGame">{{ t('start.newGame') }}</button>
        <button class="qt-cta qt-cta--ghost" @click="game.goToAppSettings()">{{ t('start.settings') }}</button>
        <button class="qt-cta qt-cta--ghost">{{ t('start.howToPlay') }}</button>
      </div>
    </div>
  </div>

  <!-- ---------- Player setup ---------- -->
  <div v-else-if="isPlayerSetup" class="qt-screen">
    <div class="qt-topbar qt-doodles qt-doodles--deep">
      <button class="qt-icon-btn" :aria-label="t('setup.backToMenu')" @click="game.goToStart()">‹</button>
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

      <div
        v-for="(player, idx) in game.players"
        :key="idx"
        class="qt-player-row qt-player-row--tappable"
        @click="editingExpertise = idx"
      >
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
        <button class="qt-row-x" :aria-label="t('setup.removePlayer')" @click.stop="handleRemovePlayer(idx)">✕</button>
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

        <button
          class="qt-expertise-trigger"
          :class="{ 'is-empty': !expertiseLine(newPlayerExpertise) }"
          @click="editingExpertise = 'new'"
        >
          <span class="qt-expertise-trigger-value">
            {{ expertiseLine(newPlayerExpertise) || t('setup.chooseExpertise') }}
          </span>
          <span class="qt-expertise-trigger-arrow"></span>
        </button>
      </div>



      <button class="qt-cta qt-cta--ghost" :disabled="!canAddPlayer" @click="handleAddPlayer">
        + {{ t('setup.addPlayer') }}
      </button>

    </div>

    <div class="qt-cta-bar">
      <button class="qt-cta qt-cta--accent" :disabled="!canStart" @click="game.goToGameSettings()">
        {{ t('setup.continue') }}
      </button>
    </div>

    <ExpertisePicker
      v-if="editingExpertise !== null"
      v-model="sheetExpertise"
      :title="sheetTitle"
      @close="editingExpertise = null"
    />
  </div>

  <!-- ---------- App settings ---------- -->
  <div v-else-if="isAppSettings" class="qt-screen">
    <div class="qt-topbar qt-doodles qt-doodles--deep">
      <button class="qt-icon-btn" :aria-label="t('setup.backToMenu')" @click="game.goToStart()">‹</button>
    </div>

    <div class="qt-setup-body qt-doodles">
      <SettingsPanel />
    </div>
  </div>

  <!-- ---------- Game settings ---------- -->
  <div v-else-if="isGameSettings" class="qt-screen">
    <div class="qt-topbar qt-doodles qt-doodles--deep">
      <button class="qt-icon-btn" :aria-label="t('setup.backToPlayers')" @click="game.goToPlayerSetup()">‹</button>
    </div>

    <div class="qt-setup-body qt-doodles">
      <div class="qt-setting">
        <div class="qt-setting-label">{{ t('setup.gameSettings') }}</div>
        <p class="qt-setting-note">{{ t('setup.settingsIntro', { count: game.players.length }) }}</p>
      </div>

      <div class="qt-setting">
        <div class="qt-setting-label">{{ t('setup.linesToWin') }}</div>
        <div class="qt-seg">
          <button
            v-for="n in LINES_TO_WIN_OPTIONS"
            :key="n"
            :class="{ 'is-on': game.settings.lines_to_win === n }"
            @click="setLinesToWin(n)"
          >{{ n }}</button>
        </div>
        <p class="qt-setting-note">
          {{ game.settings.lines_to_win === 1 ? t('setup.linesToWinOne') : t('setup.linesToWinTwo') }}
        </p>
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
        <p class="qt-setting-note">{{ t('setup.startingPegsNote') }}</p>
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
        <p class="qt-setting-note">{{ t('setup.placementCandidatesNote') }}</p>
      </div>

      <div class="qt-setting">
        <div class="qt-setting-label">{{ t('setup.boardSize') }}</div>
        <p style="margin: 0; font-weight: 900; font-size: 14px">{{ t('setup.boardFixed') }}</p>
        <p class="qt-setting-note">{{ t('setup.boardFixedHint') }}</p>
      </div>
    </div>

    <div class="qt-cta-bar">
      <button class="qt-cta qt-cta--accent" :disabled="!canStart" @click="handleStartGame">
        {{ t('setup.startGame') }}
      </button>
    </div>
  </div>
</template>
