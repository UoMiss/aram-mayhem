import type { GameflowEventListener, GameflowPhase, GameflowSnapshot } from '@/types/lcu'
import type { HomeSnapshot } from '@/types/home-api'
import type { LcuHistoryMatch, MatchHistorySnapshot } from '@/types/history-api'
import type { ParticipantSnapshot } from '@/types/participants'
import type {
  SettlementRequest,
  SettlementSnapshot,
  LcuSettlementPlayer,
  DamageSizeResult,
} from '@/types/settlement-api'
import type { MatchRuleRecord, OpeningChoice } from '@/types/match-rule-api'
import { LcuServiceError } from '@/services/desktop-error'

// Browser-only synthetic session. Its DTOs match IPC, but its source always remains mock.
const names = [
  '峡谷小米',
  '洞爷湖',
  '黛乃奈昭姿',
  'Faker',
  '湘川苦茶子',
  '奢谨筱箅栗',
  '翻斗花园牛爷爷',
  '召唤师52395',
  '提莫队长',
  '快乐风男',
]
const champions = [81, 221, 50, 122, 157, 17, 54, 1, 266, 518]
let size = 10
let custom = true
let phase: GameflowPhase = 'lobby'
let revision = 1
let session = 1
let gameId = '9100001'
let pendingReads = 0
let autoAccept = false
const listeners = new Set<GameflowEventListener>()
const records = new Map<string, MatchRuleRecord>()
const completed = new Map<string, SettlementSnapshot>()
export const DEMO_ACCOUNT = 'browser-demo-account'

