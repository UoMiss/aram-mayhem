import type { MatchDetailFixture, SettlementPlayer } from '@/types/match-detail'
import dariusImage from '@/assets/champions/Darius.png'
import ezrealImage from '@/assets/champions/Ezreal.png'
import swainImage from '@/assets/champions/Swain.png'
import teemoImage from '@/assets/champions/Teemo.png'
import yasuoImage from '@/assets/champions/Yasuo.png'
import zeriImage from '@/assets/champions/Zeri.png'

/**
 * 原始 #page-match-detail 的 6 名玩家，顺序、头像、等级、排名、昵称、关系、
 * KDA、三项统计与百分比、评分均逐项照搬原始 HTML。
 */
const players: readonly SettlementPlayer[] = [
  {
    id: 'settlement-ezreal',
    team: 'red',
    champion: 'Ezreal',
    championImage: ezrealImage,
    level: 18,
    rank: 4,
    nickname: 'Ezreal#60943',
    relation: 'self',
    kda: { kills: 12, deaths: 10, assists: 10 },
    stats: [
      { key: 'damage', value: 39600, percent: 33, tone: 'rose' },
      { key: 'taken', value: 30800, percent: 15, tone: 'amber' },
      { key: 'healing', value: 2800, percent: 6, tone: 'emerald' },
    ],
    score: 10.4,
  },
  {
    id: 'settlement-zeri',
    team: 'red',
    champion: 'Zeri',
    championImage: zeriImage,
    level: 18,
    rank: 6,
    nickname: '湘川苦茶子#23624',
    relation: 'friend',
    kda: { kills: 11, deaths: 14, assists: 12 },
    stats: [
      { key: 'damage', value: 43600, percent: 36, tone: 'rose' },
      { key: 'taken', value: 71900, percent: 35, tone: 'amber' },
      { key: 'healing', value: 32600, percent: 64, tone: 'emerald' },
    ],
    score: 8.9,
  },
  {
    id: 'settlement-swain',
    team: 'red',
    champion: 'Swain',
    championImage: swainImage,
    level: 18,
    rank: 2,
    nickname: '召唤师52395#17144',
    relation: 'friend',
    kda: { kills: 4, deaths: 8, assists: 15 },
    stats: [
      { key: 'damage', value: 38600, percent: 31, tone: 'rose' },
      { key: 'taken', value: 103900, percent: 50, tone: 'amber' },
      { key: 'healing', value: 15700, percent: 31, tone: 'emerald' },
    ],
    score: 11.8,
  },
  {
    id: 'settlement-darius',
    team: 'blue',
    champion: 'Darius',
    championImage: dariusImage,
    level: 18,
    rank: 1,
    nickname: '翻斗花园牛爷爷#70976',
    relation: 'friend',
    kda: { kills: 10, deaths: 5, assists: 17 },
    stats: [
      { key: 'damage', value: 65000, percent: 34, tone: 'rose' },
      { key: 'taken', value: 36800, percent: 24, tone: 'amber' },
      { key: 'healing', value: 20500, percent: 50, tone: 'emerald' },
    ],
    score: 13.5,
  },
  {
    id: 'settlement-yasuo',
    team: 'blue',
    champion: 'Yasuo',
    championImage: yasuoImage,
    level: 18,
    rank: 3,
    nickname: '奢谨筱算粟#12704',
    relation: 'friend',
    kda: { kills: 12, deaths: 12, assists: 13 },
    stats: [
      { key: 'damage', value: 60400, percent: 32, tone: 'rose' },
      { key: 'taken', value: 79400, percent: 53, tone: 'amber' },
      { key: 'healing', value: 12900, percent: 31, tone: 'emerald' },
    ],
    score: 11.4,
  },
  {
    id: 'settlement-teemo',
    team: 'blue',
    champion: 'Teemo',
    championImage: teemoImage,
    level: 18,
    rank: 5,
    nickname: 'Faker#40155',
    relation: 'friend',
    kda: { kills: 10, deaths: 10, assists: 14 },
    stats: [
      { key: 'damage', value: 65400, percent: 34, tone: 'rose' },
      { key: 'taken', value: 34800, percent: 23, tone: 'amber' },
      { key: 'healing', value: 7600, percent: 19, tone: 'emerald' },
    ],
    score: 9.6,
  },
]

/**
 * 当前唯一结算 fixture。它不与 7 条历史战绩逐条对应；selectedMatchId 仅保留
 * 导航上下文，等未来按 matchId 获取真实详情时再替换为独立数据源。
 */
export const MATCH_DETAIL_FIXTURE: MatchDetailFixture = {
  id: 'shared-settlement-fixture',
  isSharedFixture: true,
  queueLabel: '自定义 (屠夫之桥)',
  duration: '24:48',
  redPacket: {
    entries: [
      { name: 'Ezreal', rank: 4 },
      { name: '洞爷湖', rank: 7 },
      { name: 'Faker', rank: 5 },
      { name: '翻斗花园牛爷爷', rank: 1 },
      { name: '召唤师52395', rank: 2 },
    ],
  },
  players,
}
