<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { TEAM_DRAW_PLAYERS } from '@/mocks/tools'
import { captureAndDeliverScreenshot } from '@/services/image.service'
import { useAppStore } from '@/stores/app'
import { useTeamShuffle } from '@/features/tools/useTeamShuffle'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const app = useAppStore()
const { t } = useI18n({ useScope: 'global' })
const { isShuffling, hasResult, groupA, groupB, countdown, randomTime, start, dispose } =
  useTeamShuffle(TEAM_DRAW_PLAYERS)

const teamCaptureRef = ref<HTMLElement | null>(null)
const isCopying = ref(false)

const canCopy = computed(() => !isShuffling.value && !isCopying.value)

const copyButtonText = computed(() =>
  isCopying.value ? t('common.generating') : t('team.copyImage'),
)

const randomButtonText = computed(() => {
  if (isShuffling.value) {
    return countdown.value > 0
      ? t('team.shuffling', { count: countdown.value })
      : t('team.revealing')
  }
  return hasResult.value ? t('team.retry') : t('team.start')
})

const animatedTeamClasses = computed(() =>
  isShuffling.value
    ? {
        a: 'h-9 px-2 rounded-xl bg-cyan-900/80 border border-cyan-500 flex items-center justify-center text-xs font-bold text-cyan-50 name-box truncate overflow-hidden',
        b: 'h-9 px-2 rounded-xl bg-rose-900/80 border border-rose-500 flex items-center justify-center text-xs font-bold text-rose-50 name-box truncate overflow-hidden',
      }
    : {
        a: 'h-9 px-2 rounded-xl bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-center text-xs font-bold text-cyan-200 shadow-md pop-in truncate overflow-hidden',
        b: 'h-9 px-2 rounded-xl bg-rose-950/40 border border-rose-500/30 flex items-center justify-center text-xs font-bold text-rose-200 shadow-md pop-in truncate overflow-hidden',
      },
)

function requestClose() {
  if (isShuffling.value) return
  emit('close')
}

function startRandomize() {
  start()
}

async function copyTeamImage() {
  if (!canCopy.value) return
  if (!hasResult.value) {
    app.notify(t('toast.teamSelectFirst'), 'error')
    return
  }

  const target = teamCaptureRef.value
  if (!target) {
    app.notify(t('toast.screenshotMissing'), 'error')
    return
  }

  isCopying.value = true
  try {
    const result = await captureAndDeliverScreenshot(target, {
      fileNamePrefix: t('team.title'),
    })
    app.notify(
      result.status === 'copied' ? t('toast.teamCopied') : t('toast.teamDownloaded'),
      'success',
    )
  } catch {
    app.notify(t('toast.teamFailed'), 'error')
  } finally {
    isCopying.value = false
  }
}

onUnmounted(dispose)
</script>

