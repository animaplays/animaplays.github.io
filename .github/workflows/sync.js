const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DB_URL = process.env.FIREBASE_DB_URL;
const SA_RAW = process.env.FIREBASE_SA;

// Blogger (opcional): se os 4 secrets existirem, cada publish também cria/atualiza o post no Blogger.
const BLOGGER_CLIENT_ID = process.env.BLOGGER_CLIENT_ID;
const BLOGGER_CLIENT_SECRET = process.env.BLOGGER_CLIENT_SECRET;
const BLOGGER_REFRESH_TOKEN = process.env.BLOGGER_REFRESH_TOKEN;
const BLOGGER_BLOG_ID = process.env.BLOGGER_BLOG_ID;
const FORCE_BLOGGER = process.env.FORCE_BLOGGER === 'true';
const bloggerEnabled = () => Boolean(BLOGGER_CLIENT_ID && BLOGGER_CLIENT_SECRET && BLOGGER_REFRESH_TOKEN && BLOGGER_BLOG_ID);

let SA = null;
if (SA_RAW) {
  SA = JSON.parse(SA_RAW);
  if (SA.private_key && !SA.private_key.includes('\n')) {
    SA.private_key = SA.private_key.replace(/\\n/g, '\n');
  }
}

function log(msg) { console.log(msg); }

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error((label || 'operation') + ' timed out after ' + ms + 'ms')), ms))
  ]);
}

function git(cmd) {
  log('git ' + cmd);
  const r = execSync('git ' + cmd, { stdio: 'pipe', cwd: path.resolve(__dirname, '../..') });
  log('  -> ' + (r.toString().trim() || 'ok'));
  return r;
}

function gitHasChanges() {
  const r = execSync('git status --porcelain', { stdio: 'pipe', cwd: path.resolve(__dirname, '../..') });
  return r.toString().trim().length > 0;
}

function resolveCapa(post, imgFiles) {
  const slug = post.slug || '';
  const hasCapa = post.image && !/-card\./i.test(post.image) && post.image.trim() !== '';
  if (hasCapa) return post.image;
  const capa = imgFiles.find(f => f.startsWith(slug) && /-capa\./i.test(f));
  if (capa) return '../img/' + capa;
  return post.image || post.cardImage || '';
}

const admin = require('firebase-admin');

async function main() {
  log('=== SYNC START ===');

  admin.initializeApp({
    credential: admin.credential.cert(SA),
    databaseURL: DB_URL
  });
  const db = admin.database();
  log('Firebase Admin initialized');

  const imgDir = path.resolve(__dirname, '../../img');
  const imgFiles = fs.existsSync(imgDir) ? fs.readdirSync(imgDir) : [];

  log('Reading posts from Firebase...');
  const snap = await withTimeout(db.ref('animaplays/posts').once('value'), 30000, 'Firebase read');
  const posts = snap.val();
  log('Posts: ' + (posts ? Object.keys(posts).length : 0));

  if (!posts) { log('No posts.'); finish(); return; }

  const allPosts = Object.values(posts);

  const FORCE = process.env.FORCE === 'true';
  const pending = FORCE ? allPosts : allPosts.filter(p => p.status === 'pending');
  log('Force: ' + FORCE);
  log('Pending: ' + pending.length);

  if (!pending.length) { log('Nothing to do.'); finish(); return; }

  const postsDir = path.resolve(__dirname, '../../posts');
  if (!fs.existsSync(postsDir)) fs.mkdirSync(postsDir, { recursive: true });

  for (const post of pending) {
    post._heroImg = resolveCapa(post, imgFiles);
    log('Writing HTML: ' + post.slug);
    const html = buildPostHTML(post);
    fs.writeFileSync(path.join(postsDir, post.slug + '.html'), html, 'utf-8');

    await db.ref('animaplays/posts/' + post.slug + '/status').set('published');
    log('Marked published: ' + post.slug);

    await maybePostToBlogger(db, post);
  }

  const postsJsonPath = path.resolve(__dirname, '../../posts.json');
  let list = [];
  try { list = JSON.parse(fs.readFileSync(postsJsonPath, 'utf-8')); } catch {}

  for (const post of pending) {
    const episodeUrls = (post.episodes || []).map(e => e.video).filter(Boolean);
    const entry = {
      slug: post.slug, title: post.title, image: post.cardImage || post.image || '',
      subtitle: (post.episodes && post.episodes[0] && post.episodes[0].title) || '',
      genres: post.genres || [], author: post.author || '', episodes: episodeUrls,
      createdAt: post.createdAt || new Date().toISOString(),
      updatedAt: post.updatedAt || new Date().toISOString()
    };
    const idx = list.findIndex(p => p.slug === post.slug);
    if (idx >= 0) { entry.createdAt = list[idx].createdAt || entry.createdAt; list[idx] = entry; }
    else list.push(entry);
  }
  list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  fs.writeFileSync(postsJsonPath, JSON.stringify(list, null, 2), 'utf-8');

  if (gitHasChanges()) {
    git('add -A');
    git('commit -m "Auto-sync: publish posts from Firebase"');
    git('push origin main');
  } else {
    log('No changes to commit.');
  }
  log('=== DONE ===');
  finish();
}

