/* global __YOZI_WEBSITE__ */
export const WEBSITE_MODE = typeof __YOZI_WEBSITE__ !== 'undefined' && __YOZI_WEBSITE__ === true;
export const WEBSITE_TITLE = 'Yozi AI 1.0 · 考研英语写作教练';
export const WEBSITE_ROUTES = Object.freeze([
  'pages/index/index',
  'pages/login/index',
  'pages/login/wechat-callback',
  'pages/settings/privacy',
  'pages/settings/terms'
]);

// Website builds deliberately omit App pages. Normalize before the router reads the hash,
// including same-document links and browser back/forward, rather than mounting an unknown route.
export function installWebsiteRouteFallback(target) {
  const normalize = () => {
    const location = target.location;
    const route = location.hash.replace(/^#\/?/, '').split('?')[0];
    if (!route || WEBSITE_ROUTES.includes(route)) return;
    target.history.replaceState(target.history.state, '', `${location.pathname}${location.search}#/pages/index/index`);
  };
  normalize();
  target.addEventListener('hashchange', normalize);
  target.addEventListener('popstate', normalize);
  return () => {
    target.removeEventListener('hashchange', normalize);
    target.removeEventListener('popstate', normalize);
  };
}
export const MAC_DOWNLOAD = Object.freeze({
  url: '/downloads/Yozi-AI-2.2.0-macOS-arm64.zip',
  // Public launch label only. The existing archive and its embedded 2.2.0 stay unchanged.
  version: '1.0',
  platform: 'macOS 14 及以上 · Apple 芯片',
  channel: 'macOS'
});
export const WEBSITE_CONTACT = Object.freeze({ url: '/contact.html' });
