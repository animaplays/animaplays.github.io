/* Anima Play — atualização totalmente automática, sem botão e sem limpar cache.
   A cada 60s compara o último commit publicado com o último visto neste navegador.
   Se mudou, recarrega sozinho SOMENTE com a aba oculta e nenhum vídeo tocando.
   Nunca recarrega o editor (/admin) para não perder postagem em edição. */
(function () {
  if (location.pathname.indexOf('/admin/') !== -1) return;
  var SEEN = 'animaplay_seen_commit';
  function seen() { try { return localStorage.getItem(SEEN); } catch (e) { return null; } }
  function store(v) { try { localStorage.setItem(SEEN, v); } catch (e) {} }
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
