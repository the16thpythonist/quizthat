<script setup lang="ts">
/**
 * The right pane: one question, edited.
 *
 * Drafts live here and are only written on Save. Two files sit behind this one
 * pane — `meta.json` and `question.<lang>.json` — and Save writes whichever of
 * them actually changed, so editing a German teaser does not rewrite the meta
 * of a question somebody else is also touching.
 */
import { computed, ref, watch } from 'vue'
import type { Difficulty, QuestionType } from '../types/session'
import type { MetaPatch, QuestionBody } from './api'
import { api, detach } from './api'
import { useAdminStore, messageFor } from './store'
import AnswerDataEditor from './AnswerDataEditor.vue'
import QuestionPreview from './QuestionPreview.vue'

const admin = useAdminStore()

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'very_hard']
const TYPES: QuestionType[] = [
  'multiple_choice',
  'sorting',
  'map_location',
  'calculation',
  'estimation',
  'battle_map',
]

const draftMeta = ref<MetaPatch | null>(null)
const draftBody = ref<QuestionBody | null>(null)
const saving = ref(false)
const reviewing = ref(false)
const saveError = ref<string | null>(null)
const savedAt = ref<string | null>(null)

/** Reset the drafts whenever a different question or language is opened. */
watch(
  () => [admin.bundle?.id, admin.language] as const,
  () => {
    saveError.value = null
    savedAt.value = null
    const meta = admin.bundle?.meta
    draftMeta.value = meta
      ? {
          major_category: meta.major_category,
          subcategory: meta.subcategory,
          difficulty: meta.difficulty,
          question_type: meta.question_type,
          time_limit_seconds: meta.time_limit_seconds,
        }
      : null
    draftBody.value = admin.body ? detach(admin.body) : null
  },
  { immediate: true },
)

const metaDirty = computed(() => {
  const meta = admin.bundle?.meta
  if (!meta || !draftMeta.value) return false
  return (
    meta.major_category !== draftMeta.value.major_category ||
    meta.subcategory !== draftMeta.value.subcategory ||
    meta.difficulty !== draftMeta.value.difficulty ||
    meta.question_type !== draftMeta.value.question_type ||
    meta.time_limit_seconds !== draftMeta.value.time_limit_seconds
  )
})

const bodyDirty = computed(
  () => !!draftBody.value && JSON.stringify(draftBody.value) !== JSON.stringify(admin.body),
)

const dirty = computed(() => metaDirty.value || bodyDirty.value)

/** The clips for the language on screen, with placeholders called out. */
const clips = computed(() =>
  (admin.bundle?.audio ?? []).filter((clip) => clip.language === admin.language),
)

async function save() {
  if (!admin.bundle || !dirty.value) return
  saving.value = true
  saveError.value = null
  try {
    if (metaDirty.value && draftMeta.value) await admin.saveMeta(draftMeta.value)
    if (bodyDirty.value && draftBody.value) await admin.saveQuestion(draftBody.value)
    savedAt.value = new Date().toLocaleTimeString()
  } catch (err) {
    saveError.value = messageFor(err)
  } finally {
    saving.value = false
  }
}

/**
 * The gate between a generated question and the game.
 *
 * Unreviewed questions are left out of `corpus-index.json`, so this is not a
 * label — it is what makes a question playable.
 */
async function setReviewed(reviewed: boolean) {
  reviewing.value = true
  saveError.value = null
  try {
    await admin.setReviewed(reviewed)
  } catch (err) {
    saveError.value = messageFor(err)
  } finally {
    reviewing.value = false
  }
}

function revert() {
  draftBody.value = admin.body ? detach(admin.body) : null
  const meta = admin.bundle?.meta
  if (meta) {
    draftMeta.value = {
      major_category: meta.major_category,
      subcategory: meta.subcategory,
      difficulty: meta.difficulty,
      question_type: meta.question_type,
      time_limit_seconds: meta.time_limit_seconds,
    }
  }
  saveError.value = null
}

const field =
  'w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm outline-none focus:border-white/30'
const label = 'mb-1 block text-[11px] uppercase tracking-wide text-slate-500'
</script>

