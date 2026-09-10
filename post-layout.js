/* Anima Play — sidebar compartilhada das páginas de postagem.
   Injetada em posts/*.html via <script src="../post-layout.js">.
   Mudanças aqui valem para todas as postagens sem precisar republicar. */
(function () {
  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function normImg(u) {
    if (!u) return '';
    var s = String(u).trim();
    if (s.indexOf('http') === 0 || s.indexOf('data:') === 0) return s;
    if (s.indexOf('../') === 0) return '/' + s.slice(3);
    if (s.charAt(0) !== '/') return '/' + s;
    return s;
  }

  var box = document.getElementById('postSide');
  if (!box) return;

  var css = 'body{overflow-x:hidden}'
    + '.post-layout{display:grid;grid-template-columns:1fr 260px;gap:24px;max-width:1200px;margin:0 auto;padding:20px 40px 40px}'
    + '.post-main{min-width:0}'
    + '.post-body{max-width:none;margin:0;padding:0}'
    + '.post-side{position:sticky;top:210px;align-self:start;display:flex;flex-direction:column;gap:16px}'
    + '.side-section{background:rgba(20,20,20,.8);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:16px}'
    + '.side-title{font-size:12px;font-weight:800;color:#e5e5e5;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px}'
    + '.side-link{display:block;color:#fff;text-decoration:none;background:#e50914;border-radius:8px;padding:10px 14px;font-size:13px;font-weight:700;text-align:center}'
    + '.side-link:hover{background:#f0151f}'
    + '.side-chips{display:flex;flex-wrap:wrap;gap:6px}'
    + '.side-chips a{background:rgba(255,255,255,.07);color:#ccc;text-decoration:none;font-size:12px;padding:6px 12px;border-radius:20px}'
    + '.side-chips a:hover{background:#e50914;color:#fff}'
    + '.side-post{display:flex;gap:8px;align-items:center;text-decoration:none;color:#fff;margin-bottom:8px}'
    + '.side-post img{width:44px;height:62px;object-fit:cover;border-radius:6px;background:#1a1a1a;flex-shrink:0}'
    + '.side-post span{font-size:11px;font-weight:600;line-height:1.3}'
    + '.post-link{display:flex;align-items:center;gap:8px;padding:8px 12px;margin-bottom:4px;background:rgba(255,255,255,.05);border:1px solid transparent;border-radius:8px;color:#e5e5e5;text-decoration:none;font-size:13px;font-weight:600}'
    + '.post-link span{color:#e50914;font-weight:800}'
    + '.post-link:hover{border-color:#e50914;background:rgba(229,9,20,.15);color:#fff}';
    + '@media(max-width:900px){.post-layout{grid-template-columns:1fr}.post-side{position:fixed;top:0;right:-320px;width:280px;height:100vh;z-index:200;background:#0a0a0a;border-left:1px solid #1a1a1a;transition:right .3s ease,visibility .3s;visibility:hidden;padding:20px;max-height:none;overflow-y:auto}.post-side.open{right:0;visibility:visible}.post-menu-btn{display:flex}.post-overlay{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:199}.post-overlay.visible{display:block}}'
    + '@media(max-width:768px){.post-hero{height:240px !important}.post-hero-overlay{padding:30px 20px 16px !important}.post-hero-overlay h1{font-size:24px !important}}';
    + '.post-menu-btn{display:none;position:fixed;bottom:20px;right:20px;z-index:150;align-items:center;gap:8px;background:#e50914;border:none;border-radius:24px;color:#fff;font-size:14px;font-weight:700;padding:12px 20px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.5)}'
    + '.post-overlay{display:none}';
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  var slug = (location.pathname.split('/').pop() || '').split('?')[0].replace(/\.html$/, '');
  function meta(n) {
    var m = document.querySelector('meta[name="' + n + '"]');
    return m ? (m.getAttribute('content') || '') : '';
  }
  var genres = meta('anima-genres').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  var chips = genres.map(function (g) {
    return '<a href="/?genre=' + encodeURIComponent(g) + '#catalogo">' + esc(g) + '</a>';
  }).join('');

  box.innerHTML =
    '<div class="side-section"><div class="side-title">Navegação</div><a class="side-link" href="/">← Início</a></div>'
    + '<div class="side-section"><div class="side-title">Animes</div><div id="sideAnimes"><p style="font-size:12px;color:#666;">Carregando...</p></div></div>'
    + '<div class="side-section"><div class="side-title">Gêneros</div><div class="side-chips">'
    + (chips || '<p style="font-size:12px;color:#666;">—</p>') + '</div></div>'
    + '<div class="side-section"><div class="side-title">Recomendado para você</div><div id="sideRec"><p style="font-size:12px;color:#666;">Carregando...</p></div></div>';

  var overlay = document.createElement('div');
  overlay.className = 'post-overlay';
  overlay.id = 'postOverlay';
  overlay.onclick = toggleMenu;
  document.body.appendChild(overlay);

  var menuBtn = document.createElement('button');
  menuBtn.className = 'post-menu-btn';
  menuBtn.id = 'postMenuBtn';
  menuBtn.textContent = '☰ Menu';
  menuBtn.onclick = toggleMenu;
  document.body.appendChild(menuBtn);

  function toggleMenu() {
    box.classList.toggle('open');
    overlay.classList.toggle('visible');
  }

  box.addEventListener('click', function (e) {
    if (e.target.closest('a')) {
      box.classList.remove('open');
      overlay.classList.remove('visible');
    }
  });

  function miniCard(p) {
    return '<a class="side-post" href="' + p.slug + '.html"><img src="' + esc(normImg(p.image))
      + '" alt="" loading="lazy"><span>' + esc(p.title || p.slug) + '</span></a>';
  }

  fetch('../posts.json', { cache: 'no-store' }).then(function (r) {
    if (!r.ok) throw 0;
    return r.json();
  }).then(function (list) {
    list = Array.isArray(list) ? list : [];
    var others = list.filter(function (p) { return p.slug !== slug; });
    var gl = genres.map(function (g) { return g.toLowerCase(); });
    var scored = others.map(function (p) {
      var pg = (p.genres || []).map(function (g) { return String(g).toLowerCase(); });
      var score = pg.filter(function (g) { return gl.indexOf(g) >= 0; }).length;
      return { p: p, score: score };
    });
    scored.sort(function (a, b) {
      return (b.score - a.score) || String(b.p.updatedAt || b.p.createdAt || '')
        .localeCompare(String(a.p.updatedAt || a.p.createdAt || ''));
    });
    var rec = scored.slice(0, 4).map(function (x) { return x.p; });
    var boxA = document.getElementById('sideAnimes');
    if (boxA) {
      var ordered = list.slice().sort(function (a, b) {
        return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
      });
      boxA.innerHTML = ordered.length ? ordered.map(function (p) {
        var cur = p.slug === slug ? ' style="border-color:#e50914;"' : '';
        return '<a class="post-link" href="' + p.slug + '.html"' + cur + '><span>›</span> ' + esc(p.title || p.slug) + '</a>';
      }).join('') : '<p style="font-size:12px;color:#666;">Em breve.</p>';
    }
    var boxR = document.getElementById('sideRec');
    if (boxR) boxR.innerHTML = rec.length
      ? rec.map(miniCard).join('')
      : '<p style="font-size:12px;color:#666;">Em breve.</p>';
  }).catch(function () {
    var a = document.getElementById('sideRec');
    if (a) a.innerHTML = '<p style="font-size:12px;color:#666;">Em breve.</p>';
  });

  /* Atualização automática (igual ao update-check.js): recarrega sozinho
     com a aba oculta e nenhum vídeo tocando. Sem botão. */
  (function () {
    function seen() { try { return localStorage.getItem('animaplay_seen_commit'); } catch (e) { return null; } }
    function store(v) { try { localStorage.setItem('animaplay_seen_commit', v); } catch (e) {} }
    function mediaPlaying() {
      try {
        var vs = document.querySelectorAll('video');
        for (var i = 0; i < vs.length; i++) { if (!vs[i].paused && !vs[i].ended) return true; }
      } catch (e) {}
      return false;
    }
    function hidden() {
      try { return document.visibilityState === 'hidden'; } catch (e) { return false; }
    }
    function check() {
      fetch('https://api.github.com/repos/animaplays/animaplays.github.io/commits?per_page=1').then(function (r) {
        if (!r.ok) throw 0;
        return r.json();
      }).then(function (list) {
        var sha = (list && list[0] && list[0].sha) || '';
        if (!sha) return;
        var s = seen();
        if (!s) { store(sha); return; }
        if (s === sha) return;
        if (hidden() && !mediaPlaying()) {
          store(sha);
          location.reload();
        }
      }).catch(function () {});
    }
    setTimeout(check, 8000);
    setInterval(check, 60000);
    document.addEventListener('visibilitychange', function () { if (hidden()) check(); });
  })();
})();