function finish() {
  try { admin.app().delete(); } catch (e) {}
  setTimeout(() => process.exit(0), 100);
}

function absUrl(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('../')) return 'https://animaplays.github.io/' + s.replace(/^(\.\.\/)+/, '');
  if (s.startsWith('/')) return 'https://animaplays.github.io' + s;
  return 'https://animaplays.github.io/' + s;
}

// Domínios com reputação ruim que acionam o SmartScreen (Edge). Remove do conteúdo publicado.
function smartSafe(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return s;
  let host = '';
  try { host = new URL(s).hostname.toLowerCase(); } catch (e) { return s; }
  if (/null-null\.shop$/.test(host) || /(^|\.)neosoro\.[a-z]+$/.test(host) || /\.gq$/.test(host)) return '';
  return s.replace(/^http:\/\//i, 'https://');
}

// URL do player oficial do Archive.org (embed) para um link de download permalink.
const archiveEmbedFor = (u) => {
  const m = String(u || '').match(/archive\.org\/download\/([^/?#]+)/i);
  return m && m[1] ? 'https://archive.org/embed/' + m[1] : u;
};
const isArchiveDownload = (u) => /archive\.org\/download\//i.test(String(u || ''));

// HTML simplificado para o Blogger (sem <script>: o Blogger remove scripts dos posts).
function buildBloggerHTML(post) {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const extractSrc = (s) => { if (!s) return ''; const m = String(s).match(/src=["']([^"']+)["']/i); return m ? m[1] : String(s).trim(); };
  const ytId = (url) => { if (!url) return ''; const s = extractSrc(url); const m = s.match(/youtube\.com\/embed\/([^?&#]+)/) || s.match(/[?&]v=([^&#]+)/) || s.match(/youtu\.be\/([^?&#]+)/); return m ? m[1] : ''; };
  const norm = (input) => {
    if (!input) return '';
    const id = ytId(input);
    if (id) return 'https://www.youtube.com/embed/' + id;
    let raw = extractSrc(input);
    const enc = (s) => s.split('/').map(p => { try { return encodeURIComponent(decodeURIComponent(p)); } catch { return encodeURIComponent(p); } }).join('/');
    let m = raw.match(/archive\.org\/details\/([^/?#]+)\/(.+)/i);
    if (m) {
      const fname = m[2].replace(/\+/g, ' ').replace(/\.(mkv|avi)$/i, '.mp4');
      return 'https://archive.org/download/' + m[1] + '/' + enc(fname);
    }
    m = raw.match(/archive\.org\/details\/([^/?#]+)/i);
    if (m) return 'https://archive.org/embed/' + m[1];
    return smartSafe(raw.replace(/\.(mkv|avi)$/i, '.mp4'));
  };
  const serversOf = (ep) => (ep.videos && ep.videos.length ? ep.videos : (ep.video ? [{ name: 'Servidor 1', url: ep.video }] : []))
    .filter(v => v && v.url).map(v => ({ name: v.name || 'Servidor', url: norm(v.url) })).filter(v => v.url);

  const hero = absUrl(post._heroImg || post.cardImage || post.image || '');
  // Formato de dados: o tema do Blogger (bloco #anima-data) renderiza o player completo.
  const data = {
    v: 1,
    title: post.title || '',
    slug: post.slug || '',
    cover: hero,
    cardImg: absUrl(post.cardImage || ''),
    synopsis: post.synopsis || '',
    genres: (post.genres || []).filter(Boolean),
    defaultVideo: norm(post.defaultVideo),
    episodes: (post.episodes || []).map((ep, i) => ({
      title: ep.title || ('Episódio ' + (i + 1)),
      videos: serversOf(ep)
    }))
  };
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

  return (hero ? '<p><img src="' + esc(hero) + '" alt="' + esc(post.title) + '" style="max-width:100%;height:auto;border-radius:12px;"></p>' : '') +
    '<div id="anima-data" style="display:none;">' + json + '</div>' +
    (post.synopsis ? '<p>' + esc(post.synopsis) + '</p>' : '');
}

async function bloggerToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: BLOGGER_CLIENT_ID, client_secret: BLOGGER_CLIENT_SECRET, refresh_token: BLOGGER_REFRESH_TOKEN, grant_type: 'refresh_token' })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('Blogger token: ' + (j.error_description || j.error || ('HTTP ' + r.status)));
  return j.access_token;
}

// Procura post existente pelo título exato (rede anti-duplicado caso o ID se perca).
async function bloggerFindByTitle(token, title) {
  const want = String(title || '').trim().toLowerCase();
  if (!want) return null;
  let pageToken = '';
  for (let page = 0; page < 5; page++) {
    const u = 'https://www.googleapis.com/blogger/v3/blogs/' + BLOGGER_BLOG_ID + '/posts?fetchBodies=false&maxResults=50' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    const r = await fetch(u, { headers: { Authorization: 'Bearer ' + token } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('Blogger list: ' + (j.error && j.error.message ? j.error.message : ('HTTP ' + r.status)));
    const items = j.items || [];
    for (const it of items) {
      if (String(it.title || '').trim().toLowerCase() === want) return { id: it.id, url: it.url };
    }
    pageToken = j.nextPageToken || '';
    if (!pageToken) break;
  }
  return null;
}

async function maybePostToBlogger(db, post) {
  if (!bloggerEnabled()) { log('Blogger: secrets ausentes, pulando.'); return; }
  try {
    const token = await bloggerToken();
    let targetId = post.bloggerPostId || null;
    if (!targetId) {
      try {
        const found = await bloggerFindByTitle(token, post.title);
        if (found) { targetId = found.id; log('Blogger: "' + post.title + '" já existe, atualizando (sem duplicar).'); }
      } catch (e) { log('Blogger busca: ' + e.message); }
    }
    if (!targetId && process.env.FORCE === 'true' && !FORCE_BLOGGER) { log('Blogger: ' + post.slug + ' novo e FORCE ativo, pulando (sem duplicar).'); return; }
    const content = buildBloggerHTML(post);
    const labels = (post.genres || []).filter(Boolean);
    let url, id;
    if (targetId) {
      const r = await fetch('https://www.googleapis.com/blogger/v3/blogs/' + BLOGGER_BLOG_ID + '/posts/' + targetId, {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: post.title, content, labels })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error('Blogger update: ' + (j.error && j.error.message ? j.error.message : ('HTTP ' + r.status)));
      url = j.url; id = j.id;
      log('Blogger atualizado: ' + url);
    } else {
      const r = await fetch('https://www.googleapis.com/blogger/v3/blogs/' + BLOGGER_BLOG_ID + '/posts/', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: post.title, content, labels })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error('Blogger insert: ' + (j.error && j.error.message ? j.error.message : ('HTTP ' + r.status)));
      url = j.url; id = j.id;
      log('Blogger criado: ' + url);
    }
    if (id) await db.ref('animaplays/posts/' + post.slug).update({ bloggerPostId: id, bloggerUrl: url || '' });
  } catch (e) {
    log('Blogger ERRO (' + post.slug + '): ' + e.message);
  }
}

function buildPostHTML(d) {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const normalizeVideo = (input) => {
    if (!input) return '';
    const extractSrc = (s) => { if (!s) return ''; const m = String(s).match(/src=["']([^"']+)["']/i); return m ? m[1] : String(s).trim(); };
    const ytId = (url) => { if (!url) return ''; const s = extractSrc(url); const m = s.match(/youtube\.com\/embed\/([^?&#]+)/) || s.match(/[?&]v=([^&#]+)/) || s.match(/youtu\.be\/([^?&#]+)/); return m ? m[1] : ''; };
    const id = ytId(input);
    if (id) return 'https://www.youtube.com/embed/' + id;
    let raw = extractSrc(input);
    const enc = (s) => s.split('/').map(p => { try { return encodeURIComponent(decodeURIComponent(p)); } catch { return encodeURIComponent(p); } }).join('/');
    let m = raw.match(/archive\.org\/details\/([^/?#]+)\/(.+)/i);
    if (m) {
      const fname = m[2].replace(/\+/g, ' ').replace(/\.(mkv|avi)$/i, '.mp4');
      return 'https://archive.org/download/' + m[1] + '/' + enc(fname);
    }
    m = raw.match(/archive\.org\/details\/([^/?#]+)/i);
    if (m) return 'https://archive.org/embed/' + m[1];
    return smartSafe(raw.replace(/\.(mkv|avi)$/i, '.mp4'));
  };
  const videoPlayerHTML = (url) => {
    const src = normalizeVideo(url);
    if (!src) return '<div style="padding:40px;text-align:center;color:#666;">Nenhum vídeo</div>';
    if (/\.(mp4|webm)(\?|#|$)/i.test(src)) return '<div data-apad style="position:absolute;top:0;left:0;width:100%;height:100%;z-index:6;background:#0a0a0a;display:none"></div><video controls preload="none" onerror="vErr(this)" style="position:absolute;top:0;left:0;width:100%;height:100%;background:#000;" src="' + esc(src) + '"></video>';
    if (isArchiveDownload(src)) return '<iframe src="' + esc(archiveEmbedFor(src)) + '" title="Vídeo" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen" loading="lazy" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;"></iframe>';
    return '<iframe src="' + esc(src) + '" title="Vídeo" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen" loading="lazy" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;"></iframe>';
  };
  const thumbHTML = (video, idx) => {
    const extractSrc = (s) => { if (!s) return ''; const m = String(s).match(/src=["']([^"']+)["']/i); return m ? m[1] : String(s).trim(); };
    const ytId = (url) => { if (!url) return ''; const s = extractSrc(url); const m = s.match(/youtube\.com\/embed\/([^?&#]+)/) || s.match(/[?&]v=([^&#]+)/) || s.match(/youtu\.be\/([^?&#]+)/); return m ? m[1] : ''; };
    const id = ytId(video);
    if (id) return '<img src="https://img.youtube.com/vi/' + id + '/mqdefault.jpg" class="episode-thumb" alt="EP' + idx + '">';
    return '<div class="episode-thumb" style="background:#1a1a1a;display:flex;align-items:center;justify-content:center;font-size:10px;color:#888;">EP' + String(idx).padStart(2, '0') + '</div>';
  };

  const getServers = (ep) => (ep.videos && ep.videos.length ? ep.videos : (ep.video ? [{ name: 'Servidor 1', url: ep.video }] : []))
    .filter(v => v.url).map(v => ({ name: v.name || 'Servidor', url: normalizeVideo(v.url) }));
  const srcs = (d.episodes || []).map(ep => { const list = getServers(ep); return normalizeVideo((list[0] || {}).url || d.defaultVideo); });
  const epServers = (d.episodes || []).map(getServers);
  const eps = (d.episodes || []).map((ep, i) => {
    const isNew = i === 0;
    return '<a href="?ep=' + (i + 1) + '" data-idx="' + i + '" class="episode-item' + (isNew ? ' active' : '') + '" onclick="goEp(' + i + ');return false;">' +
      thumbHTML(ep.video || d.defaultVideo, i + 1) +
      '<div class="episode-info"><div class="ep-title">' + esc(ep.title || 'Episódio ' + (i + 1)) + '</div><div class="ep-meta">' + (getServers(ep).length > 1 ? getServers(ep).length + ' servidores' : 'Toque para assistir') + '</div></div>' +
      (isNew ? '<span class="episode-badge">NOVO</span>' : '') +
      '<button class="btn-play">▶</button></a>';
  }).join('\n');
  const epJson = JSON.stringify(srcs);
  const epServersJson = JSON.stringify(epServers);
  const epTitles = JSON.stringify((d.episodes || []).map((ep, i) => ep.title || ('Episódio ' + (i + 1))));
  const cardImg = d.cardImage || d.image || '';
  const heroImg = d._heroImg || d.image || d.cardImage || '';

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="https://animaplays.github.io/img/logo/favicon-32x32.png" rel="icon" type="image/png" sizes="32x32"/>
<link href="https://animaplays.github.io/img/logo/favicon-16x16.png" rel="icon" type="image/png" sizes="16x16"/>
<link href="https://animaplays.github.io/img/logo/apple-touch-icon.png" rel="apple-touch-icon" sizes="180x180"/>
<title>${esc(d.title)} &#8212; Anima Play</title>
<meta name="description" content="${esc((d.synopsis || '').slice(0, 160) || d.title + ' - Assista online no Anima Play.')}">
<meta property="og:title" content="${esc(d.title)} &#8212; Anima Play">
<meta property="og:description" content="${esc((d.synopsis || '').slice(0, 160) || d.title + ' - Assista online no Anima Play.')}">
<meta property="og:type" content="video.other">
<meta property="og:url" content="https://animaplays.github.io/posts/${esc(d.slug)}.html">
${cardImg ? '<meta property="og:image" content="https://animaplays.github.io/' + esc(cardImg.replace(/^\.\.\//, '')) + '">' : ''}
<meta name="anima-title" content="${esc(d.title)}">
<meta name="anima-card" content="${esc(cardImg)}">
<meta name="anima-subtitle" content="${esc((d.episodes && d.episodes[0] && d.episodes[0].title) || 'Nova Postagem')}">
<meta name="anima-genres" content="${esc((d.genres || []).join(','))}">
<meta name="anima-author" content="${esc(d.author || '')}">
<style>*{margin:0;padding:0;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}body{background:#0a0a0a;color:#fff;min-height:100vh;overflow-x:hidden}.main-header{display:flex;align-items:center;padding:20px 40px;background:linear-gradient(180deg,rgba(10,10,10,1) 0%,rgba(10,10,10,0) 100%)}.logo img{display:block;max-height:150px;width:auto;height:auto}.main-footer{text-align:center;padding:40px;color:#555;font-size:12px;border-top:1px solid #1a1a1a}.back-link{display:inline-block;color:#e50914;text-decoration:none;font-size:14px;margin-bottom:20px;padding:0 40px}.post-hero{position:relative;width:100%;height:400px;overflow:hidden}.post-hero img{width:100%;height:100%;object-fit:cover}.post-hero-overlay{position:absolute;bottom:0;left:0;right:0;padding:50px 40px 25px;background:linear-gradient(transparent,#0a0a0a)}.post-hero-overlay h1{font-size:32px;font-weight:800}.post-meta{display:flex;gap:10px;flex-wrap:wrap}.post-meta span{background:rgba(255,255,255,0.15);padding:3px 10px;border-radius:12px;font-size:12px;color:#ccc}.post-body{max-width:900px;margin:0 auto;padding:20px 40px 40px}.post-synopsis{color:#aaa;font-size:14px;line-height:1.7;margin-bottom:30px}.section-label{font-size:13px;color:#e50914;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;font-weight:700}.video-player{position:relative;width:100%;padding-top:56.25%;background:#1a1a1a;border-radius:12px;overflow:hidden;margin-bottom:12px}.ep-nav{display:flex;gap:10px;align-items:center;margin-bottom:24px;flex-wrap:wrap}.ep-nav button{background:#15191d;color:#fff;border:1px solid #2a2a2a;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer}.ep-nav button:hover:not(:disabled){border-color:#e50914;color:#e50914}.ep-nav button:disabled{opacity:.35;cursor:not-allowed}.ep-nav button.primary{background:#e50914;border-color:#e50914}.ep-nav button.primary:hover:not(:disabled){background:#f0151f;color:#fff}#epLabel{font-size:13px;color:#aaa}.episode-list{display:flex;flex-direction:column;gap:8px}.episode-item{display:flex;align-items:center;gap:14px;background:#15191d;padding:12px 16px;border-radius:10px;color:#fff;text-decoration:none}.episode-item.active{background:#e50914}.episode-thumb{width:90px;height:52px;border-radius:6px;object-fit:cover;background:#2a2a2a;flex-shrink:0}.episode-info{flex:1}.ep-title{font-size:14px;font-weight:600}.episode-badge{background:#e50914;color:#fff;font-size:10px;padding:2px 8px;border-radius:4px;font-weight:700}.btn-play{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.15);border:none;color:#fff;font-size:16px;cursor:pointer}.post-layout{display:grid;grid-template-columns:1fr 260px;gap:24px;max-width:1200px;margin:0 auto;padding:20px 40px 40px}.post-main{min-width:0}.post-body{max-width:none;margin:0;padding:0}.post-side{position:sticky;top:210px;align-self:start;display:flex;flex-direction:column;gap:16px}.side-section{background:rgba(20,20,20,.8);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:16px}.side-title{font-size:12px;font-weight:800;color:#e5e5e5;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px}.side-link{display:block;color:#fff;text-decoration:none;background:#e50914;border-radius:8px;padding:10px 14px;font-size:13px;font-weight:700;text-align:center}.side-link:hover{background:#f0151f}.side-chips{display:flex;flex-wrap:wrap;gap:6px}.side-chips a{background:rgba(255,255,255,.07);color:#ccc;text-decoration:none;font-size:12px;padding:6px 12px;border-radius:20px}.side-chips a:hover{background:#e50914;color:#fff}.side-post{display:flex;gap:10px;align-items:center;text-decoration:none;color:#fff;margin-bottom:10px}.post-link{display:block;padding:8px 10px;border-left:3px solid transparent;color:#bbb;text-decoration:none;font-size:13px;border-radius:4px;transition:background .15s,color .15s;margin-bottom:2px}.post-link:hover{background:rgba(255,255,255,.06);color:#fff}.post-link span{color:#e50914;margin-right:6px}.post-link.active{border-left-color:#e50914}.side-post img{width:64px;height:90px;object-fit:cover;border-radius:6px;background:#1a1a1a;flex-shrink:0}.side-post span{font-size:12px;font-weight:600;line-height:1.3}.server-tabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}.server-tabs button{background:#15191d;color:#ccc;border:1px solid #2a2a2a;padding:7px 14px;border-radius:999px;font-size:12px;font-weight:700;cursor:pointer}.server-tabs button.active{background:#e50914;border-color:#e50914;color:#fff}@media(max-width:900px){.post-layout{grid-template-columns:1fr}.post-side{position:static}}@media(max-width:768px){.post-hero{height:240px !important}.post-hero-overlay{padding:30px 20px 16px !important}.post-hero-overlay h1{font-size:24px !important}.main-header{padding:14px 16px}.back-link{padding:0 16px}.post-body{padding:12px 12px 28px}.video-player{border-radius:8px}.main-footer{padding:24px 16px}}.ap-inline-ad{display:flex;justify-content:center;align-items:center;min-height:90px;margin:16px 0;padding:10px 0;border-top:1px solid rgba(255,255,255,.06);border-bottom:1px solid rgba(255,255,255,.06);overflow:hidden}</style><script async src="https://www.googletagmanager.com/gtag/js?id=G-MMP1CVNLRE"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-MMP1CVNLRE');</script></head>
<body><header class="main-header"><div class="logo"><a href="/" style="color:inherit;text-decoration:none"><img src="https://animaplays.github.io/img/logo/logo-header.png" alt="Anima Play" width="150" height="150" style="display:block;max-height:150px;width:auto;height:auto"/></a></div></header>
<div class="post-layout"><div class="post-main"><a href="/" class="back-link">&#8592; Voltar</a>
<div class="post-hero"><img src="${esc(heroImg || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=1200&auto=format&fit=crop')}" alt="${esc(d.title)}"><div class="post-hero-overlay"><h1>${esc(d.title)}</h1><div class="post-meta">${(d.genres || []).map(g => '<span>' + esc(g) + '</span>').join('')}${d.author ? '<span>Por @' + esc(d.author) + '</span>' : ''}<span id="viewCount"></span></div></div></div>
<main class="post-body">${d.synopsis ? '<p class="post-synopsis">' + esc(d.synopsis) + '</p>' : ''}<div class="section-label">Assistir</div><div class="video-player" id="vp">${videoPlayerHTML(d.defaultVideo)}</div><div class="server-tabs" id="svTabs"></div><div class="ep-nav"><button onclick="location.href='/'">&#8592; Início</button><button id="btnPrev" onclick="prevEp()">&#8592; Anterior</button><span id="epLabel"></span><button id="btnNext" class="primary" onclick="nextEp()">Próximo &#8594;</button></div><div class="section-label">Episódios</div><div class="episode-list">
${eps}
</div><div class="ap-inline-ad" id="apInlineAd"></div><div class="section-label">Comentários</div><div id="disqus_thread"></div><script>var disqus_config=function(){this.page.url='https://animaplays.github.io/posts/${esc(d.slug)}.html';this.page.identifier='${esc(d.slug)}';};(function(){var b=document,s=b.createElement('script');s.src='https://anima-play.disqus.com/embed.js';s.setAttribute('data-timestamp',+new Date());(b.head||b.body).appendChild(s);})();<\/script><noscript>Ative o JavaScript para ver os comentários.</noscript></main></div><aside class="post-side" id="postSide"></aside></div>
<footer class="main-footer"><p>&copy; 2026 Anima Play</p></footer>
<script>function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}var EPISODES=${epJson};var EP_SERVERS=${epServersJson};var EP_TITLES=${epTitles};var cur=0;var srv=0;var apPrerollIV=null;function isDirect(s){return /\\.(mp4|webm)(\\?|#|$)/i.test(s||'');}function isArch(u){return /archive\\.org\\/download\\//i.test(u||'');}function archEmb(u){var m=(u||'').match(/archive\\.org\\/download\\/([^\\/?#]+)/i);return m&&m[1]?('https://archive.org/embed/'+m[1]):u;}var AP_AD_HTML="<scr"+"ipt>atOptions = {'key' : '06c518660615af32f3c9e04aef5689b2','format' : 'iframe','height' : 250,'width' : 300,'params' : {}};</scr"+"ipt><scr"+"ipt src='https://www.highrevenueformat.com/06c518660615af32f3c9e04aef5689b2/invoke.js'></scr"+"ipt><scr"+"ipt>atOptions = {'key' : '34b1f76f3987ebbc70b3e36a829a3da8','format' : 'iframe','height' : 90,'width' : 728,'params' : {}};</scr"+"ipt><scr"+"ipt src='https://www.highrevenueformat.com/34b1f76f3987ebbc70b3e36a829a3da8/invoke.js'></scr"+"ipt>";function injectAds(c,h){if(!c||!h)return;var t=document.createElement('div');t.innerHTML=h;var ss=[],ks=t.childNodes;for(var i=0;i<ks.length;i++){var k=ks[i];if(k.nodeType===1&&k.tagName.toLowerCase()==='script')ss.push(k);else c.appendChild(k);}for(var j=0;j<ss.length;j++){var s=document.createElement('script');var sa=ss[j].getAttribute('src');if(sa)s.src=sa;else s.text=ss[j].textContent||'';s.async=false;c.appendChild(s);}}function runPreroll(box,v,onClose){function _fin(){if(onClose){var _f=onClose;onClose=null;try{_f();}catch(e){}}}if(!box||!AP_AD_HTML){_fin();return;}var slot=box.querySelector('[data-apad]');if(!slot){_fin();return;}var mobile=(window.innerWidth||document.documentElement.clientWidth||0)<768;slot.style.display='block';if(mobile){slot.style.position='fixed';slot.style.top='0';slot.style.left='0';slot.style.width='100%';slot.style.height='100%';slot.style.zIndex='9999';slot.style.borderRadius='0';}slot.innerHTML='<div style="position:absolute;top:12px;right:12px;z-index:7;display:flex;gap:8px;align-items:center"><span id="apTimer" style="font-size:14px;color:#fff;background:rgba(0,0,0,.7);padding:6px 12px;border-radius:6px">5</span><button id="apSkip" style="display:none;background:#fff;color:#000;border:none;padding:12px 22px;border-radius:8px;cursor:pointer;font-weight:700;font-size:15px">Pular an&#250;ncio</button></div><div id="apWait" style="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;z-index:6;font-size:14px;color:#fff;background:rgba(0,0,0,.5)">Carregando an&#250;ncio...</div><div id="apAdBox" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;height:100%"></div>';var ab=slot.querySelector('#apAdBox');injectAds(ab,AP_AD_HTML);try{if(v)v.pause();}catch(e){}var t=5,Started=false,Waited=0;var ti=slot.querySelector('#apTimer');var sk=slot.querySelector('#apSkip');var wl=slot.querySelector('#apWait');function cd(){clearInterval(iv);apPrerollIV=null;slot.style.display='none';slot.innerHTML='';_fin();}var iv=setInterval(function(){if(!Started){Waited++;if(slot.querySelector('iframe')||Waited>=3){Started=true;if(wl)wl.style.display='none';}return;}t--;if(ti)ti.textContent=String(t);if(Started&&sk)sk.style.display='inline-block';if(t<=0)cd();},1000);apPrerollIV=iv;if(sk)sk.addEventListener('click',cd);}function stopPlayer(){if(apPrerollIV){clearInterval(apPrerollIV);apPrerollIV=null;}var b=document.getElementById('vp');if(!b)return;var vs=b.querySelectorAll('video');for(var i=0;i<vs.length;i++){try{vs[i].pause();}catch(e){}}}function paint(src){var box=document.getElementById('vp');stopPlayer();if(!src){box.innerHTML='<div style="padding:40px;text-align:center;color:#666;">Nenhum vídeo</div>';return;}if(isDirect(src)){box.innerHTML='<div data-apad style=\"position:absolute;top:0;left:0;width:100%;height:100%;z-index:6;background:#0a0a0a;display:none\"></div><video controls preload=\"none\" style=\"position:absolute;top:0;left:0;width:100%;height:100%;background:#000;\" src=\"'+esc(src)+'\" onerror=\"vErr(this)\"></video>';runPreroll(box,box.querySelector('video'));}else{var im=isArch(src)?archEmb(src):src;box.innerHTML='<div data-apad style=\"position:absolute;top:0;left:0;width:100%;height:100%;z-index:6;background:#0a0a0a;display:none\"></div>';runPreroll(box,null,function(){box.innerHTML='<iframe src=\"'+esc(im)+'\" style=\"position:absolute;top:0;left:0;width:100%;height:100%;border:none;\" allowfullscreen allow=\"accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen\"></iframe>';});}}function vErr(v){var box=document.getElementById('vp');if(!box)return;var u=(v&&v.getAttribute&&v.getAttribute('src'))||curSrc();if(isArch(u)){box.innerHTML='<iframe src="'+esc(archEmb(u))+'" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"></iframe>';return;}var list=(EP_SERVERS&&EP_SERVERS[cur])||[];if(srv<list.length-1){setSrv(srv+1);}else{box.innerHTML='<div style="padding:40px;text-align:center;color:#666;">Falha ao carregar o vídeo. Tente outro servidor ou episódio.</div>';}}function curSrc(){var list=(EP_SERVERS&&EP_SERVERS[cur])||[];return (list[srv]&&list[srv].url)||EPISODES[cur]||'';}function renderServers(){var box=document.getElementById('svTabs');if(!box)return;var list=((EP_SERVERS&&EP_SERVERS[cur])||[{url:EPISODES[cur]}]).filter(function(x){return x&&x.url;});if(list.length<2){box.innerHTML='';return;}box.innerHTML=list.map(function(x,j){return '<button type="button" class="'+(j===srv?'active':'')+'" onclick="setSrv('+j+')">'+esc(x.name||('Servidor '+(j+1)))+'</button>';}).join('');}function setSrv(j){var sy=window.pageYOffset||document.documentElement.scrollTop||0;srv=j;paint(curSrc());renderServers();try{window.scrollTo(0,sy);}catch(e){}}function syncUI(){var items=document.querySelectorAll('.episode-item');items.forEach(function(el,i){el.classList.toggle('active',i===cur);});var label=document.getElementById('epLabel');if(label){label.textContent=(EP_TITLES[cur]||('Episódio '+(cur+1)))+' &#8226; '+(cur+1)+' / '+EPISODES.length;}var pv=document.getElementById('btnPrev');var nx=document.getElementById('btnNext');if(pv){pv.disabled=cur<=0;}if(nx){nx.disabled=cur>=EPISODES.length-1;}renderServers();try{var u=new URL(window.location.href);u.searchParams.set('ep',String(cur+1));window.history.replaceState(null,'',u);}catch(e){}}function renderEp(i){if(i<0||i>=EPISODES.length||!EPISODES[i])return;cur=i;srv=0;paint(curSrc());syncUI();var vp=document.getElementById('vp');if(vp&&vp.scrollIntoView){vp.scrollIntoView({behavior:'smooth',block:'center'});}}function goEp(i){renderEp(i);}function nextEp(){if(cur<EPISODES.length-1){renderEp(cur+1);}}function prevEp(){if(cur>0){renderEp(cur-1);}}try{var u=new URL(window.location.href);var epParam=parseInt(u.searchParams.get('ep')||'1',10);if(epParam>=1&&epParam<=EPISODES.length)renderEp(epParam-1);else renderEp(0);}catch(e){renderEp(0);}(function(){var el=document.getElementById('apInlineAd');if(!el)return;var m=(window.innerWidth||document.documentElement.clientWidth||0)<768;var k=m?'06c518660615af32f3c9e04aef5689b2':'34b1f76f3987ebbc70b3e36a829a3da8';var w=m?300:728;var h=m?250:90;injectAds(el,'<scr'+'ipt>atOptions = {\'key\' : \''+k+'\',\'format\' : \'iframe\',\'height\' : '+h+',\'width\' : '+w+',\'params\' : {}};</scr'+'ipt><scr'+'ipt src=\'https://www.highrevenueformat.com/'+k+'/invoke.js\'></scr'+'ipt>');})();</script>
<script src="../post-layout.js?v=11"></script>
<script src="../update-check.js?v=5"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js"></script>
<script src="../firebase-config.js?v=1"></script>
<script>if(typeof firebase!=='undefined'&&firebase.initializeApp)firebase.initializeApp(firebaseConfig);</script>
<script src="../views.js?v=3"></script>
<script>if(typeof ViewCounter!=='undefined'){ViewCounter.increment('${esc(d.slug)}').then(function(v){var el=document.getElementById('viewCount');if(el)el.textContent=v+' visualizações';});}</script>
<script src="https://pl31351577.profitableratecpmnetwork.com/46/04/6d/46046d022371bbd4585223cb2b632439.js"></script>
</body></html>`;
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
