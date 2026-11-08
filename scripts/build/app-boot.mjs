import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The App paints the same Muse entrance before the page bundle is ready.
// Website builds retain their original document without this plugin.
export function appBootPlugin(enabled) {
  return {
    name: 'yozi-app-boot',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        if (!enabled) return html;
        const marker = '<div id="app"></div>';
        if (!html.includes(marker)) throw new Error('App boot mount point is missing');
        const motion = fs.readFileSync(
          path.resolve(
            path.dirname(fileURLToPath(import.meta.url)),
            '../../src/components/business/learning/muse-launch.css'
          ),
          'utf8'
        );
        const style = `<style data-yozi-app-boot>
          :root { --yozi-boot-bg: #fcfcfc; }
          @media (prefers-color-scheme: dark) { :root { --yozi-boot-bg: #181819; } }
          :root[data-theme='light'] { --yozi-boot-bg: #fcfcfc; }
          :root[data-theme='dark'] { --yozi-boot-bg: #181819; }
          html[data-yozi-app] body { background: var(--yozi-boot-bg); }
          #yozi-app-boot { position: fixed; z-index: 10000; --canvas: var(--yozi-boot-bg); }
          .muse-launch__poster { width: 64px; height: 64px; object-fit: contain; }
          ${motion}
        </style>`;
        const placeholder = `<div id="yozi-app-boot" class="muse-launch" aria-hidden="true"><div class="muse-launch__ring"></div><img class="muse-launch__poster" src="/static/brand/kitten-avatar.png" alt="" /></div><div id="app"></div>`;
        return html
          .replace('<html ', '<html data-yozi-app ')
          .replace('</head>', `${style}</head>`)
          .replace(marker, placeholder);
      }
    }
  };
}
