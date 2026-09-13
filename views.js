/* Anima Play — contagem de views via Firebase Realtime Database.
   Requer: firebase-config.js + Firebase SDK (compat) carregados antes.
   - Contagem por post (pageviews → visitante único por dispositivo/24h via localStorage).
   - Contagem global do site (incrementSite) — 1 incremento por dispositivo a cada 24h. */
var ViewCounter = (function () {
  var db;
  var cache = {};
  var UNIQUE_PREFIX = 'animaplay_uv_';
  var DAILY = 24 * 60 * 60 * 1000;

  function getDb() {
    if (!db && typeof firebase !== 'undefined' && firebase.database) {
      db = firebase.database();
    }
    return db;
  }

  function ref(slug) {
    return getDb().ref('animaplays/views/' + slug);
  }

  function getViews(slug) {
    if (cache[slug] !== undefined) return Promise.resolve(cache[slug]);
    return ref(slug).once('value')
      .then(function (snap) {
        cache[slug] = snap.val() || 0;
        return cache[slug];
      })
      .catch(function () { return 0; });
  }

  /* Registra esta visita como "única" para esta chave se a última foi há >= ttlMs.
     Retorna true caso deva contar (primeira vez ou expirado). */
  function isUniqueVisit(key, ttlMs) {
    ttlMs = ttlMs || DAILY;
    try {
      var now = Date.now();
      var last = parseInt(localStorage.getItem(UNIQUE_PREFIX + key) || '0', 10);
      if (now - last < ttlMs) return false;
      localStorage.setItem(UNIQUE_PREFIX + key, String(now));
      return true;
    } catch (e) {
      return true;
    }
  }

  function increment(slug) {
    if (!isUniqueVisit('post_' + slug)) {
      return getViews(slug);
    }
    return ref(slug).transaction(function (current) {
      return (current || 0) + 1;
    })
      .then(function (result) {
        cache[slug] = result.snapshot.val() || 0;
        return cache[slug];
      })
      .catch(function () { return 0; });
  }

  function incrementSite() {
    if (!isUniqueVisit('site')) {
      return getSiteViews();
    }
    return ref('_site').transaction(function (current) {
      return (current || 0) + 1;
    })
      .then(function (result) {
        cache['_site'] = result.snapshot.val() || 0;
        return cache['_site'];
      })
      .catch(function () { return getSiteViews(); });
  }

  function getSiteViews() {
    return getViews('_site');
  }

  function getMultiple(slugs) {
    var uncached = slugs.filter(function (s) { return cache[s] === undefined; });
    if (!uncached.length) {
      var result = {};
      slugs.forEach(function (s) { result[s] = cache[s] || 0; });
      return Promise.resolve(result);
    }
    return Promise.all(uncached.map(function (s) {
      return ref(s).once('value')
        .then(function (snap) { cache[s] = snap.val() || 0; })
        .catch(function () { cache[s] = 0; });
    })).then(function () {
      var result = {};
      slugs.forEach(function (s) { result[s] = cache[s] || 0; });
      return result;
    });
  }

  function getAllViews() {
    return getDb().ref('animaplays/views').once('value')
      .then(function (snap) {
        var v = snap.val() || {};
        Object.keys(v).forEach(function (k) { cache[k] = v[k] || 0; });
        return v;
      })
      .catch(function () { return {}; });
  }

  return {
    getViews: getViews,
    increment: increment,
    incrementSite: incrementSite,
    getSiteViews: getSiteViews,
    getMultiple: getMultiple,
    getAllViews: getAllViews
  };
})();