<script setup lang="ts">
/**
 * Watching the generation agent work.
 *
 * A run is a `quizthat generate-batch` on the server, and this is the form that
 * starts it plus a live view of what it says. The events come over SSE, which
 * replays from the beginning — so reloading the page mid-run shows the whole
 * run rather than only what happens next.
 *
 * The categories come from the pipeline's `categories.yaml`, not from the
 * corpus, because the whole point is to fill a category that has nothing in it
 * yet. Counts beside each one show where the gaps are.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { api, type Capability, type GenCategory, type RunEvent, type RunSummary } from './api'
import { useAdminStore, messageFor } from './store'

const admin = useAdminStore()

const capability = ref<Capability | null>(null)
const categories = ref<GenCategory[]>([])
const run = ref<RunSummary | null>(null)
const events = ref<RunEvent[]>([])
const error = ref<string | null>(null)
const starting = ref(false)

const category = ref('')
const subcategory = ref('')
const difficulty = ref('medium')
const questionType = ref('multiple_choice')
const count = ref(1)
const languages = ref<string[]>(['en', 'de'])
const model = ref('')
const dryRun = ref(false)

const DIFFICULTIES = ['easy', 'medium', 'hard']
// The four the pipeline's prompt knows how to write. `estimation` and
// `battle_map` exist in the corpus schema but have no generation path.
const TYPES = ['multiple_choice', 'sorting', 'map_location', 'calculation']

const subcategories = computed(
  () => categories.value.find((cat) => cat.name === category.value)?.subcategories ?? [],
)

watch(category, () => {
  subcategory.value = subcategories.value[0]?.name ?? ''
})

const isRunning = computed(() => run.value?.status === 'running')

/** Questions this run has written, newest last, for the result list. */
const written = computed(() =>
  events.value
    .filter((e) => e.event === 'question_finished' && e.status === 'ok')
    .map((e) => ({ id: String(e.question_id ?? ''), dir: String(e.question_dir ?? '') })),
)

const failures = computed(() =>
  events.value.filter((e) => e.event === 'question_finished' && e.status === 'failed'),
)

/**
 * The event log, as lines to render.
 *
 * A tool result can be kilobytes and the agent's prose can be paragraphs; both
 * are already truncated server-side, and this only decides how to label them.
 */
const log = computed(() =>
  events.value.map((e, index) => {
    switch (e.event) {
      case 'run_started':
        return { index, kind: 'meta', label: 'run', text: `${e.total} × ${e.difficulty} ${e.question_type} in ${e.category}/${e.subcategory}` }
      case 'question_started':
        return { index, kind: 'step', label: `question ${Number(e.index) + 1}/${e.total}`, text: String(e.prompt ?? '') }
      case 'tool_use':
        return { index, kind: 'tool', label: String(e.name ?? 'tool'), text: String(e.summary ?? '') }
      case 'tool_result':
        return { index, kind: e.is_error ? 'error' : 'result', label: 'result', text: String(e.summary ?? '') }
      case 'agent_text':
        return { index, kind: 'text', label: '', text: String(e.text ?? '') }
      case 'question_written':
        return { index, kind: 'ok', label: 'written', text: String(e.question_id ?? '') }
      case 'question_finished':
        return e.status === 'ok'
          ? { index, kind: 'ok', label: 'done', text: String(e.question_id ?? '') }
          : { index, kind: 'error', label: 'failed', text: String(e.error ?? '') }
      case 'agent_result':
        return { index, kind: 'meta', label: 'turns', text: `${e.num_turns ?? '?'} turns` }
      case 'run_finished':
        return { index, kind: 'meta', label: 'finished', text: `${e.generated} generated, ${e.failed} failed` }
      case 'run_closed':
        return { index, kind: e.status === 'finished' ? 'meta' : 'error', label: String(e.status ?? ''), text: String(e.error ?? '') }
      default:
        return { index, kind: 'meta', label: String(e.event), text: String(e.text ?? '') }
    }
  }),
)

