import type { GameMetadata } from '@/types/game-info'
import { nullable, object, positive, string } from './contracts'
import { validQueueId } from '@/shared/lib/game-info'
const name = (value: unknown): value is string =>
  string(value) && value.trim().length > 0 && value.length <= 160 && !/\p{Cc}/u.test(value)
export const isGameMetadata = object<GameMetadata>({
  queueId: nullable(validQueueId),
  mapId: nullable(positive),
  queueName: nullable(name),
  mapName: nullable(name),
})
