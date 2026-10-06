import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SHAVIBE CANDLE',
    short_name: 'SHAVIBE',
    description: 'Good scents, good moods. Candles for your everyday.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#fffaf4',
    theme_color: '#593d35',
    icons: [
      { src: '/icons/shavibe-candle.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  }
}
