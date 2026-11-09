<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { configureDemo, demoFlow } from '@/mocks/client-demo'
import { useConnectionStore } from '@/stores/connection'
import { useUiStore } from '@/stores/ui'
import { useSettingsStore } from '@/stores/settings'
import { ref, watch } from 'vue'
const { t } = useI18n({ useScope: 'global' })
const connection = useConnectionStore()
const ui = useUiStore()
const settings = useSettingsStore()
const roomSelection = ref('10')
watch(
  () => connection.gameflowSnapshot,
  (flow) => {
    if (flow?.session?.lobby)
      roomSelection.value = flow.session.lobby.isCustomGame
        ? String(flow.session.lobby.memberCount)
        : 'matched'
  },
  { immediate: true },
)
watch(
  () => settings.settings.autoAccept,
  (value) => {
    if (connection.gameflowSnapshot?.phase === 'ready_check') configureDemo({ autoAccept: value })
  },
)
function room(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  configureDemo({ size: value === 'matched' ? 10 : Number(value), custom: value !== 'matched' })
  connection.setGameflowSnapshot(demoFlow())
}
function advance() {
  const phase = connection.gameflowSnapshot?.phase
  configureDemo({
    phase:
      phase === 'lobby'
        ? connection.gameflowSnapshot?.session?.modeContext?.isCustomGame
          ? 'champ_select'
          : 'matchmaking'
        : phase === 'matchmaking'
          ? 'ready_check'
          : phase === 'ready_check'
            ? 'champ_select'
            : phase === 'champ_select'
              ? 'game_start'
              : phase === 'game_start'
                ? 'in_progress'
                : 'end_of_game',
    delayed: phase === 'in_progress',
    autoAccept: settings.settings.autoAccept,
  })
  connection.setGameflowSnapshot(demoFlow())
}
function newRoom() {
  configureDemo({ size: 10, custom: true })
  connection.setGameflowSnapshot(demoFlow())
  ui.setActiveTab('home')
}
</script>
<template>
  <details
    data-demo-controls
    class="fixed top-2 right-2 z-toast max-w-64 rounded-lg border border-brand/30 bg-card p-2 text-xs text-text-secondary shadow-lg"
  >
    <summary class="cursor-pointer text-brand-light">{{ t('connection.demoBadge') }}</summary>
    <div class="mt-2 space-y-2">
      <p>{{ t('demo.notice') }}</p>
      <template v-if="connection.isConnected">
        <label class="block"
          >{{ t('demo.room') }}
          <select
            class="mt-1 w-full rounded border border-border-strong bg-card p-1"
            :value="roomSelection"
            @change="room"
          >
            <option v-for="n in [6, 8, 10]" :key="n" :value="n">
              {{ t('demo.customSize', { n: n / 2 }) }}
            </option>
            <option value="matched">{{ t('demo.matched') }}</option>
          </select>
        </label>
        <button
          v-if="connection.gameflowSnapshot?.phase !== 'end_of_game'"
          class="block text-brand-light underline"
          @click="advance"
        >
          {{ t('demo.advance') }}
        </button>
        <button class="block text-brand-light underline" @click="newRoom">
          {{ t('demo.newRoom') }}
        </button>
        <button class="block text-brand-light underline" @click="connection.disconnect">
          {{ t('demo.disconnect') }}
        </button>
      </template>
      <button
        v-else
        :disabled="connection.isConnecting"
        class="text-brand-light underline"
        @click="connection.connect"
      >
        {{ t('connection.enterDemo') }}
      </button>
    </div>
  </details>
</template>