let source: EventSource | null = null

function follow() {
  close()
  events.value = []
  source = new EventSource(api.eventsUrl())
  source.addEventListener('progress', (message) => {
    events.value = [...events.value, JSON.parse((message as MessageEvent).data)]
  })
  source.addEventListener('closed', (message) => {
    run.value = JSON.parse((message as MessageEvent).data)
    close()
    // The corpus gained questions, so the tree, the counts and the listing next
    // door are all stale.
    admin.loadCorpus()
    refresh()
  })
  source.addEventListener('idle', () => close())
  source.onerror = () => close()
}

function close() {
  source?.close()
  source = null
}

onUnmounted(close)

async function refresh() {
  try {
    const state = await api.generationStatus()
    capability.value = state.capability
    run.value = state.run
  } catch (err) {
    error.value = messageFor(err)
  }
}

async function load() {
  await refresh()
  try {
    const body = await api.categories()
    categories.value = body.categories
    if (!category.value) category.value = body.categories[0]?.name ?? ''
  } catch (err) {
    error.value = messageFor(err)
  }
  // A run started before this tab was opened — or before a reload — is still
  // going on the server, so attach to it rather than pretending it is not there.
  if (run.value?.status === 'running') follow()
}

load()

async function start() {
  starting.value = true
  error.value = null
  try {
    run.value = await api.startRun({
      category: category.value,
      subcategory: subcategory.value,
      difficulty: difficulty.value,
      question_type: questionType.value,
      count: count.value,
      languages: languages.value,
      model: model.value.trim() || undefined,
      dry_run: dryRun.value,
    })
    follow()
  } catch (err) {
    error.value = messageFor(err)
  } finally {
    starting.value = false
  }
}

async function stop() {
  try {
    await api.stopRun()
  } catch (err) {
    error.value = messageFor(err)
  }
}

function openInEditor(id: string) {
  admin.tab = 'questions'
  admin.open(id)
}

function toggleLanguage(code: string) {
  languages.value = languages.value.includes(code)
    ? languages.value.filter((lang) => lang !== code)
    : [...languages.value, code]
}

const field =
  'w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm outline-none focus:border-white/30'
const label = 'mb-1 block text-[11px] uppercase tracking-wide text-slate-500'

const KIND_STYLES: Record<string, string> = {
  meta: 'text-slate-500',
  step: 'text-white font-semibold',
  tool: 'text-sky-300',
  result: 'text-slate-400',
  text: 'text-slate-300',
  ok: 'text-emerald-400',
  error: 'text-red-400',
}
</script>

