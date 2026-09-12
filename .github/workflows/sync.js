const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DB_URL = process.env.FIREBASE_DB_URL;
const SA_RAW = process.env.FIREBASE_SA;

console.log('DB_URL set:', !!DB_URL);
console.log('SA set:', !!SA_RAW);

if (!DB_URL || !SA_RAW) {
  console.log('FIREBASE_DB_URL or FIREBASE_SA not set, skipping.');
  process.exit(0);
}

let sa;
try {
  sa = JSON.parse(SA_RAW);
  console.log('SA parsed OK, email:', sa.client_email);
} catch (e) {
  console.error('Failed to parse FIREBASE_SA:', e.message);
  process.exit(1);
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claim = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  })).toString('base64url');

  const crypto = require('crypto');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(header + '.' + claim);
  const jwt = (header + '.' + claim + '.' + sign.sign(sa.private_key, 'base64url'));

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + jwt
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to get access token: ' + JSON.stringify(data));
  return data.access_token;
}

async function dbGet(token, path) {
  const res = await fetch(DB_URL + path + '.json?access_token=' + token);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('DB GET failed: ' + res.status);
  return await res.json();
}

async function dbSet(token, path, value) {
  const res = await fetch(DB_URL + path + '.json?access_token=' + token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value)
  });
  if (!res.ok) throw new Error('DB SET failed: ' + res.status);
}

