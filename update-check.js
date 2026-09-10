/* Anima Play — avisa quando há versão nova publicada.
   Compara o último commit do repositório com o último visto neste navegador.
   Se mudou, mostra um botão "Atualizar" em vez de exigir limpar cache. */
(function () {
  var KEY = 'animaplay_seen_commit';
  function toast() {
    if (document.getElementById('ap-update-toast')) return;
    var t = document.createElement('div');
    t.id = 'ap-update-toast';
    t.setAttribute('style', 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:9999;background:#15191d;border:1px solid #e50914;border-radius:12px;padding:12px 16px;color:#fff;font-size:13px;display:flex;gap:12px;align-items:center;box-shadow:0 8px 30px rgba(0,0,0,.6);font-family:sans-serif;max-width:92vw;');
    var s = document.createElement('span');
    s.textContent = 'Nova versão do blog disponível.';
    var b = document.createElement('button');
    b.textContent = 'Atualizar';
    b.setAttribute('style', 'background:#e50914;border:none;border-radius:8px;color:#fff;font-weight:700;font-size:13px;padding:8px 16px;cursor:pointer;');
    b.onclick = function () { location.reload(); };
    t.appendChild(s);
    t.appendChild(b);
    document.body.appendChild(t);
  }
  try {
    fetch('https://api.github.com/repos/animaplays/animaplays.github.io/commits?per_page=1').then(function (r) {
      if (!r.ok) throw 0;
      return r.json();
    }).then(function (list) {
      var sha = (list && list[0] && list[0].sha) || '';
      if (!sha) return;
      var seen = null;
      try { seen = localStorage.getItem(KEY); } catch (e) {}
      if (seen && seen !== sha) toast();
      try { localStorage.setItem(KEY, sha); } catch (e) {}
    }).catch(function () {});
  } catch (e) {}
})();
