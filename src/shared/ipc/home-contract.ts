import type { HomeSnapshot } from '@/types/home-api'
import { nullable, object, string, unsigned } from './contracts'

export const isHomeSnapshot = object<HomeSnapshot>({
  accountKey: (value): value is string => string(value) && /^[A-Za-z0-9_-]{1,128}$/.test(value),
  displayName: nullable(
    (value): value is string => string(value) && value.trim().length > 0 && value.length <= 513,
  ),
  summonerLevel: nullable(
    (value): value is number => unsigned(value) && value > 0 && value <= 4294967295,
  ),
  updatedAt: unsigned,
})