<template>
  <div class="flex min-h-0 flex-1">
    <!-- what to generate -->
    <div class="w-80 shrink-0 overflow-y-auto border-r border-white/5 p-4">
      <h2 class="mb-3 text-sm font-semibold text-white">Generate questions</h2>

      <div
        v-if="capability && !capability.available"
        class="mb-4 rounded border border-amber-500/30 bg-amber-950/30 p-3 text-xs text-amber-200"
      >
        <p class="mb-1 font-semibold">Generation is not available on this server.</p>
        <ul class="list-disc space-y-1 pl-4">
          <li v-for="reason in capability.reasons" :key="reason">{{ reason }}</li>
        </ul>
      </div>

      <div class="space-y-3">
        <div>
          <span :class="label">Category</span>
          <select v-model="category" :class="field">
            <option v-for="cat in categories" :key="cat.name" :value="cat.name">
              {{ cat.name }} ({{ cat.count }})
            </option>
          </select>
        </div>
        <div>
          <span :class="label">Subcategory</span>
          <select v-model="subcategory" :class="field">
            <option v-for="sub in subcategories" :key="sub.name" :value="sub.name">
              {{ sub.name }} ({{ sub.count }})
            </option>
          </select>
          <p class="mt-1 text-[11px] text-slate-600">
            The number is what the corpus already holds — the empty ones are the gaps.
          </p>
        </div>
        <div class="flex gap-3">
          <div class="flex-1">
            <span :class="label">Difficulty</span>
            <select v-model="difficulty" :class="field">
              <option v-for="value in DIFFICULTIES" :key="value" :value="value">{{ value }}</option>
            </select>
          </div>
          <div class="flex-1">
            <span :class="label">Count</span>
            <input
              v-model.number="count"
              type="number"
              min="1"
              :max="capability?.max_count ?? 25"
              :class="field"
            />
          </div>
        </div>
        <div>
          <span :class="label">Type</span>
          <select v-model="questionType" :class="field">
            <option v-for="value in TYPES" :key="value" :value="value">{{ value }}</option>
          </select>
        </div>
        <div>
          <span :class="label">Languages</span>
          <div class="flex gap-2">
            <button
              v-for="code in ['en', 'de']"
              :key="code"
              class="rounded border px-3 py-1 text-xs uppercase"
              :class="
                languages.includes(code)
                  ? 'border-white/30 bg-white/10 text-white'
                  : 'border-white/10 text-slate-500'
              "
              @click="toggleLanguage(code)"
            >
              {{ code }}
            </button>
          </div>
        </div>
        <div>
          <span :class="label">Model — blank for the pipeline's default</span>
          <input v-model="model" :class="field" placeholder="claude-sonnet-5" />
        </div>
        <label class="flex items-center gap-2 text-xs text-slate-400">
          <input v-model="dryRun" type="checkbox" />
          Dry run — show what would be generated, generate nothing
        </label>
      </div>

      <div class="mt-4 flex items-center gap-2">
        <button
          class="flex-1 rounded bg-white/10 py-2 text-sm font-semibold text-white
                 hover:bg-white/15 disabled:opacity-30"
          :disabled="isRunning || starting || !subcategory || !languages.length"
          @click="start"
        >
          {{ isRunning ? 'Running…' : starting ? 'Starting…' : 'Generate' }}
        </button>
        <button
          v-if="isRunning"
          class="rounded border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5"
          title="Stops the rest of the batch; questions already written stay written"
          @click="stop"
        >
          Stop
        </button>
      </div>

      <p v-if="error" class="mt-3 text-sm text-red-400">{{ error }}</p>

      <p class="mt-4 border-t border-white/5 pt-3 text-[11px] leading-relaxed text-slate-600">
        Each question is an agent run of its own — research, then write — so expect a minute or
        two apiece. Generated questions land unreviewed: the game will not draw one until you
        review it next door.
      </p>
    </div>

    <!-- what it is doing -->
    <div class="flex min-w-0 flex-1 flex-col">
      <div
        v-if="written.length || failures.length"
        class="shrink-0 border-b border-white/5 p-3"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs text-slate-500">
            {{ written.length }} written<span v-if="failures.length">, {{ failures.length }} failed</span>
          </span>
          <button
            v-for="question in written"
            :key="question.id"
            class="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1
                   font-mono text-[11px] text-emerald-200 hover:bg-emerald-500/20"
            @click="openInEditor(question.id)"
          >
            {{ question.id }} →
          </button>
        </div>
      </div>

      <div v-if="!events.length" class="grid flex-1 place-items-center px-8 text-center">
        <p class="max-w-sm text-sm text-slate-600">
          Nothing running. Pick a category and press Generate — the agent's research, its tool
          calls and what it writes all show up here as it goes.
        </p>
      </div>

      <ol v-else class="min-h-0 flex-1 space-y-1 overflow-y-auto p-4 font-mono text-xs">
        <li v-for="line in log" :key="line.index" class="flex gap-2">
          <span v-if="line.label" class="w-28 shrink-0 text-right text-slate-600">
            {{ line.label }}
          </span>
          <span v-else class="w-28 shrink-0" />
          <span class="min-w-0 break-words whitespace-pre-wrap" :class="KIND_STYLES[line.kind]">
            {{ line.text }}
          </span>
        </li>
      </ol>
    </div>
  </div>
</template>
