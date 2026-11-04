<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useModalFocus } from '@/shared/composables/use-modal-focus'
import { useI18n } from 'vue-i18n'
import { TEAM_DRAW_PLAYERS } from '@/mocks/tools'
import { captureAndDeliverScreenshot } from '@/services/image.service'
import { useFeedbackStore } from '@/stores/feedback'
import { useTeamShuffle } from '@/features/tools/useTeamShuffle'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const feedback = useFeedbackStore()
const { t } = useI18n({ useScope: 'global' })
const { isShuffling, hasResult, groupA, groupB, countdown, randomTime, start, dispose } =
  useTeamShuffle(TEAM_DRAW_PLAYERS)

const teamCaptureRef = ref<HTMLElement | null>(null)
const isCopying = ref(false)
const drawerRef = ref<HTMLElement | null>(null)
useModalFocus(() => props.open, drawerRef, requestClose)

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
        a: 'h-9 px-2 rounded-xl bg-info-surface/80 border border-info-bright flex items-center justify-center text-xs font-bold text-info-contrast name-box truncate overflow-hidden',
        b: 'h-9 px-2 rounded-xl bg-danger-surface/80 border border-danger-bright flex items-center justify-center text-xs font-bold text-danger-contrast name-box truncate overflow-hidden',
      }
    : {
        a: 'h-9 px-2 rounded-xl bg-info-base/40 border border-info-bright/30 flex items-center justify-center text-xs font-bold text-info-pale shadow-md pop-in truncate overflow-hidden',
        b: 'h-9 px-2 rounded-xl bg-danger-base/40 border border-danger-bright/30 flex items-center justify-center text-xs font-bold text-danger-pale shadow-md pop-in truncate overflow-hidden',
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
    feedback.notify(t('toast.teamSelectFirst'), 'error')
    return
  }

  const target = teamCaptureRef.value
  if (!target) {
    feedback.notify(t('toast.screenshotMissing'), 'error')
    return
  }

  isCopying.value = true
  try {
    const result = await captureAndDeliverScreenshot(target, {
      fileNamePrefix: t('team.title'),
    })
    feedback.notify(
      result.status === 'copied' ? t('toast.teamCopied') : t('toast.teamDownloaded'),
      'success',
    )
  } catch {
    feedback.notify(t('toast.teamFailed'), 'error')
  } finally {
    isCopying.value = false
  }
}

onUnmounted(dispose)
</script>

<template>
  <div
    id="teamDrawer"
    ref="drawerRef"
    tabindex="-1"
    :inert="!props.open"
    class="fixed inset-0 z-modal mx-auto max-w-[480px] overflow-hidden"
    :class="{ 'drawer-hidden': !props.open }"
    role="dialog"
    aria-modal="true"
    aria-labelledby="team-drawer-title"
    :aria-hidden="!props.open"
  >
    <div
      class="drawer-overlay absolute inset-0 bg-ink/70 backdrop-blur-sm"
      @click="requestClose"
    ></div>

    <div
      class="drawer-content absolute right-0 bottom-0 left-0 space-y-5 rounded-t-3xl border-t border-on-solid/10 bg-drawer p-5 shadow-2xl"
    >
      <div class="flex items-start justify-between">
        <div>
          <h2 id="team-drawer-title" class="text-lg font-extrabold text-on-solid">
            {{ t('team.title') }}
          </h2>
          <p class="mt-1 text-xs text-text-muted">{{ t('team.description') }}</p>
        </div>
        <button
          type="button"
          :aria-label="t('a11y.closeTeamDrawer')"
          :disabled="isShuffling"
          class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-surface-raised/60 text-text-muted transition-colors hover:text-on-solid"
          @click="requestClose"
        >
          <i class="fa-solid fa-xmark text-sm"></i>
        </button>
      </div>

      <div class="space-y-3">
        <div class="flex items-center justify-between text-xs">
          <span class="font-medium text-text-secondary">{{ t('team.participants') }}</span>
          <span id="playerCount" class="text-text-subtle">{{
            t('team.participantCount', { count: TEAM_DRAW_PLAYERS.length })
          }}</span>
        </div>

        <div
          id="teamCaptureArea"
          ref="teamCaptureRef"
          data-screenshot-root
          class="space-y-3 rounded-2xl border border-on-solid/5 bg-drawer p-3"
        >
          <div
            id="teamContainer"
            class="flex min-h-[220px] items-center justify-center rounded-2xl border border-on-solid/5 bg-surface-sunken/60 p-4 transition-all duration-300"
            :class="{ 'shuffling-active': isShuffling }"
          >
            <div v-show="!hasResult" id="unrandomizedView" class="grid w-full grid-cols-2 gap-2.5">
              <div
                v-for="player in TEAM_DRAW_PLAYERS"
                :key="player.id"
                :title="player.name"
                class="flex h-10 items-center justify-center truncate rounded-xl border border-on-solid/10 bg-surface-raised/50 px-2 text-xs font-bold text-on-solid shadow-inner"
              >
                {{ player.name }}
              </div>
            </div>

            <div
              v-show="hasResult"
              id="randomizedView"
              class="relative z-floating grid w-full grid-cols-2 gap-4 divide-x divide-on-solid/5"
            >
              <div class="space-y-3 pr-2">
                <div class="flex items-center justify-between text-xs">
                  <span class="flex items-center gap-1.5 font-bold text-info">
                    <span class="h-2 w-2 rounded-full bg-info"></span>
                    {{ t('team.groupA') }}
                  </span>
                  <span class="text-[11px] text-text-subtle">{{
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
                  <span class="flex items-center gap-1.5 font-bold text-danger">
                    <span class="h-2 w-2 rounded-full bg-danger"></span>
                    {{ t('team.groupB') }}
                  </span>
                  <span class="text-[11px] text-text-subtle">{{
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
            class="flex items-center justify-between px-1 text-[11px] text-text-subtle"
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
          class="flex items-center justify-center gap-2 rounded-2xl bg-info px-4 py-3 text-sm font-extrabold text-surface-base shadow-lg shadow-info/20 transition-all hover:bg-info-light active:scale-95"
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
          class="flex items-center justify-center gap-2 rounded-2xl border border-border-strong/80 bg-surface-sunken px-4 py-3 text-sm font-bold text-text-soft transition-all hover:bg-surface-raised active:scale-95"
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
