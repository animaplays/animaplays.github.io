/* Anima Play — sidebar compartilhada das páginas de postagem.
   Injetada em posts/*.html via <script src="../post-layout.js">.
   Mudanças aqui valem para todas as postagens sem precisar republicar. */
(function () {
  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function normImg(u) {
    if (!u) return '';
    var s = String(u).trim();
    if (s.indexOf('../') === 0) return s.slice(3);
    return s;
  }

  var box = document.getElementById('postSide');
  if (!box) return;

  var css = '.post-side{position:sticky;top:90px;align-self:start;display:flex;flex-direction:column;gap:16px}'
    + '.side-section{background:rgba(20,20,20,.8);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:16px}'
    + '.side-title{font-size:12px;font-weight:800;color:#e5e5e5;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px}'
    + '.side-link{display:block;color:#fff;text-decoration:none;background:#e50914;border-radius:8px;padding:10px 14px;font-size:13px;font-weight:700;text-align:center}'
    + '.side-link:hover{background:#f0151f}'
    + '.side-chips{display:flex;flex-wrap:wrap;gap:6px}'
    + '.side-chips a{background:rgba(255,255,255,.07);color:#ccc;text-decoration:none;font-size:12px;padding:6px 12px;border-radius:20px}'
    + '.side-chips a:hover{background:#e50914;color:#fff}'
    + '.side-post{display:flex;gap:10px;align-items:center;text-decoration:none;color:#fff;margin-bottom:10px}'
    + '.side-post img{width:64px;height:90px;object-fit:cover;border-radius:6px;background:#1a1a1a;flex-shrink:0}'
    + '.side-post span{font-size:12px;font-weight:600;line-height:1.3}'
    + '@media(max-width:900px){.post-side{position:static}}';
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
    return '<a href="/?genre=' + encodeURIComponent(g) + '">' + esc(g) + '</a>';
  }).join('');

  box.innerHTML =
    '<div class="side-section"><div class="side-title">Navegação</div><a class="side-link" href="/">← Início</a></div>'
    + '<div class="side-section"><div class="side-title">Gêneros</div><div class="side-chips">'
    + (chips || '<p style="font-size:12px;color:#666;">—</p>') + '</div></div>'
    + '<div class="side-section"><div class="side-title">Recomendado para você</div><div id="sideRec"><p style="font-size:12px;color:#666;">Carregando...</p></div></div>'
    + '<div class="side-section"><div class="side-title">Ver também</div><div id="sidePosts"><p style="font-size:12px;color:#666;">Carregando...</p></div></div>';

  function miniCard(p) {
    return '<a class="side-post" href="' + p.slug + '.html"><img src="' + esc(normImg(p.image))
      + '" alt="" loading="lazy"><span>' + esc(p.title || p.slug) + '</span></a>';
  }

  fetch('../posts.json').then(function (r) {
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
    var boxR = document.getElementById('sideRec');
    if (boxR) boxR.innerHTML = rec.length
      ? rec.map(miniCard).join('')
      : '<p style="font-size:12px;color:#666;">Em breve.</p>';
    var boxP = document.getElementById('sidePosts');
    if (boxP) boxP.innerHTML = others.slice(0, 6).length
      ? others.slice(0, 6).map(miniCard).join('')
      : '<p style="font-size:12px;color:#666;">Nenhuma outra postagem.</p>';
  }).catch(function () {
    var a = document.getElementById('sideRec');
    if (a) a.innerHTML = '<p style="font-size:12px;color:#666;">Em breve.</p>';
    var b = document.getElementById('sidePosts');
    if (b) b.innerHTML = '<p style="font-size:12px;color:#666;">Em breve.</p>';
  });
})();
