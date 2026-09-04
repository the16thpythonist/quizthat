<script setup lang="ts">
/**
 * The left pane: major categories, expanding to subcategories.
 *
 * Built from the questions on disk, so every node has something behind it. That
 * also means the inconsistency CLAUDE.md records is visible here — a corpus
 * holding both `physics` and `Physics` shows two nodes, because to everything
 * else in the system they are two different categories. Fixing one in the
 * detail pane is how they merge, and the tree follows on save.
 */
import { ref } from 'vue'
import { useAdminStore } from './store'

const admin = useAdminStore()
const expanded = ref<Set<string>>(new Set())

function toggle(major: string) {
  if (expanded.value.has(major)) expanded.value.delete(major)
  else expanded.value.add(major)
  // Reassigned so Vue sees the change; a Set mutates in place.
  expanded.value = new Set(expanded.value)
}

/** Clicking a major both filters by it and opens it. */
function chooseMajor(major: string) {
  admin.selectCategory(major)
  if (!expanded.value.has(major)) toggle(major)
}

function isActive(major: string, sub: string | null = null) {
  return admin.selection.major === major && admin.selection.subcategory === sub
}
</script>

<template>
  <nav class="py-2 text-sm">
    <button
      class="flex w-full items-center gap-2 px-4 py-1.5 text-left hover:bg-white/5"
      :class="admin.selection.major === null ? 'text-white' : 'text-slate-400'"
      @click="admin.selectCategory(null)"
    >
      <span class="flex-1">All questions</span>
      <span class="text-xs text-slate-600">{{ admin.entries.length }}</span>
    </button>

    <div v-for="node in admin.tree" :key="node.major" class="mt-0.5">
      <div
        class="flex items-center hover:bg-white/5"
        :class="isActive(node.major) ? 'bg-white/5' : ''"
      >
        <button
          class="w-6 shrink-0 py-1.5 text-xs text-slate-600 hover:text-slate-300"
          :aria-expanded="expanded.has(node.major)"
          :aria-label="`Expand ${node.major}`"
          @click="toggle(node.major)"
        >
          {{ expanded.has(node.major) ? '▾' : '▸' }}
        </button>
        <button
          class="flex flex-1 items-center gap-2 py-1.5 pr-4 text-left"
          :class="isActive(node.major) ? 'font-semibold text-white' : 'text-slate-300'"
          @click="chooseMajor(node.major)"
        >
          <span class="flex-1 truncate">{{ node.major }}</span>
          <span class="text-xs text-slate-600">{{ node.count }}</span>
        </button>
      </div>

      <button
        v-for="sub in expanded.has(node.major) ? node.subcategories : []"
        :key="sub.name"
        class="flex w-full items-center gap-2 py-1 pl-10 pr-4 text-left text-xs
               hover:bg-white/5"
        :class="isActive(node.major, sub.name) ? 'font-semibold text-white' : 'text-slate-400'"
        @click="admin.selectCategory(node.major, sub.name)"
      >
        <span class="flex-1 truncate">{{ sub.name }}</span>
        <span class="text-slate-600">{{ sub.count }}</span>
      </button>
    </div>
  </nav>
</template>
