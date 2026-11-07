import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { download, renderHome, renderNotFound, WEBSITE_TITLE } from '../../website/render.mjs';
import { LEGAL_DOCS, legalPath, legalStyles, renderLegal } from '../../website/legal.mjs';

export { WEBSITE_TITLE };
const project = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const website = path.join(project, 'website');
const archive = path.join(project, 'public/downloads', download);
const additionalFonts = ['PlayfairDisplay-normal-400.woff2', 'OFL-playfairdisplay.txt'];
const languages = ['zh', 'en'];

const retirementWorker = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  const names = await caches.keys();
  await Promise.all(names.filter(name => name.startsWith('workbox-precache-v2-') && name.includes(self.location.origin)).map(name => caches.delete(name)));
  await self.clients.claim();
  await self.registration.unregister();
})()));
`;

export function buildWebsite(output = path.join(project, 'dist/website')) {
  const destination = path.resolve(output);
  if (destination === website || !destination.startsWith(project + path.sep)) throw new Error('Website output must be a separate project directory');
  if (!fs.existsSync(archive)) throw new Error('Existing approved Mac download is missing; do not generate or substitute an App build');
  const pages = languages.map(lang => [lang, renderHome(lang)]);
  const home = renderHome('zh', true), missing = renderNotFound();
  fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(path.join(destination, 'index.html'), home);
  for (const [lang, html] of pages) {
    fs.mkdirSync(path.join(destination, lang), { recursive: true });
    fs.writeFileSync(path.join(destination, lang, 'index.html'), html);
  }
  fs.writeFileSync(path.join(destination, '404.html'), missing);
  const legalCss = legalStyles();
  for (const lang of languages) for (const doc of LEGAL_DOCS) {
    fs.mkdirSync(path.join(destination, lang, doc), { recursive: true });
    fs.writeFileSync(path.join(destination, lang, doc, 'index.html'), renderLegal(lang, doc, legalCss));
  }
  fs.copyFileSync(path.join(website, 'favicon.svg'), path.join(destination, 'favicon.svg'));
  fs.cpSync(path.join(website, 'brand'), path.join(destination, 'brand'), { recursive: true });
  fs.copyFileSync(path.join(project, 'src/assets/brand/kitten-icon-master.png'), path.join(destination, 'brand/kitten.png'));
  fs.copyFileSync(path.join(website, 'manifest.webmanifest'), path.join(destination, 'manifest.webmanifest'));
  fs.cpSync(path.join(website, 'fonts'), path.join(destination, 'fonts'), { recursive: true });
  for (const file of additionalFonts) fs.copyFileSync(path.join(project, 'public/fonts', file), path.join(destination, 'fonts', file));
  // The existing public media URL may still have consumers outside the homepage.
  fs.cpSync(path.join(website, 'media'), path.join(destination, 'media'), { recursive: true });
  fs.writeFileSync(path.join(destination, 'sw.js'), retirementWorker);
  fs.writeFileSync(path.join(destination, 'robots.txt'), 'User-agent: *\nAllow: /\nDisallow: /exam-master/\nSitemap: https://yozi.bot.cd/sitemap.xml\n');
  const routes = ['', ...languages.map(lang => lang + '/'), ...languages.flatMap(lang => LEGAL_DOCS.map(doc => legalPath(lang, doc).slice(1)))];
  fs.writeFileSync(path.join(destination, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map(route => `<url><loc>https://yozi.bot.cd/${route}</loc></url>`).join('')}</urlset>\n`);
  fs.mkdirSync(path.join(destination, 'downloads'), { recursive: true });
  fs.copyFileSync(archive, path.join(destination, 'downloads', download));
  return destination;
}

// Keep the existing Vite contract. Only the public H5 entry receives these hooks.
export function websiteLaunchPlugin(enabled) {
  if (!enabled) return { name: 'yozi-website-launch' };
  return {
    name: 'yozi-website-launch',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const route = (req.url || '').split('?')[0];
        const lang = languages.find(item => route === '/' + item + '/' || route === '/' + item + '/index.html');
        const legal = languages.flatMap(item => LEGAL_DOCS.map(doc => [item, doc])).find(([item, doc]) => route === legalPath(item, doc) || route === legalPath(item, doc) + 'index.html');
        if (legal) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(renderLegal(...legal, legalStyles()));
        } else if (lang || route === '/404.html') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(lang ? renderHome(lang) : renderNotFound());
        } else if (route === '/fonts/inter-latin-300-500.woff2' || route === '/favicon.svg') {
          res.setHeader('Content-Type', route.endsWith('.svg') ? 'image/svg+xml' : 'font/woff2');
          fs.createReadStream(path.join(website, route)).pipe(res);
        } else next();
      });
    },
    transformIndexHtml: { order: 'post', handler: () => renderHome('zh', true) },
    writeBundle(options) { if (options.dir) buildWebsite(options.dir); }
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('Website built:', buildWebsite(process.argv[2]));
}
