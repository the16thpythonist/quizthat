<script setup lang="ts">
/**
 * The curator's editor: tree, list, detail.
 *
 * Nothing here touches the game. It reads and writes the question folder
 * through `/api/corpus/*` and has no engine, no session and no store in common
 * with a game in progress — which is why it lives behind its own route rather
 * than as a `GameState`.
 */
import { onMounted, ref } from 'vue'
import { useAdminStore, messageFor } from './store'
import LoginGate from './LoginGate.vue'
import CategoryTree from './CategoryTree.vue'
import QuestionList from './QuestionList.vue'
import QuestionDetail from './QuestionDetail.vue'
import GeneratePane from './GeneratePane.vue'

const admin = useAdminStore()
const rescanning = ref(false)

onMounted(() => admin.checkSession())

async function rescan() {
  rescanning.value = true
  try {
    await admin.rescan()
  } catch (err) {
    admin.error = messageFor(err)
  } finally {
    rescanning.value = false
  }
}
</script>

<template>
  <div class="h-full flex flex-col bg-game-dark text-slate-200">
    <header class="glass-surface flex items-center gap-4 px-5 py-3 shrink-0">
      <h1 class="text-lg font-bold tracking-wide text-white">QuizThat corpus</h1>
      <nav v-if="admin.signedIn" class="flex rounded border border-white/10 p-0.5">
        <button
          v-for="pane in (['questions', 'generate'] as const)"
          :key="pane"
          class="rounded px-3 py-1 text-xs capitalize"
          :class="admin.tab === pane ? 'bg-white/15 text-white' : 'text-slate-400'"
          @click="admin.tab = pane"
        >
          {{ pane }}
        </button>
      </nav>

      <span v-if="admin.signedIn && admin.tab === 'questions'" class="text-xs text-slate-500">
        {{ admin.filtered.length }} of {{ admin.entries.length }} questions
      </span>

      <div class="ml-auto flex items-center gap-2">
        <template v-if="admin.signedIn">
          <button
            v-if="admin.tab === 'questions'"
            class="rounded border border-white/10 px-3 py-1.5 text-xs text-slate-300
                   hover:bg-white/5 disabled:opacity-40"
            :disabled="rescanning"
            title="Re-read questions/ from disk, after the pipeline has written to it"
            @click="rescan"
          >
            {{ rescanning ? 'Scanning…' : 'Re-scan corpus' }}
          </button>
          <button
            class="rounded border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:bg-white/5"
            @click="admin.signOut()"
          >
            Sign out
          </button>
        </template>
        <a href="/" class="text-xs text-slate-500 hover:text-slate-300">← back to the game</a>
      </div>
    </header>

    <p
      v-if="admin.error"
      class="shrink-0 border-b border-red-500/30 bg-red-950/40 px-5 py-2 text-sm text-red-300"
    >
      {{ admin.error }}
      <button class="ml-2 underline opacity-70" @click="admin.error = null">dismiss</button>
    </p>

    <div v-if="admin.checkingSession" class="grid flex-1 place-items-center text-slate-500">
      Loading…
    </div>

    <LoginGate v-else-if="!admin.signedIn" />

    <!-- min-h-0 so the panes scroll inside the row rather than growing it. -->
    <div v-else-if="admin.tab === 'questions'" class="flex min-h-0 flex-1">
      <CategoryTree class="w-60 shrink-0 overflow-y-auto border-r border-white/5" />
      <QuestionList class="w-80 shrink-0 overflow-y-auto border-r border-white/5" />
      <QuestionDetail class="min-w-0 flex-1 overflow-y-auto" />
    </div>

    <GeneratePane v-else />
  </div>
</template>
