import catalog from '@/assets/champions/catalog.json'

// Vite resolves these URLs at build time; no external CDN or runtime file access.
const images = import.meta.glob<string>('../../assets/champions/*.png', {
  eager: true,
  import: 'default',
  query: '?url',
})
const champions = new Map(catalog.champions.map((champion) => [champion.id, champion]))

export function getChampionImage(id: number): string {
  const champion = champions.get(id)
  return champion ? (images[`../../assets/champions/${champion.file}`] ?? '') : ''
}

export function getChampionName(id: number): string | null {
  return champions.get(id)?.name ?? null
}