<template>
  <div
    id="teamDrawer"
    class="fixed inset-0 z-50 mx-auto max-w-[480px] overflow-hidden"
    :class="{ 'drawer-hidden': !props.open }"
    role="dialog"
    aria-modal="true"
    aria-labelledby="team-drawer-title"
    :aria-hidden="!props.open"
  >
    <div
      class="drawer-overlay absolute inset-0 bg-black/70 backdrop-blur-sm"
      @click="requestClose"
    ></div>

    <div
      class="drawer-content absolute right-0 bottom-0 left-0 space-y-5 rounded-t-3xl border-t border-white/10 bg-[#0c0d18] p-5 shadow-2xl"
    >
      <div class="flex items-start justify-between">
        <div>
          <h2 id="team-drawer-title" class="text-lg font-extrabold text-white">
            {{ t('team.title') }}
          </h2>
          <p class="mt-1 text-xs text-slate-400">{{ t('team.description') }}</p>
        </div>
        <button
          type="button"
          :aria-label="t('a11y.closeTeamDrawer')"
          class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-slate-800/60 text-slate-400 transition-colors hover:text-white"
          @click="requestClose"
        >
          <i class="fa-solid fa-xmark text-sm"></i>
        </button>
      </div>

      <div class="space-y-3">
        <div class="flex items-center justify-between text-xs">
          <span class="font-medium text-slate-300">{{ t('team.participants') }}</span>
          <span id="playerCount" class="text-slate-500">{{
            t('team.participantCount', { count: TEAM_DRAW_PLAYERS.length })
          }}</span>
        </div>

        <div
          id="teamCaptureArea"
          ref="teamCaptureRef"
          data-screenshot-root
          class="space-y-3 rounded-2xl border border-white/5 bg-[#0c0d18] p-3"
        >
          <div
            id="teamContainer"
            class="flex min-h-[220px] items-center justify-center rounded-2xl border border-white/5 bg-slate-900/60 p-4 transition-all duration-300"
            :class="{ 'shuffling-active': isShuffling }"
          >
            <div v-show="!hasResult" id="unrandomizedView" class="grid w-full grid-cols-2 gap-2.5">
              <div
                v-for="player in TEAM_DRAW_PLAYERS"
                :key="player.id"
                :title="player.name"
                class="flex h-10 items-center justify-center truncate rounded-xl border border-white/10 bg-slate-800/50 px-2 text-xs font-bold text-white shadow-inner"
              >
                {{ player.name }}
              </div>
            </div>

            <div
              v-show="hasResult"
              id="randomizedView"
              class="relative z-20 grid w-full grid-cols-2 gap-4 divide-x divide-white/5"
            >
              <div class="space-y-3 pr-2">
                <div class="flex items-center justify-between text-xs">
                  <span class="flex items-center gap-1.5 font-bold text-cyan-400">
                    <span class="h-2 w-2 rounded-full bg-cyan-400"></span>
                    {{ t('team.groupA') }}
                  </span>
                  <span class="text-[11px] text-slate-500">{{
                    t('team.groupCount', { count: groupA.length })
                  }}</span>
                </div>
                <div id="teamA" class="grid grid-cols-1 gap-2">
                  <div
                    v-for="player in groupA"
                    :key="player.id"
                    :title="player.name"
                    :class="animatedTeamClasses.a"
                  >
                    {{ player.name }}
                  </div>
                </div>
              </div>

              <div class="space-y-3 pl-4">
                <div class="flex items-center justify-between text-xs">
                  <span class="flex items-center gap-1.5 font-bold text-rose-400">
                    <span class="h-2 w-2 rounded-full bg-rose-400"></span>
                    {{ t('team.groupB') }}
                  </span>
                  <span class="text-[11px] text-slate-500">{{
                    t('team.groupCount', { count: groupB.length })
                  }}</span>
                </div>
                <div id="teamB" class="grid grid-cols-1 gap-2">
                  <div
                    v-for="player in groupB"
                    :key="player.id"
                    :title="player.name"
                    :class="animatedTeamClasses.b"
                  >
                    {{ player.name }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="hasResult && !isShuffling"
            id="timestampBar"
            class="flex items-center justify-between px-1 text-[11px] text-slate-500"
          >
            <span>{{ t('team.timeLabel') }}</span>
            <span id="randomTimeText">{{ randomTime }}</span>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3 pt-1">
        <button
          id="randomBtn"
          type="button"
          :disabled="isShuffling"
          class="flex items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-extrabold text-slate-950 shadow-lg shadow-cyan-400/20 transition-all hover:bg-cyan-300 active:scale-95"
          :class="isShuffling ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'"
          @click="startRandomize"
        >
          <i class="fa-solid fa-shuffle text-xs"></i>
          <span>{{ randomButtonText }}</span>
        </button>

        <button
          id="copyTeamBtn"
          type="button"
          :disabled="!canCopy"
          :aria-busy="isCopying"
          class="flex items-center justify-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-900 px-4 py-3 text-sm font-bold text-slate-200 transition-all hover:bg-slate-800 active:scale-95"
          :class="!canCopy ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'"
          @click="copyTeamImage"
        >
          <i
            :class="
              isCopying ? 'fa-solid fa-spinner fa-spin text-xs' : 'fa-regular fa-copy text-xs'
            "
          ></i>
          <span>{{ copyButtonText }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
