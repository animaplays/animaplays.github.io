/* Anima Play — contagem de views via countapi.mileshilliard.com (gratuito, sem auth). */
var ViewCounter = (function () {
  var BASE = 'https://countapi.mileshilliard.com/api/v1';
  var NAMESPACE = 'animaplays';
  var cache = {};

  function key(slug) { return NAMESPACE + '-' + slug; }

  function getViews(slug) {
    if (cache[slug] !== undefined) return Promise.resolve(cache[slug]);
    return fetch(BASE + '/get/' + key(slug))
      .then(function (r) { return r.json(); })
      .then(function (d) { cache[slug] = d.value || 0; return cache[slug]; })
      .catch(function () { return 0; });
  }

  function increment(slug) {
    return fetch(BASE + '/hit/' + key(slug))
      .then(function (r) { return r.json(); })
      .then(function (d) { cache[slug] = d.value || 0; return cache[slug]; })
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
      return fetch(BASE + '/get/' + key(s))
        .then(function (r) { return r.json(); })
        .then(function (d) { cache[s] = d.value || 0; })
        .catch(function () { cache[s] = 0; });
    })).then(function () {
      var result = {};
      slugs.forEach(function (s) { result[s] = cache[s] || 0; });
      return result;
    });
  }

  return { getViews: getViews, increment: increment, getMultiple: getMultiple };
})();
