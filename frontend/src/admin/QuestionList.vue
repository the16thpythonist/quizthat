<script setup lang="ts">
/**
 * The middle pane: whatever the tree and the filters have narrowed to.
 *
 * Rows lead with the teaser title rather than the id, which is why the server's
 * listing carries titles at all — a column of eight hex digits is not something
 * anyone can browse.
 */
import { useAdminStore } from './store'

const admin = useAdminStore()

/** The best title to show for a row, whatever language it exists in. */
function titleFor(titles: Record<string, string>, present: string[]): string {
  for (const language of [admin.language, ...present]) {
    const title = titles?.[language]
    if (title) return title
  }
  return '(no teaser title)'
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="space-y-2 border-b border-white/5 p-3">
      <input
        v-model="admin.search"
        type="search"
        placeholder="Search title, id or category"
        class="w-full rounded border border-white/10 bg-black/30 px-3 py-1.5 text-sm
               outline-none focus:border-white/30"
      />
      <div class="flex gap-2">
        <select
          v-model="admin.difficulty"
          class="min-w-0 flex-1 rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
        >
          <option value="">any difficulty</option>
          <option v-for="value in admin.facets.difficulty" :key="value" :value="value">
            {{ value }}
          </option>
        </select>
        <select
          v-model="admin.questionType"
          class="min-w-0 flex-1 rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
        >
          <option value="">any type</option>
          <option v-for="value in admin.facets.question_type" :key="value" :value="value">
            {{ value }}
          </option>
        </select>
      </div>
    </div>

    <p v-if="admin.loading" class="p-4 text-sm text-slate-500">Loading…</p>
    <p v-else-if="!admin.filtered.length" class="p-4 text-sm text-slate-500">
      Nothing matches. Try a wider filter, or re-scan if the pipeline has just run.
    </p>

    <ul v-else class="min-h-0 flex-1 overflow-y-auto">
      <li v-for="entry in admin.filtered" :key="entry.id">
        <button
          class="w-full border-b border-white/5 px-4 py-2.5 text-left hover:bg-white/5"
          :class="entry.id === admin.selectedId ? 'bg-white/10' : ''"
          @click="admin.open(entry.id)"
        >
          <p class="flex items-center gap-1.5 truncate text-sm text-slate-100">
            <!-- The game cannot draw this one until somebody reviews it. -->
            <span
              v-if="!entry.reviewed"
              class="shrink-0 rounded bg-amber-500/20 px-1.5 text-[10px] font-semibold
                     uppercase tracking-wide text-amber-300"
              title="Generated, not yet reviewed — the game skips it"
              >new</span
            >
            <span class="truncate">{{ titleFor(entry.titles, entry.present_languages) }}</span>
          </p>
          <p class="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
            <span class="truncate">{{ entry.subcategory || entry.major_category }}</span>
            <span class="opacity-40">·</span>
            <span>{{ entry.difficulty }}</span>
            <span class="ml-auto flex items-center gap-1">
              <span
                v-for="language in entry.present_languages"
                :key="language"
                class="rounded bg-white/5 px-1 uppercase"
                >{{ language }}</span
              >
              <span v-if="entry.has_audio" title="has audio">♪</span>
            </span>
          </p>
        </button>
      </li>
    </ul>
  </div>
</template>
