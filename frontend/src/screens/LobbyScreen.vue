<script setup lang="ts">
/**
 * Getting a table together on separate devices.
 *
 * Three states in one screen: choosing how to join, typing a code, and waiting
 * in the roster. They are steps in one flow rather than three destinations —
 * and the game has no router, so a screen that navigated between them would
 * have to invent one.
 */
import { computed, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGameStore } from '../stores/game'
import { useNetStore } from '../stores/net'
import { useActions } from '../composables/useActions'
import ExpertisePicker from '../components/ExpertisePicker.vue'
import { COLOR_HEX, PLAYER_COLORS } from '../types/session'
import type { Expertise, PlayerColor } from '../types/session'

const { t } = useI18n()
const game = useGameStore()
const net = useNetStore()
const act = useActions()

const emit = defineEmits<{ back: [] }>()

type Step = 'choose' | 'code' | 'roster'
const step = ref<Step>('choose')
const nickname = ref('')
const joinCode = ref('')
const asSpectator = ref(false)
const busy = ref(false)
const expertise = ref<Expertise>({ major_categories: [], subcategories: [] })
const pickingExpertise = ref(false)

/**
 * A nickname is remembered between games, because it is the whole of a player's
 * identity for stats — retyping it slightly differently would silently start a
 * second profile.
 */
onMounted(() => {
  try {
    nickname.value = localStorage.getItem('quizthat.nickname') ?? ''
  } catch {
    /* storage unavailable — they can type it again */
  }
})

function rememberNickname() {
  try {
    localStorage.setItem('quizthat.nickname', nickname.value.trim())
  } catch {
    /* not important enough to interrupt anyone over */
  }
}

const canSubmit = computed(
  () =>
    nickname.value.trim().length > 0 &&
    !busy.value &&
    (asSpectator.value || expertise.value.major_categories.length > 0),
)

