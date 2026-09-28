import type { MetadataRoute } from 'next';

/**
 * What a phone needs to keep the app on its home screen and open it full
 * screen, like an app rather than a browser tab. iOS reads the name and
 * display mode from here, and its icon from the apple-touch-icon in layout.
 */

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Gains',
    short_name: 'Gains',
    description: 'Plan workouts, watch the form clips, and log what you lift.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0f1211',
    theme_color: '#0f1211',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