<template>
  <div v-if="!admin.selectedId" class="grid h-full place-items-center px-8 text-center">
    <p class="max-w-xs text-sm text-slate-600">
      Pick a category on the left, then a question in the middle.
    </p>
  </div>

  <p v-else-if="admin.loadingBundle" class="p-6 text-sm text-slate-500">Loading…</p>

  <div v-else-if="admin.bundle && draftMeta" class="p-6">
    <!-- header -->
    <div class="mb-5 flex flex-wrap items-center gap-3">
      <div class="min-w-0 flex-1">
        <h2 class="truncate text-lg font-bold text-white">
          {{ draftBody?.teaser_title || admin.bundle.id }}
        </h2>
        <p class="font-mono text-[11px] text-slate-600">{{ admin.bundle.id }}</p>
      </div>

      <div class="flex rounded border border-white/10 p-0.5">
        <button
          v-for="lang in admin.bundle.present_languages"
          :key="lang"
          class="rounded px-2.5 py-1 text-xs uppercase"
          :class="lang === admin.language ? 'bg-white/15 text-white' : 'text-slate-400'"
          :title="dirty ? 'Switching language discards unsaved edits' : ''"
          @click="admin.language = lang"
        >
          {{ lang }}
        </button>
      </div>

      <button
        v-if="admin.bundle.meta.reviewed === false"
        class="rounded bg-amber-500/20 px-3 py-1.5 text-sm font-semibold text-amber-200
               hover:bg-amber-500/30 disabled:opacity-30"
        :disabled="reviewing"
        title="Generated but unreviewed — the game will not draw it until you approve it"
        @click="setReviewed(true)"
      >
        {{ reviewing ? 'Marking…' : 'Mark reviewed' }}
      </button>
      <button
        v-else
        class="text-xs text-slate-600 underline hover:text-slate-400"
        :disabled="reviewing"
        title="Put this question back in the unreviewed pile, out of the game"
        @click="setReviewed(false)"
      >
        unreview
      </button>

      <button
        class="rounded bg-white/10 px-4 py-1.5 text-sm font-semibold text-white
               hover:bg-white/15 disabled:opacity-30"
        :disabled="!dirty || saving"
        @click="save"
      >
        {{ saving ? 'Saving…' : 'Save' }}
      </button>
      <button
        v-if="dirty"
        class="text-xs text-slate-500 underline hover:text-slate-300"
        @click="revert"
      >
        revert
      </button>
      <span v-else-if="savedAt" class="text-xs text-emerald-500/80">saved {{ savedAt }}</span>
    </div>

    <p v-if="saveError" class="mb-4 rounded bg-red-950/50 px-3 py-2 text-sm text-red-300">
      {{ saveError }}
    </p>

    <p
      v-if="admin.bundle.meta.reviewed === false"
      class="mb-4 rounded border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-xs text-amber-200"
    >
      Generated and not yet reviewed, so <strong>the game will not draw it</strong> — check the
      facts and the phrasing, then mark it reviewed. Rebuild the index
      (<code>scripts/build-corpus-index</code>) for the change to reach the game.
    </p>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div class="space-y-6">
        <!-- meta.json -->
        <section>
          <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Classification
            <span class="ml-1 font-normal normal-case text-slate-600">meta.json</span>
          </h3>
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <span :class="label">Major category</span>
              <input v-model="draftMeta.major_category" list="majors" :class="field" />
              <datalist id="majors">
                <option v-for="value in admin.facets.major_category" :key="value" :value="value" />
              </datalist>
            </div>
            <div>
              <span :class="label">Subcategory</span>
              <input v-model="draftMeta.subcategory" :class="field" />
            </div>
            <div>
              <span :class="label">Difficulty</span>
              <select v-model="draftMeta.difficulty" :class="field">
                <option v-for="value in DIFFICULTIES" :key="value" :value="value">
                  {{ value }}
                </option>
              </select>
            </div>
            <div>
              <span :class="label">Question type</span>
              <select v-model="draftMeta.question_type" :class="field">
                <option v-for="value in TYPES" :key="value" :value="value">{{ value }}</option>
              </select>
            </div>
            <div>
              <span :class="label">Time limit (seconds, blank for none)</span>
              <input
                :value="draftMeta.time_limit_seconds ?? ''"
                type="number"
                min="0"
                :class="field"
                @input="
                  draftMeta.time_limit_seconds =
                    ($event.target as HTMLInputElement).value === ''
                      ? null
                      : Number(($event.target as HTMLInputElement).value)
                "
              />
            </div>
          </div>
          <p class="mt-2 text-[11px] text-slate-600">
            Changing the category moves this question in the tree on save. Everything else in
            meta.json — id, languages, provenance — belongs to the pipeline.
          </p>
        </section>

        <!-- question.<lang>.json -->
        <section v-if="draftBody">
          <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Text
            <span class="ml-1 font-normal normal-case text-slate-600">
              question.{{ admin.language }}.json
            </span>
          </h3>
          <div class="space-y-3">
            <div>
              <span :class="label">Teaser title — what the slot shows before it is picked</span>
              <input v-model="draftBody.teaser_title" :class="field" />
            </div>
            <div>
              <span :class="label">Question</span>
              <textarea v-model="draftBody.question_text" rows="3" :class="field" />
            </div>
            <div>
              <span :class="label">Hint</span>
              <input
                :value="draftBody.hint ?? ''"
                :class="field"
                placeholder="none"
                @input="
                  draftBody.hint = ($event.target as HTMLInputElement).value || null
                "
              />
            </div>
          </div>
        </section>

        <section v-if="draftBody">
          <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Answer
          </h3>
          <AnswerDataEditor
            v-model="draftBody.answer_data"
            :question-type="draftMeta.question_type"
          />
        </section>

        <!-- audio -->
        <section>
          <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Audio
            <span class="ml-1 font-normal normal-case text-slate-600">
              {{ admin.language }}
            </span>
          </h3>
          <p v-if="!clips.length" class="text-sm text-slate-600">
            No clips for this language. Generate them with
            <code class="text-slate-500">uv run quizthat audio generate</code>.
          </p>
          <ul v-else class="space-y-2">
            <li v-for="clip in clips" :key="clip.name" class="flex items-center gap-3">
              <span class="w-24 shrink-0 text-xs text-slate-400">{{ clip.kind }}</span>
              <!-- A zero-byte file is what a keyless stub run leaves behind, so
                   offering it as playable audio would just be silence. -->
              <span v-if="!clip.bytes" class="text-xs text-amber-500/80">
                placeholder — generated without an API key, regenerate it
              </span>
              <audio
                v-else
                controls
                preload="none"
                class="h-8 max-w-sm flex-1"
                :src="api.audioUrl(admin.bundle.id, clip.name)"
              />
            </li>
          </ul>
        </section>
      </div>

      <!-- preview -->
      <aside v-if="draftBody">
        <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Preview
        </h3>
        <QuestionPreview :body="draftBody" :question-type="draftMeta.question_type" />
        <p class="mt-2 text-[11px] text-slate-600">
          An approximation of the table, not the game's own screens — close enough to judge
          phrasing and length. Play the question when it matters.
        </p>
      </aside>
    </div>
  </div>
</template>
