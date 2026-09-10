/* Anima Play — sidebar compartilhada das páginas de postagem.
   Injetada em posts/*.html via <script src="../post-layout.js">.
   Mudanças aqui valem para todas as postagens sem precisar republicar.
   CSS responsivo está em style.css — não injetar CSS aqui. */
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

  /* Atualização automática */
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
