// Service worker do sistema de escalas.
// Troque o número da versão abaixo se mudar os arquivos do "shell" e quiser forçar limpeza do cache.
const VERSAO = 'escala-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
// Bibliotecas externas que o sistema usa: guardadas após o 1º acesso para abrir sem internet.
const HOSTS_CDN = ['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(VERSAO).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

function redeComTimeout(req, ms) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), ms);
        fetch(req).then(r => { clearTimeout(t); resolve(r); }, err => { clearTimeout(t); reject(err); });
    });
}

// Página: tenta a rede (até 3s) para sempre pegar a versão nova; sem sinal, usa a cópia guardada.
async function paginaRedePrimeiro(req) {
    const cache = await caches.open(VERSAO);
    try {
        const r = await redeComTimeout(req, 3000);
        if (r && r.ok) cache.put('./index.html', r.clone());
        return r;
    } catch (err) {
        return (await cache.match('./index.html')) || (await caches.match(req, { ignoreSearch: true })) || Response.error();
    }
}

// Demais arquivos: responde do cache na hora e atualiza em segundo plano.
async function cacheEAtualiza(e, req) {
    const cache = await caches.open(VERSAO);
    const guardado = await cache.match(req);
    const rede = fetch(req).then(r => {
        if (r && (r.ok || r.type === 'opaque')) cache.put(req, r.clone());
        return r;
    }).catch(() => null);
    e.waitUntil(rede);
    return guardado || (await rede) || Response.error();
}

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);

    if (url.origin === self.location.origin) {
        if (req.mode === 'navigate') { e.respondWith(paginaRedePrimeiro(req)); return; }
        e.respondWith(cacheEAtualiza(e, req));
        return;
    }
    if (HOSTS_CDN.includes(url.hostname)) { e.respondWith(cacheEAtualiza(e, req)); return; }
    // Firestore, login etc. passam direto (o próprio Firebase cuida do offline).
});