async function dbRemove(token, path) {
  const res = await fetch(DB_URL + path + '.json?access_token=' + token, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('DB DELETE failed: ' + res.status);
}

function buildHTML(d) {
  const normalizeVideo = (input) => {
    if (!input) return '';
    const extractSrc = (s) => { if (!s) return ''; const m = String(s).match(/src=["']([^"']+)["']/i); return m ? m[1] : String(s).trim(); };
    const ytId = (url) => { if (!url) return ''; const s = extractSrc(url); const m = s.match(/youtube\.com\/embed\/([^?&#]+)/) || s.match(/[?&]v=([^&#]+)/) || s.match(/youtu\.be\/([^?&#]+)/); return m ? m[1] : ''; };
    const id = ytId(input);
    if (id) return 'https://www.youtube.com/embed/' + id;
    let raw = extractSrc(input);
    const enc = (s) => s.split('/').map(p => { try { return encodeURIComponent(decodeURIComponent(p)); } catch (e) { return encodeURIComponent(p); } }).join('/');
    let m = raw.match(/archive\.org\/details\/([^/?#]+)\/(.+)/i);
    if (m) return 'https://archive.org/download/' + m[1] + '/' + enc(m[2].replace(/\+/g, ' '));
    m = raw.match(/archive\.org\/details\/([^/?#]+)/i);
    if (m) return 'https://archive.org/embed/' + m[1];
    if (/archive\.org\/download\//i.test(raw)) {
      const dm = raw.match(/(archive\.org\/download\/[^?#]+\/)(.+?)(\?|#|$)(.*)/i);
      if (dm) return raw.slice(0, raw.indexOf(dm[1]) + dm[1].length) + enc(dm[2].replace(/\+/g, ' ')) + (dm[3] || '') + (dm[4] || '');
      return raw.replace(/\+/g, '%20');
    }
    return raw;
  };
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const videoPlayerHTML = (url) => {
    const src = normalizeVideo(url);
    if (!src) return '<div style="padding:40px;text-align:center;color:#666;">Nenhum vídeo informado</div>';
    if (/\.(mp4|webm)(\?|#|$)/i.test(src)) return '<video controls preload="none" style="position:absolute;top:0;left:0;width:100%;height:100%;background:#000;" src="' + esc(src) + '"></video>';
    return '<iframe src="' + esc(src) + '" title="Vídeo" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen" loading="lazy" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;"></iframe>';
  };
  const thumbHTML = (video, idx) => {
    const id = (function(url){if(!url)return'';var s=extractSrc(url);var m=s.match(/youtube\.com\/embed\/([^?&#]+)/)||s.match(/[?&]v=([^&#]+)/)||s.match(/youtu\.be\/([^?&#]+)/);return m?m[1]:'';})(video);
    if (id) return '<img src="https://img.youtube.com/vi/' + id + '/mqdefault.jpg" class="episode-thumb" alt="EP' + idx + '">';
    return '<div class="episode-thumb" style="background:#1a1a1a;display:flex;align-items:center;justify-content:center;font-size:10px;color:#888;">EP' + String(idx).padStart(2, '0') + '</div>';
  };
  const extractSrc = (s) => { if (!s) return ''; const m = String(s).match(/src=["']([^"']+)["']/i); return m ? m[1] : String(s).trim(); };
  const ytId = (url) => { if (!url) return ''; const s = extractSrc(url); const m = s.match(/youtube\.com\/embed\/([^?&#]+)/) || s.match(/[?&]v=([^&#]+)/) || s.match(/youtu\.be\/([^?&#]+)/); return m ? m[1] : ''; };

  const srcs = (d.episodes || []).map(ep => normalizeVideo(ep.video || d.defaultVideo));
  const eps = (d.episodes || []).map((ep, i) => {
    const isNew = i === 0;
    return '<a href="?ep=' + (i + 1) + '" data-idx="' + i + '" class="episode-item' + (isNew ? ' active' : '') + '" onclick="goEp(' + i + ');return false;">' +
      thumbHTML(ep.video || d.defaultVideo, i + 1) +
      '<div class="episode-info"><div class="ep-title">' + esc(ep.title || 'Episódio ' + (i + 1)) + '</div><div class="ep-meta">Toque para assistir</div></div>' +
      (isNew ? '<span class="episode-badge">NOVO</span>' : '') +
      '<button class="btn-play">▶</button></a>';
  }).join('\n');
  const epJson = JSON.stringify(srcs);
  const epTitles = JSON.stringify((d.episodes || []).map((ep, i) => ep.title || ('Episódio ' + (i + 1))));
  const cardImg = d.cardImage || d.image || '';
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(d.title)} — Anima Play</title>
<meta name="description" content="${esc((d.synopsis || '').slice(0, 160) || d.title + ' - Assista online no Anima Play.')}">
<meta property="og:title" content="${esc(d.title)} — Anima Play">
<meta property="og:description" content="${esc((d.synopsis || '').slice(0, 160) || d.title + ' - Assista online no Anima Play.')}">
<meta property="og:type" content="video.other">
<meta property="og:url" content="https://animaplays.github.io/posts/${esc(d.slug)}.html">
${cardImg ? '<meta property="og:image" content="https://animaplays.github.io/' + esc(cardImg.replace(/^\.\.\//, '')) + '">' : ''}
<meta name="anima-title" content="${esc(d.title)}">
<meta name="anima-card" content="${esc(cardImg)}">
<meta name="anima-subtitle" content="${esc((d.episodes && d.episodes[0] && d.episodes[0].title) || 'Nova Postagem')}">
<meta name="anima-genres" content="${esc((d.genres || []).join(','))}">
<meta name="anima-author" content="${esc(d.author || '')}">
<style>*{margin:0;padding:0;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}body{background:#0a0a0a;color:#fff;min-height:100vh;overflow-x:hidden}.main-header{display:flex;align-items:center;padding:20px 40px;background:linear-gradient(180deg,rgba(10,10,10,1) 0%,rgba(10,10,10,0) 100%)}.logo{font-size:42px;font-weight:800;color:#e50914;text-transform:uppercase}.main-footer{text-align:center;padding:40px;color:#555;font-size:12px;border-top:1px solid #1a1a1a}.back-link{display:inline-block;color:#e50914;text-decoration:none;font-size:14px;margin-bottom:20px;padding:0 40px}.post-hero{position:relative;width:100%;height:400px;overflow:hidden}.post-hero img{width:100%;height:100%;object-fit:cover}.post-hero-overlay{position:absolute;bottom:0;left:0;right:0;padding:50px 40px 25px;background:linear-gradient(transparent,#0a0a0a)}.post-hero-overlay h1{font-size:32px;font-weight:800}.post-meta{display:flex;gap:10px;flex-wrap:wrap}.post-meta span{background:rgba(255,255,255,0.15);padding:3px 10px;border-radius:12px;font-size:12px;color:#ccc}.post-body{max-width:900px;margin:0 auto;padding:20px 40px 40px}.post-synopsis{color:#aaa;font-size:14px;line-height:1.7;margin-bottom:30px}.section-label{font-size:13px;color:#e50914;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;font-weight:700}.video-player{position:relative;width:100%;padding-top:56.25%;background:#1a1a1a;border-radius:12px;overflow:hidden;margin-bottom:12px}.ep-nav{display:flex;gap:10px;align-items:center;margin-bottom:24px;flex-wrap:wrap}.ep-nav button{background:#15191d;color:#fff;border:1px solid #2a2a2a;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer}.ep-nav button:hover:not(:disabled){border-color:#e50914;color:#e50914}.ep-nav button:disabled{opacity:.35;cursor:not-allowed}.ep-nav button.primary{background:#e50914;border-color:#e50914}.ep-nav button.primary:hover:not(:disabled){background:#f0151f;color:#fff}#epLabel{color:#aaa;font-size:13px}.episode-list{display:flex;flex-direction:column;gap:8px;margin-bottom:30px}.episode-item{display:flex;align-items:center;gap:14px;padding:10px 14px;background:#111;border:1px solid #1a1a1a;border-radius:10px;cursor:pointer;text-decoration:none;color:#fff;transition:border-color .2s}.episode-item:hover{border-color:#e50914}.episode-item.active{border-color:#e50914;background:#1a0a0a}.episode-thumb{width:72px;height:48px;border-radius:6px;object-fit:cover;flex-shrink:0}.episode-info{flex:1;min-width:0}.ep-title{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ep-meta{font-size:11px;color:#666;margin-top:2px}.episode-badge{background:#e50914;color:#fff;font-size:9px;padding:2px 6px;border-radius:4px;font-weight:700;margin-left:8px;flex-shrink:0}.btn-play{background:none;border:1px solid #333;color:#aaa;border-radius:50%;width:32px;height:32px;font-size:12px;cursor:pointer;flex-shrink:0}.episode-item:hover .btn-play{border-color:#e50914;color:#e50914}.post-layout{display:flex;gap:0;max-width:1400px;margin:0 auto}.post-main{flex:1;min-width:0}.post-side{width:300px;flex-shrink:0;border-left:1px solid #1a1a1a;padding:20px;display:none}@media(min-width:1024px){.post-side{display:block}}</style></head>
<body><header class="main-header"><div class="logo"><a href="/" style="color:inherit;text-decoration:none">Anima Play</a></div></header>
<div class="post-layout"><div class="post-main"><a href="/" class="back-link">← Voltar</a>
<div class="post-hero"><img src="${esc(d.image || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=1200&auto=format&fit=crop')}" alt="${esc(d.title)}"><div class="post-hero-overlay"><h1>${esc(d.title)}</h1><div class="post-meta">${(d.genres || []).map(g => '<span>' + esc(g) + '</span>').join('')}${d.author ? '<span>Por @' + esc(d.author) + '</span>' : ''}<span id="viewCount"></span></div></div></div>
<main class="post-body">${d.synopsis ? '<p class="post-synopsis">' + esc(d.synopsis) + '</p>' : ''}<div class="section-label">Assistir</div><div class="video-player" id="vp">${videoPlayerHTML(d.defaultVideo)}</div><div class="ep-nav"><button onclick="location.href='/'">← Início</button><button id="btnPrev" onclick="prevEp()">← Anterior</button><span id="epLabel"></span><button id="btnNext" class="primary" onclick="nextEp()">Próximo →</button></div><div class="section-label">Episódios</div><div class="episode-list">
${eps}
</div><div class="section-label">Comentários</div><div id="disqus_thread"></div><script>var disqus_config=function(){this.page.url='https://animaplays.github.io/posts/${esc(d.slug)}.html';this.page.identifier='${esc(d.slug)}';};(function(){var b=document,s=b.createElement('script');s.src='https://anima-play.disqus.com/embed.js';s.setAttribute('data-timestamp',+new Date());(b.head||b.body).appendChild(s);})();<\/script><noscript>Ative o JavaScript para ver os comentários.</noscript></main></div><aside class="post-side" id="postSide"></aside></div>
<footer class="main-footer"><p>&copy; 2026 Anima Play</p></footer>
<script>function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}var EPISODES=${epJson};var EP_TITLES=${epTitles};var cur=0;function isDirect(s){return /\\.(mp4|webm)(\\?|#|$)/i.test(s||'');}function paint(src){var box=document.getElementById('vp');if(!src){box.innerHTML='<div style="padding:40px;text-align:center;color:#666;">Nenhum vídeo</div>';return;}if(isDirect(src)){box.innerHTML='<video controls autoplay style="position:absolute;top:0;left:0;width:100%;height:100%;background:#000;" src="'+esc(src)+'"></video>';}else{box.innerHTML='<iframe src="'+esc(src)+'" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"></iframe>';}}function syncUI(){var items=document.querySelectorAll('.episode-item');items.forEach(function(el,i){el.classList.toggle('active',i===cur);});var label=document.getElementById('epLabel');if(label){label.textContent=(EP_TITLES[cur]||('Episódio '+(cur+1)))+' • '+(cur+1)+' / '+EPISODES.length;}var pv=document.getElementById('btnPrev');var nx=document.getElementById('btnNext');if(pv){pv.disabled=cur<=0;}if(nx){nx.disabled=cur>=EPISODES.length-1;}try{var u=new URL(window.location.href);u.searchParams.set('ep',String(cur+1));window.history.replaceState(null,'',u);}catch(e){}}function renderEp(i){if(i<0||i>=EPISODES.length||!EPISODES[i])return;cur=i;paint(EPISODES[i]);syncUI();var vp=document.getElementById('vp');if(vp&&vp.scrollIntoView){vp.scrollIntoView({behavior:'smooth',block:'center'});}}function goEp(i){renderEp(i);}function nextEp(){if(cur<EPISODES.length-1){renderEp(cur+1);}}function prevEp(){if(cur>0){renderEp(cur-1);}}try{var u=new URL(window.location.href);var epParam=parseInt(u.searchParams.get('ep')||'1',10);if(epParam>=1&&epParam<=EPISODES.length)renderEp(epParam-1);else renderEp(0);}catch(e){renderEp(0);}</script>
<script src="../post-layout.js?v=5"></script>
<script src="../update-check.js?v=5"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js"></script>
<script src="../firebase-config.js?v=1"></script>
<script>if(typeof firebase!=='undefined'&&firebase.initializeApp)firebase.initializeApp(firebaseConfig);</script>
<script src="../views.js?v=2"></script>
<script>if(typeof ViewCounter!=='undefined'){ViewCounter.increment('${esc(d.slug)}').then(function(v){var el=document.getElementById('viewCount');if(el)el.textContent=v+' visualizações';});}</script>
</body></html>`;
}

function git(cmd) {
  execSync('git ' + cmd, { stdio: 'pipe', cwd: path.resolve(__dirname, '../..') });
}

async function main() {
  console.log('Step 1: Authenticating with Firebase...');
  let token;
  try {
    token = await getAccessToken();
    console.log('Token obtained OK, length:', token.length);
  } catch (e) {
    console.error('AUTH FAILED:', e.message);
    return;
  }

  console.log('Step 2: Reading posts from Firebase...');
  let posts;
  try {
    posts = await dbGet(token, '/animaplays/posts');
    console.log('Posts found:', posts ? Object.keys(posts).length : 0);
  } catch (e) {
    console.error('DB READ FAILED:', e.message);
    return;
  }
  if (!posts) { console.log('No posts found.'); return; }

  const pending = Object.values(posts).filter(p => p.status === 'pending');
  if (!pending.length) { console.log('No pending posts.'); return; }

  console.log(`Found ${pending.length} pending post(s).`);

  // Ensure directories exist
  const postsDir = path.resolve(__dirname, '../../posts');
  if (!fs.existsSync(postsDir)) fs.mkdirSync(postsDir, { recursive: true });

  for (const post of pending) {
    console.log(`Generating HTML for: ${post.slug} (${(post.episodes||[]).length} episodes)`);
    const html = buildHTML(post);
    fs.writeFileSync(path.join(postsDir, post.slug + '.html'), html, 'utf-8');

    // Mark as published in Firebase
    await dbSet(token, `/animaplays/posts/${post.slug}/status`, 'published');
    console.log(`  Published: ${post.slug}`);
  }

  // Update posts.json
  const postsJsonPath = path.resolve(__dirname, '../../posts.json');
  let list = [];
  if (fs.existsSync(postsJsonPath)) {
    try { list = JSON.parse(fs.readFileSync(postsJsonPath, 'utf-8')); } catch { list = []; }
  }

  for (const post of pending) {
    const cardImg = post.cardImage || post.image || '';
    const episodeUrls = (post.episodes || []).map(e => e.video).filter(Boolean);
    console.log(`  posts.json: ${post.slug} -> ${episodeUrls.length} episode URLs`);
    const entry = {
      slug: post.slug,
      title: post.title,
      image: cardImg,
      subtitle: (post.episodes && post.episodes[0] && post.episodes[0].title) || 'Nova Postagem',
      genres: post.genres || [],
      author: post.author || '',
      episodes: episodeUrls,
      createdAt: post.createdAt || new Date().toISOString(),
      updatedAt: post.updatedAt || new Date().toISOString()
    };
    const idx = list.findIndex(p => p.slug === post.slug);
    if (idx >= 0) { entry.createdAt = list[idx].createdAt || entry.createdAt; list[idx] = entry; }
    else list.push(entry);
  }

  list.sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
  fs.writeFileSync(postsJsonPath, JSON.stringify(list, null, 2), 'utf-8');

  // Git commit and push
  console.log('Committing changes...');
  git('add -A');
  try {
    const diff = git('diff --cached --stat');
    console.log('Changes:', diff.toString().trim() || 'none');
    git('diff --cached --quiet');
    console.log('No changes to commit.');
  } catch (e) {
    console.log('Changes detected, committing...');
    git('commit -m "Auto-sync: publish pending posts from Firebase"');
    git('push origin main');
    console.log('Pushed to GitHub.');
  }

  console.log('Done!');
}

main().catch(e => { console.error('FATAL ERROR:', e.message); console.error(e.stack); process.exit(1); });
