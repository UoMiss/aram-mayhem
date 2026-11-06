<script setup lang="ts">
import Switch from '@/components/ui/switch/Switch.vue'
const props = defineProps<{
  label: string
  modelValue: boolean
  bordered?: boolean
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <div
    class="flex items-center justify-between py-2"
    :class="{ 'border-b border-on-solid/5': props.bordered }"
  >
    <span class="text-sm text-text-soft">{{ label }}</span>
    <Switch
      :label="label"
      :disabled="disabled"
      :model-value="modelValue"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>
