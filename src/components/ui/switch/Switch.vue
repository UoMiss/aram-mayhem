<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'reka-ui'

defineProps<{ modelValue: boolean; label: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <SwitchRoot
    :model-value="modelValue"
    :aria-label="label"
    class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full bg-surface-raised transition-colors data-[state=checked]:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <SwitchThumb
      class="pointer-events-none block h-5 w-5 translate-x-0.5 rounded-full bg-on-solid transition-transform data-[state=checked]:translate-x-[22px]"
    />
  </SwitchRoot>
</template>