export function demoHome(): HomeSnapshot {
  return {
    accountKey: DEMO_ACCOUNT,
    displayName: names[0]!,
    summonerLevel: 128,
    updatedAt: Date.now(),
  }
}
export function demoFlow(): GameflowSnapshot {
  const now = Date.now()
  const lobby = {
    lobbyId: `demo-room-${session}`,
    queueId: custom ? 0 : 2400,
    mapId: 12,
    gameMode: 'ARAM',
    isCustomGame: custom,
    memberCount: size,
    updatedAt: now,
  }
  return {
    readyCheckStatus: phase === 'ready_check' ? (autoAccept ? 'accepted' : 'waiting') : null,
    revision,
    updatedAt: now,
    connected: true,
    phase,
    rawPhase: phase
      .split('_')
      .map((part) => part[0]!.toUpperCase() + part.slice(1))
      .join(''),
    transport: 'polling',
    source: 'mock',
    simulated: true,
    code: null,
    message: null,
    session:
      phase === 'none'
        ? null
        : {
            modeContext: {
              queueId: lobby.queueId,
              mapId: 12,
              gameMode: 'ARAM',
              isCustomGame: custom,
              source: 'lobby',
            },
            sessionKey: `demo-session-${session}`,
            gameId: phase === 'lobby' ? null : gameId,
            game: phase === 'lobby' ? null : lobby,
            connectionGeneration: 1,
            phase,
            startedAt: now,
            updatedAt: now,
            lobby: phase === 'lobby' ? lobby : null,
            championSelect: null,
            snapshotComplete: true,
          },
  }
}
export function subscribeDemoFlow(listener: GameflowEventListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function configureDemo(options: {
  size?: number
  custom?: boolean
  phase?: GameflowPhase
  delayed?: boolean
  autoAccept?: boolean
}) {
  if (options.size !== undefined && ![6, 8, 10].includes(options.size)) return
  if (options.size !== undefined || options.custom !== undefined) {
    size = options.size ?? size
    custom = options.custom ?? custom
    phase = 'lobby'
    session++
    gameId = String(9100000 + session)
  }
  if (options.phase) phase = options.phase
  if (options.autoAccept !== undefined) autoAccept = options.autoAccept
  pendingReads = options.delayed ? 2 : 0
  revision++
  const snapshot = demoFlow()
  for (const listener of listeners) listener({ type: 'updated', snapshot })
}
export function demoParticipants(): ParticipantSnapshot {
  const flow = demoFlow()
  const ready = custom && phase === 'lobby'
  return {
    completeness: ready ? 'complete' : 'unknown',
    evidence: ready ? 'custom_teams' : 'none',
    issue: ready ? null : 'missing_context',
    eligibleCount: ready ? size : 0,
    unresolvedCount: 0,
    context: flow.session ? { sessionKey: flow.session.sessionKey, connectionGeneration: 1 } : null,
    accountKey: DEMO_ACCOUNT,
    lobbyKey: flow.session?.lobby?.lobbyId ?? null,
    status: ready
      ? 'custom'
      : phase === 'none'
        ? 'no_lobby'
        : phase === 'lobby'
          ? 'not_custom'
          : 'champ_select',
    players: ready
      ? names.slice(0, size).map((name, i) => ({ id: `demo-player-${i + 1}`, name }))
      : [],
    updatedAt: Date.now(),
  }
}
const historyTime = Date.now()
export function demoHistory(): MatchHistorySnapshot {
  const matches: LcuHistoryMatch[] = Array.from({ length: 20 }, (_, i) => ({
    id: String(9000001 + i),
    queueId: i % 2 === 0 ? 0 : 2400,
    mapId: 12,
    gameMode: 'ARAM',
    gameType: i % 2 === 0 ? 'CUSTOM_GAME' : 'MATCHED_GAME',
    createdAt: historyTime - (i + 1) * 3600000,
    durationSeconds: 1200 + i * 37,
    championId: champions[i % champions.length]!,
    championName: null,
    win: i % 3 !== 0,
    isFriend: true,
    kills: 8 + (i % 10),
    deaths: 5 + (i % 8),
    assists: 14 + (i % 12),
    damageDealt: 39617 + i * 713,
    damageTaken: 30800 + i * 531,
    goldEarned: 12000 + i * 242,
  }))
  const recent: LcuHistoryMatch[] = [...completed.values()]
    .filter((result) => Number(result.id) >= 9100000)
    .reverse()
    .map((result) => {
      const self = result.players.find((player) => player.isSelf)!
      return {
        id: result.id,
        queueId: result.queueId,
        mapId: result.mapId,
        gameMode: result.gameMode,
        gameType: result.gameType,
        createdAt: result.createdAt,
        durationSeconds: result.durationSeconds,
        championId: self.championId,
        championName: null,
        win: self.win,
        isFriend: true,
        kills: self.kills,
        deaths: self.deaths,
        assists: self.assists,
        damageDealt: self.damage === null ? null : Number(self.damage),
        damageTaken: self.taken === null ? null : Number(self.taken),
        goldEarned: null,
      }
    })
  return {
    accountKey: DEMO_ACCOUNT,
    displayName: names[0]!,
    matches: [...recent, ...matches].slice(0, 20),
    updatedAt: Date.now(),
  }
}
export function demoLockedRule(id: string) {
  return records.has(id) ? { ...records.get(id)! } : null
}
export function demoLockRule(choice: OpeningChoice): MatchRuleRecord {
  if (choice.sessionKey !== demoFlow().session?.sessionKey || choice.gameId !== gameId)
    throw new LcuServiceError('lcu.cancelled', 'Demo session changed')
  if (!records.has(gameId))
    records.set(gameId, { accountKey: DEMO_ACCOUNT, gameId, rule: choice.rule, luckyDigit: null })
  return { ...records.get(gameId)! }
}
function luckyDigit() {
  const bytes = new Uint8Array(1)
  do {
    crypto.getRandomValues(bytes)
  } while (bytes[0]! >= 250)
  return bytes[0]! % 10
}
export function demoSettlement(request: SettlementRequest): SettlementSnapshot {
  if (request.accountKey !== DEMO_ACCOUNT)
    throw new LcuServiceError('lcu.account_changed', 'Demo account changed')
  const saved = completed.get(request.gameId)
  if (saved) return structuredClone(saved)
  const historical = demoHistory().matches.find((match) => match.id === request.gameId)
  if (!historical && request.gameId !== gameId)
    throw new LcuServiceError('lcu.settlement_unavailable', 'Unknown demo match')
  if (!historical && pendingReads > 0) {
    pendingReads--
    throw new LcuServiceError('lcu.settlement_pending', 'Demo stats pending')
  }
  const index = historical ? Number(historical.id) - 9000001 : 0
  const isCustom = historical ? historical.queueId === 0 : custom
  const count = isCustom ? (historical ? [6, 8, 10][index % 3]! : size) : 10
  const record = records.get(request.gameId)
  if (
    record?.rule === 'lucky' &&
    record.luckyDigit === null &&
    ['waiting_for_stats', 'end_of_game'].includes(phase)
  )
    record.luckyDigit = luckyDigit()
  const appliedRule = record
    ? record.rule
    : historical
      ? (['damage', 'tail', 'lucky', 'damage_size'] as const)[index % 4]!
      : request.rule
  const lucky = record?.luckyDigit ?? (historical && appliedRule === 'lucky' ? 7 : null)
  const players: LcuSettlementPlayer[] = names.slice(0, count).map((nickname, i) => ({
    id: String(i + 1),
    teamId: i < count / 2 ? 100 : 200,
    championId:
      i === 0 && historical ? historical.championId : champions[(i + index) % champions.length]!,
    nickname,
    level: 18,
    isSelf: i === 0,
    isFriend: i > 0 && (isCustom || i < 4),
    win: i < count / 2 ? (historical?.win ?? true) : !(historical?.win ?? true),
    kills: i === 0 ? (historical?.kills ?? 12) : 5 + i,
    deaths: i === 0 ? (historical?.deaths ?? 8) : 4 + i,
    assists: i === 0 ? (historical?.assists ?? 20) : 12 + i,
    damage: String(i === 0 ? (historical?.damageDealt ?? 39617) : 35000 + i * 3213 + index * 713),
    taken: String(i === 0 ? (historical?.damageTaken ?? 30800) : 26000 + i * 1721),
    healing: String(2800 + i * 731),
    rank: null,
    ruleValue: null,
  }))
  const ready =
    appliedRule !== 'damage_size' &&
    appliedRule !== null &&
    (appliedRule !== 'lucky' || lucky !== null)
  if (ready) {
    const digits = (p: LcuSettlementPlayer) =>
      p.damage!.padStart(20, '0').split('').reverse().join('')
    const compare = (a: LcuSettlementPlayer, b: LcuSettlementPlayer) => {
      if (appliedRule === 'damage') return Number(BigInt(b.damage!) - BigInt(a.damage!))
      if (appliedRule === 'lucky') {
        const distance =
          Math.abs(Number(a.damage!.slice(-1)) - lucky!) -
          Math.abs(Number(b.damage!.slice(-1)) - lucky!)
        if (distance) return distance
      }
      return digits(b).localeCompare(digits(a))
    }
    const eligible = players.filter((p) => isCustom || p.isSelf || p.isFriend).sort(compare)
    eligible.forEach((p, i) => {
      p.rank = i > 0 && compare(p, eligible[i - 1]!) === 0 ? eligible[i - 1]!.rank : i + 1
      p.ruleValue =
        appliedRule === 'damage'
          ? p.damage
          : appliedRule === 'tail'
            ? p.damage!.slice(-1)
            : String(Math.abs(Number(p.damage!.slice(-1)) - lucky!))
    })
  }
  const snapshot: SettlementSnapshot = {
    id: request.gameId,
    accountKey: DEMO_ACCOUNT,
    queueId: historical?.queueId ?? (isCustom ? 0 : 2400),
    mapId: 12,
    gameMode: 'ARAM',
    gameType: isCustom ? 'CUSTOM_GAME' : 'MATCHED_GAME',
    createdAt: historical?.createdAt ?? Date.now(),
    durationSeconds: historical?.durationSeconds ?? 1488,
    appliedRule,
    isCustom,
    rankingStatus:
      appliedRule === 'damage_size'
        ? 'not_applicable'
        : ready
          ? 'ready'
          : appliedRule === null
            ? 'no_rule'
            : 'missing_lucky',
    luckyDigit: lucky,
    lockedRule: !!record || !!historical,
    players,
    updatedAt: Date.now(),
  }
  if (appliedRule === 'damage_size') {
    const complete = !!historical || (!!record && phase === 'end_of_game')
    const bytes = new Uint8Array(1)
    if (complete) crypto.getRandomValues(bytes)
    const outcome = complete ? (bytes[0]! & 1 ? 'big' : 'small') : null
    const participants: DamageSizeResult['participants'] = players
      .filter((p) => isCustom || p.isSelf || p.isFriend)
      .map((p) => ({
        id: p.id,
        identity: p.isSelf ? DEMO_ACCOUNT : `demo-player-${p.id}`,
        nickname: p.nickname,
        damage: p.damage,
        group: p.damage === null ? null : BigInt(p.damage) % 10n < 5n ? 'small' : 'big',
      }))
    snapshot.damageSize = {
      status: complete ? 'ready' : record ? 'pending' : 'preview',
      reason: complete ? null : record ? 'current_game_active' : 'unlocked',
      outcome,
      participants,
      redPacketPlayerIds: outcome
        ? participants.filter((p) => p.group === outcome).map((p) => p.id)
        : null,
      frozenAt: complete ? Date.now() : null,
    }
  }
  if (
    ((!historical && ready) || snapshot.damageSize?.status === 'ready') &&
    (historical || ['waiting_for_stats', 'end_of_game'].includes(phase))
  ) {
    completed.set(request.gameId, structuredClone(snapshot))
    // The demo keeps only the same twenty matches exposed by its history page.
    if (completed.size > 20) {
      const oldest = completed.keys().next().value!
      completed.delete(oldest)
      records.delete(oldest)
    }
  }
  return snapshot
}