async function run(action: () => Promise<void>) {
  busy.value = true
  net.error = null
  try {
    await action()
    rememberNickname()
    step.value = 'roster'
  } catch (err) {
    net.error = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

const host = () => run(() => net.createLobby(nickname.value.trim()))
const join = () =>
  run(() => net.joinLobby(joinCode.value, nickname.value.trim(), asSpectator.value))

/**
 * Turn the lobby roster into the game's own player list, then start.
 *
 * Only the host does this: it runs the engine, so it is the one that has to
 * hold the roster. Seats were fixed server-side by `startLobby`, so adding the
 * players in seat order makes the game's indices and the lobby's seats agree —
 * which is what lets an intent name its sender by seat alone.
 */
async function beginGame() {
  busy.value = true
  try {
    await net.startLobby()
    for (const member of net.players) {
      await act.addPlayer(
        member.nickname,
        PLAYER_COLORS[member.seat ?? 0] as PlayerColor,
        member.id === net.memberId
          ? expertise.value
          : { major_categories: [], subcategories: [] },
      )
    }
    await act.startGame()
    await net.publish()
    await net.holdScreenAwake()
  } catch (err) {
    net.error = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

/** The colour a member will play as, or is provisionally shown as. */
function colorFor(member: { seat: number | null; role: string }, index: number): string {
  if (member.role === 'spectator') return 'rgba(255,255,255,0.35)'
  return COLOR_HEX[PLAYER_COLORS[member.seat ?? index] as PlayerColor]
}

async function leave() {
  await net.leave()
  game.resetGame()
  emit('back')
}
</script>

<template>
  <div class="qt-screen qt-doodles">
    <div class="qt-title-wrap">
      <h1 class="qt-game-title">{{ t('lobby.title') }}</h1>

      <p v-if="net.error" class="qt-lobby-error">{{ net.error }}</p>

      <!-- Step 1: host, join, or watch -->
      <div v-if="step === 'choose'" class="qt-menu">
        <label class="qt-lobby-label" for="nick">{{ t('lobby.nickname') }}</label>
        <input
          id="nick"
          v-model="nickname"
          class="qt-input"
          :placeholder="t('lobby.nicknamePlaceholder')"
          maxlength="40"
        />
        <p class="qt-lobby-hint">{{ t('lobby.nicknameHint') }}</p>

        <button class="qt-cta qt-cta--ghost" @click="pickingExpertise = true">
          {{ expertise.major_categories.length ? expertise.major_categories.join(' · ') : t('setup.chooseExpertise') }}
        </button>

        <button class="qt-cta qt-cta--accent" :disabled="!canSubmit" @click="host">
          {{ t('lobby.hostGame') }}
        </button>
        <button class="qt-cta qt-cta--ghost" :disabled="!nickname.trim()" @click="step = 'code'">
          {{ t('lobby.joinGame') }}
        </button>
        <button class="qt-cta qt-cta--ghost" @click="emit('back')">{{ t('lobby.back') }}</button>
      </div>

      <!-- Step 2: the code -->
      <div v-else-if="step === 'code'" class="qt-menu">
        <label class="qt-lobby-label" for="code">{{ t('lobby.code') }}</label>
        <input
          id="code"
          v-model="joinCode"
          class="qt-input qt-input--code"
          maxlength="5"
          autocapitalize="characters"
          autocomplete="off"
          @input="joinCode = joinCode.toUpperCase()"
        />
        <label class="qt-lobby-check">
          <input v-model="asSpectator" type="checkbox" />
          {{ t('lobby.joinAsSpectator') }}
        </label>
        <button
          class="qt-cta qt-cta--accent"
          :disabled="joinCode.length < 5 || busy"
          @click="join"
        >
          {{ t('lobby.joinGame') }}
        </button>
        <button class="qt-cta qt-cta--ghost" @click="step = 'choose'">{{ t('lobby.back') }}</button>
      </div>

      <!-- Step 3: waiting for everyone -->
      <div v-else class="qt-menu">
        <p class="qt-lobby-label">{{ t('lobby.code') }}</p>
        <p class="qt-lobby-code">{{ net.code }}</p>
        <p class="qt-lobby-hint">{{ t('lobby.shareCode') }}</p>

        <ul class="qt-lobby-roster">
          <li v-for="(member, index) in net.lobby?.members ?? []" :key="member.id">
            <!--
              Seats are only assigned when the game starts, so before that the
              colour follows the join order — otherwise everyone waiting in the
              lobby would show up red.
            -->
            <span class="qt-dot" :style="{ backgroundColor: colorFor(member, index) }"></span>
            {{ member.nickname }}
            <span v-if="member.is_host" class="qt-lobby-tag">{{ t('lobby.hostTag') }}</span>
            <span v-if="member.role === 'spectator'" class="qt-lobby-tag">
              {{ t('lobby.spectatorTag') }}
            </span>
          </li>
        </ul>

        <button
          v-if="net.isHost"
          class="qt-cta qt-cta--accent"
          :disabled="net.players.length < 2 || busy"
          @click="beginGame"
        >
          {{ t('lobby.startGame') }}
        </button>
        <p v-else class="qt-lobby-hint">{{ t('lobby.waitingForHost') }}</p>
        <button class="qt-cta qt-cta--ghost" @click="leave">{{ t('lobby.leave') }}</button>
      </div>
    </div>

    <ExpertisePicker
      v-if="pickingExpertise"
      v-model="expertise"
      :title="t('setup.chooseExpertise')"
      @close="pickingExpertise = false"
    />
  </div>
</template>

<style scoped>
.qt-lobby-label {
  color: #fff;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 2px;
  text-transform: uppercase;
  opacity: 0.6;
  margin: 0;
}
.qt-lobby-hint {
  color: #fff;
  opacity: 0.55;
  font-size: 13px;
  margin: 0;
  text-align: center;
}
.qt-lobby-error {
  color: #fff;
  background: rgba(239, 68, 68, 0.35);
  border-radius: 12px;
  padding: 8px 14px;
  margin: 0 0 12px;
}
.qt-lobby-code {
  margin: 0;
  font-size: clamp(40px, 12vw, 72px);
  font-weight: 900;
  letter-spacing: 0.16em;
  color: #fff;
  text-align: center;
}
.qt-input {
  width: 100%;
  padding: 12px 14px;
  border-radius: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  background: rgba(0, 0, 0, 0.2);
  color: #fff;
  font: inherit;
  font-weight: 700;
}
.qt-input--code {
  text-align: center;
  font-size: 32px;
  letter-spacing: 0.3em;
}
.qt-lobby-check {
  display: flex;
  gap: 8px;
  align-items: center;
  color: #fff;
  font-size: 14px;
}
.qt-lobby-roster {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.qt-lobby-roster li {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #fff;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 10px 14px;
}
.qt-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
}
.qt-lobby-tag {
  margin-left: auto;
  font-size: 11px;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  opacity: 0.6;
}
</style>
