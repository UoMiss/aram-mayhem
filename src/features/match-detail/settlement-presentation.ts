import { getChampionImage, getChampionName } from '@/shared/lib/champions'
import type { SettlementPlayer, SettlementStat } from '@/types/match-detail'
import type { SettlementSnapshot } from '@/types/settlement-api'

const metrics = [
  { key: 'damage', tone: 'rose' },
  { key: 'taken', tone: 'amber' },
  { key: 'healing', tone: 'emerald' },
] as const
const exactText = (value: string) => BigInt(value).toLocaleString('zh-CN')

export function settlementPlayers(
  snapshot: SettlementSnapshot,
  unknownName: (id: string) => string,
): SettlementPlayer[] {
  // Floating-point ratios affect only the visual bars, never exact displayed values or ranks.
  const max = metrics.map(({ key }) =>
    Math.max(1, ...snapshot.players.map((player) => Number(player[key] ?? 0))),
  )
  return snapshot.players.map((player) => ({
    id: player.id,
    teamId: player.teamId,
    team: player.teamId === 100 ? 'blue' : 'red',
    champion: getChampionName(player.championId) ?? `#${player.championId}`,
    championImage: getChampionImage(player.championId),
    level: player.level,
    rank: player.rank,
    nickname: player.nickname ?? unknownName(player.id),
    relation: player.isSelf ? 'self' : player.isFriend ? 'friend' : null,
    kda: { kills: player.kills, deaths: player.deaths, assists: player.assists },
    stats: metrics.map(({ key, tone }, index): SettlementStat => ({
      key,
      tone,
      value: player[key] === null ? null : exactText(player[key]),
      percent: (100 * Number(player[key] ?? 0)) / max[index]!,
    })),
    score: null,
    ruleValue: player.ruleValue === null ? null : exactText(player.ruleValue),
  }))
}

export function redPacketSelection(snapshot: SettlementSnapshot) {
  if (snapshot.rankingStatus !== 'ready') return null
  const ranked = snapshot.players
    .filter((player) => player.rank !== null)
    .sort((a, b) => a.rank! - b.rank!)
  const count = ranked.length
  let quota: number
  if (count === 3) quota = 1
  else if (count === 4 || count === 5) quota = 2
  else if (snapshot.isCustom && count >= 6 && count <= 10) quota = Math.floor(count / 2)
  else return null

  const cutoff = ranked[count - quota]!.rank!
  return {
    quota,
    entries: ranked.filter((player) => player.rank! >= cutoff),
  }
}
