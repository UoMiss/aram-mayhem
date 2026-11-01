import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn-vue 组件通过 cn 合并 class，避免 Tailwind 冲突。 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
