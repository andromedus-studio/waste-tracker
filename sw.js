// Waste Tracker — service worker (ouverture de l'app sans réseau)
// À poser dans le même dossier que index.html.
// Si tu modifies ce fichier, incrémente CACHE_VERSION pour forcer la mise à jour.
const CACHE_VERSION = 'v2';
const CACHE = 'waste-tracker-' + CACHE_VERSION;

const ICON_KEYS = [
  'pneu', 'batterie', 'filtre-huile', 'huile-usagee', 'gazole-usage',
  'liquide-refroidissement', 'liquide-de-frein', 'dechets-souilles', 'carton',
  'tout-venant', 'aluminium', 'ferraille', 'plastique', 'citerne', 'aerosol',
  'inflammable', 'palette', 'pare-brise', 'pare-chocs', 'deee', 'ampoules', 'piles',
  'solvant', 'peinture', 'clim', 'lave-glace', 'eaux-usees', 'pieces-usagees',
  'catalyseur', 'poubelle'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const urls = ['./', './index.html'].concat(ICON_KEYS.map(k => './icons/' + k + '.png'));
    // On ajoute fichier par fichier : une icône manquante ne bloque pas l'installation.
    await Promise.all(urls.map(u => cache.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('waste-tracker-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function timeout(ms) {
  return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Fichiers Firebase (versionnés) : cache d'abord, réseau sinon.
  if (url.hostname === 'www.gstatic.com' && url.pathname.indexOf('/firebasejs/') === 0) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  // Tout ce qui n'est pas sur notre site (Firestore, connexion Google…) : on n'y touche pas.
  if (url.origin !== self.location.origin) return;

  // Page principale : réseau d'abord (pour avoir les mises à jour), cache si réseau absent ou trop lent.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        // 'no-cache' : on revalide toujours auprès du serveur, pour ne jamais rester sur une ancienne version
        const res = await Promise.race([fetch(req, { cache: 'no-cache' }), timeout(4000)]);
        if (res && res.ok) cache.put('./index.html', res.clone());
        return res;
      } catch (e) {
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Icônes et autres fichiers du site : cache d'abord, mis à jour en arrière-plan.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then(res => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return hit || (await network) || Response.error();
  })());
});
