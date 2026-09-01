<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import type { PlayerColor, Expertise, BoardSize } from '../types/session'
import { COLOR_HEX } from '../types/session'

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
const canAddPlayer = computed(() => game.players.length < 6 && newPlayerColor.value !== null)
const canStart = computed(() => game.players.length >= 2)

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

function setBoardSize(size: BoardSize) {
  game.updateSettings({ board_size: size })
}

function setPlacementCandidates(n: number) {
  game.updateSettings({ placement_candidates: n })
}

function setStartingPegs(n: number) {
  game.updateSettings({ starting_pegs: n })
}

function settingsButtonStyle(active: boolean): Record<string, string> {
  if (active) {
    return {
      background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.8) 0%, rgba(55, 48, 163, 0.9) 100%)',
      border: '1px solid rgba(129, 140, 248, 0.4)',
      boxShadow: '0 0 12px rgba(99, 102, 241, 0.25), 0 2px 8px rgba(0, 0, 0, 0.3)',
    }
  }
  return {
    background: 'linear-gradient(180deg, rgba(55, 55, 75, 0.9) 0%, rgba(40, 40, 55, 0.95) 100%)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
  }
}
</script>

<template>
  <!-- Start Screen -->
  <div
    v-if="!isPlayerSetup"
    class="flex flex-col items-center justify-center min-h-screen bg-game-dark text-white p-8"
  >
    <h1
      class="text-6xl font-extrabold mb-4 tracking-tight"
      :style="{ textShadow: '0 0 60px rgba(99, 102, 241, 0.3), 0 2px 4px rgba(0, 0, 0, 0.5)' }"
    >
      {{ t('app.title') }}
    </h1>
    <p class="text-gray-500 text-lg mb-12">The Ultimate Quiz Board Game</p>

    <div class="flex flex-col gap-4 w-full max-w-sm">
      <button
        class="w-full py-4 px-8 text-white text-xl font-bold rounded-2xl transition-all duration-200 touch-manipulation hover:scale-[1.02] active:scale-[0.98]"
        :style="{
          background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
          boxShadow: '0 0 24px rgba(99, 102, 241, 0.3), 0 4px 16px rgba(0, 0, 0, 0.4)',
          border: '1px solid rgba(129, 140, 248, 0.3)',
        }"
        @click="handleNewGame"
      >
        {{ t('start.newGame') }}
      </button>
      <button
        class="w-full py-3 px-8 text-white text-lg rounded-2xl transition-all duration-200 touch-manipulation glass-card inner-shine hover:scale-[1.01] active:scale-[0.99]"
      >
        {{ t('start.settings') }}
      </button>
      <button
        class="w-full py-3 px-8 text-white text-lg rounded-2xl transition-all duration-200 touch-manipulation glass-card inner-shine hover:scale-[1.01] active:scale-[0.99]"
      >
        {{ t('start.howToPlay') }}
      </button>
    </div>
  </div>

  <!-- Player Setup Screen -->
  <div
    v-else
    class="flex flex-col h-screen bg-game-dark text-white"
  >
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 glass-surface">
      <button
        class="text-gray-400 hover:text-white text-lg touch-manipulation transition-colors"
        @click="game.goToStart()"
      >
        {{ t('setup.backToMenu') }}
      </button>
      <h2 class="text-2xl font-bold">{{ t('setup.title') }}</h2>
      <div class="w-24"></div>
    </div>

    <div class="flex-1 overflow-y-auto p-6">
      <div class="max-w-2xl mx-auto">
        <!-- Current Players -->
        <div class="mb-8">
          <div
            v-for="(player, idx) in game.players"
            :key="idx"
            class="flex items-center justify-between p-4 mb-3 rounded-xl border transition-all duration-200"
            :style="{
              borderColor: COLOR_HEX[player.color] + '40',
              background: `linear-gradient(135deg, ${COLOR_HEX[player.color]}15 0%, ${COLOR_HEX[player.color]}08 100%)`,
              boxShadow: `0 0 16px ${COLOR_HEX[player.color]}10, 0 4px 16px rgba(0, 0, 0, 0.3)`,
            }"
          >
            <div class="flex items-center gap-4">
              <div
                class="w-10 h-10 rounded-full ring-2 ring-white/10"
                :style="{
                  background: `radial-gradient(circle at 35% 35%, ${COLOR_HEX[player.color]}dd, ${COLOR_HEX[player.color]})`,
                  boxShadow: `0 0 12px ${COLOR_HEX[player.color]}50`,
                }"
              ></div>
              <div>
                <span class="text-lg font-semibold">{{ player.name }}</span>
                <span class="text-sm text-gray-500 ml-2">
                  {{ t('colors.' + player.color) }}
                </span>
              </div>
            </div>
            <button
              class="px-4 py-2 text-sm text-red-400 rounded-lg touch-manipulation transition-all duration-200 hover:scale-[1.05] active:scale-[0.95]"
              :style="{
                background: 'rgba(127, 29, 29, 0.3)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
              }"
              @click="handleRemovePlayer(idx)"
            >
              {{ t('setup.removePlayer') }}
            </button>
          </div>
        </div>

        <!-- Add Player Form -->
        <div
          v-if="game.players.length < 6"
          class="p-6 rounded-2xl mb-8 glass-card"
        >
          <h3 class="text-lg font-semibold mb-4">{{ t('setup.addPlayer') }}</h3>

          <!-- Name -->
          <div class="mb-4">
            <label class="block text-sm text-gray-500 mb-1">{{ t('setup.playerName') }}</label>
            <input
              v-model="newPlayerName"
              type="text"
              class="w-full px-4 py-3 rounded-xl text-white text-lg focus:outline-none transition-all duration-200"
              :style="{
                background: 'rgba(15, 15, 25, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.3)',
              }"
              :placeholder="newPlayerColor ? t('colors.' + newPlayerColor) : ''"
            />
          </div>

          <!-- Color Picker -->
          <div class="mb-4">
            <label class="block text-sm text-gray-500 mb-2">{{ t('setup.playerColor') }}</label>
            <div class="flex gap-3 flex-wrap">
              <button
                v-for="color in availableColors"
                :key="color"
                class="w-12 h-12 rounded-full transition-all duration-200 touch-manipulation"
                :class="newPlayerColor === color ? 'scale-110' : 'hover:scale-105'"
                :style="{
                  background: `radial-gradient(circle at 35% 35%, ${COLOR_HEX[color]}dd, ${COLOR_HEX[color]})`,
                  border: newPlayerColor === color ? '3px solid rgba(255, 255, 255, 0.9)' : '3px solid transparent',
                  boxShadow: newPlayerColor === color
                    ? `0 0 20px ${COLOR_HEX[color]}60, 0 0 40px ${COLOR_HEX[color]}20`
                    : `0 2px 8px rgba(0, 0, 0, 0.4)`,
                }"
                @click="newPlayerColor = color"
              ></button>
            </div>
          </div>

          <button
            class="w-full py-3 text-white text-lg font-semibold rounded-xl transition-all duration-200 touch-manipulation hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:hover:scale-100"
            :disabled="!canAddPlayer"
            :style="canAddPlayer ? {
              background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
              border: '1px solid rgba(129, 140, 248, 0.3)',
              boxShadow: '0 0 16px rgba(99, 102, 241, 0.2), 0 4px 12px rgba(0, 0, 0, 0.3)',
            } : {
              background: 'rgba(30, 30, 45, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.04)',
            }"
            @click="handleAddPlayer"
          >
            {{ t('setup.addPlayer') }}
          </button>
        </div>

        <!-- Game Settings (collapsible) -->
        <div class="mb-8">
          <button
            class="flex items-center gap-2 text-gray-400 hover:text-white mb-4 touch-manipulation transition-colors"
            @click="showSettings = !showSettings"
          >
            <span class="text-sm">{{ showSettings ? '▼' : '▶' }}</span>
            <span class="text-lg font-semibold">{{ t('setup.gameSettings') }}</span>
          </button>

          <div v-if="showSettings" class="p-6 rounded-2xl space-y-6 glass-card">
            <!-- Board Size -->
            <div>
              <label class="block text-sm text-gray-500 mb-2">{{ t('setup.boardSize') }}</label>
              <div class="flex gap-3">
                <button
                  v-for="size in (['3x3', '4x4', '5x5'] as const)"
                  :key="size"
                  class="px-6 py-3 rounded-xl font-semibold transition-all duration-200 touch-manipulation text-white hover:scale-[1.03] active:scale-[0.97]"
                  :style="settingsButtonStyle(game.settings.board_size === size)"
                  @click="setBoardSize(size)"
                >
                  {{ size }}
                </button>
              </div>
            </div>

            <!-- Placement Candidates -->
            <div>
              <label class="block text-sm text-gray-500 mb-2">{{ t('setup.placementCandidates') }}</label>
              <div class="flex gap-3">
                <button
                  v-for="n in [1, 2, 3, 4]"
                  :key="n"
                  class="w-12 h-12 rounded-xl font-semibold transition-all duration-200 touch-manipulation text-white hover:scale-[1.03] active:scale-[0.97]"
                  :style="settingsButtonStyle(game.settings.placement_candidates === n)"
                  @click="setPlacementCandidates(n)"
                >
                  {{ n }}
                </button>
              </div>
            </div>

            <!-- Starting Pegs -->
            <div>
              <label class="block text-sm text-gray-500 mb-2">{{ t('setup.startingPegs') }}</label>
              <div class="flex gap-3">
                <button
                  v-for="n in [0, 1, 2, 3, 4, 5]"
                  :key="n"
                  class="w-12 h-12 rounded-xl font-semibold transition-all duration-200 touch-manipulation text-white hover:scale-[1.03] active:scale-[0.97]"
                  :style="settingsButtonStyle(game.settings.starting_pegs === n)"
                  @click="setStartingPegs(n)"
                >
                  {{ n }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Start Game Button -->
        <button
          class="w-full py-4 text-white text-xl font-bold rounded-2xl transition-all duration-200 touch-manipulation hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:hover:scale-100"
          :disabled="!canStart"
          :style="canStart ? {
            background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
            boxShadow: '0 0 24px rgba(34, 197, 94, 0.25), 0 4px 16px rgba(0, 0, 0, 0.4)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
          } : {
            background: 'rgba(30, 30, 45, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.04)',
          }"
          @click="handleStartGame"
        >
          {{ t('setup.startGame') }}
        </button>
        <p v-if="!canStart" class="text-center text-amber-400 text-sm mt-2">
          {{ t('setup.minPlayers') }}
        </p>
      </div>
    </div>
  </div>
</template>
