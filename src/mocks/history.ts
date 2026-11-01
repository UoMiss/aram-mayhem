import type { HistoryFilter, MatchHistoryItem } from '@/types/history'
import aatroxImage from '@/assets/champions/Aatrox.png'
import annieImage from '@/assets/champions/Annie.png'
import malphiteImage from '@/assets/champions/Malphite.png'
import neekoImage from '@/assets/champions/Neeko.png'
import swainImage from '@/assets/champions/Swain.png'
import xerathImage from '@/assets/champions/Xerath.png'
import zeriImage from '@/assets/champions/Zeri.png'

/** 筛选仅保存业务值；中文标签由组件层 i18n 映射。 */
export const HISTORY_FILTERS: readonly HistoryFilter[] = ['all', 'hex', 'custom']

/**
 * 原始 #page-history 的 7 条演示战绩，顺序、英雄、胜负、KDA、时间完全一致。
 * 头像已下载到 src/assets/champions，避免运行时依赖外部图片 CDN。
 */
export const MATCH_HISTORY: readonly MatchHistoryItem[] = [
  {
    id: 'match-001',
    mode: 'hex',
    result: 'defeat',
    champion: 'Zeri',
    championImage: zeriImage,
    kda: { kills: 18, deaths: 13, assists: 22 },
    isFriend: true,
    timeLabel: '9小时前',
  },
  {
    id: 'match-002',
    mode: 'hex',
    result: 'victory',
    champion: 'Xerath',
    championImage: xerathImage,
    kda: { kills: 7, deaths: 10, assists: 36 },
    isFriend: true,
    timeLabel: '10小时前',
  },
  {
    id: 'match-003',
    mode: 'hex',
    result: 'defeat',
    champion: 'Malphite',
    championImage: malphiteImage,
    kda: { kills: 5, deaths: 8, assists: 14 },
    isFriend: true,
    timeLabel: '10小时前',
  },
  {
    id: 'match-004',
    mode: 'hex',
    result: 'defeat',
    champion: 'Neeko',
    championImage: neekoImage,
    kda: { kills: 9, deaths: 14, assists: 16 },
    isFriend: true,
    timeLabel: '10-25 03:04',
  },
  {
    id: 'match-005',
    mode: 'hex',
    result: 'victory',
    champion: 'Annie',
    championImage: annieImage,
    kda: { kills: 17, deaths: 13, assists: 22 },
    isFriend: true,
    timeLabel: '10-25 02:39',
  },
  {
    id: 'match-006',
    mode: 'custom',
    result: 'defeat',
    champion: 'Swain',
    championImage: swainImage,
    kda: { kills: 8, deaths: 10, assists: 38 },
    isFriend: true,
    timeLabel: '10-25 02:17',
  },
  {
    id: 'match-007',
    mode: 'custom',
    result: 'victory',
    champion: 'Aatrox',
    championImage: aatroxImage,
    kda: { kills: 3, deaths: 8, assists: 24 },
    isFriend: true,
    timeLabel: '10-25 01:49',
  },
]
