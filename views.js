/* Anima Play — contagem de views via Firebase Realtime Database.
   Requer: firebase-config.js + Firebase SDK (compat) carregados antes. */
var ViewCounter = (function () {
  var db;
  var cache = {};
  var listeners = {};

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

  function increment(slug) {
    return ref(slug).transaction(function (current) {
      return (current || 0) + 1;
    })
      .then(function (result) {
        cache[slug] = result.snapshot.val() || 0;
        return cache[slug];
      })
      .catch(function () { return 0; });
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

  return { getViews: getViews, increment: increment, getMultiple: getMultiple };
})();
