<script setup lang="ts">
const props = defineProps<{
  label: string
  modelValue: boolean
  bordered?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

function onChange(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).checked)
}
</script>

<template>
  <div
    class="flex items-center justify-between py-2"
    :class="{ 'border-b border-white/5': props.bordered }"
  >
    <span class="text-sm text-slate-200">{{ label }}</span>

    <label class="relative inline-flex cursor-pointer items-center">
      <input
        type="checkbox"
        role="switch"
        class="peer sr-only"
        :aria-label="label"
        :aria-checked="modelValue"
        :checked="modelValue"
        @change="onChange"
      />
      <div
        class="peer h-6 w-11 rounded-full bg-slate-800 after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:content-[''] after:transition-all peer-checked:bg-purple-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus-visible:ring-2 peer-focus-visible:ring-purple-400/70 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-slate-950"
      ></div>
    </label>
  </div>
</template>
