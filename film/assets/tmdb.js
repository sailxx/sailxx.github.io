/* Тонкий клиент TMDB. Ключ не хранится в коде: либо его вводит пользователь (localStorage),
   либо запросы идут через собственный прокси (FILM_CONFIG.tmdbProxy), который добавляет ключ на сервере. */
(function () {
  const BASE = "https://api.themoviedb.org/3";
  const IMG = "https://image.tmdb.org/t/p/";
  const KEY = "film:tmdbKey";
  const H = 3600e3;

  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* квота или приватный режим */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };

  const proxy = () => (window.FILM_CONFIG.tmdbProxy || "").replace(/\/$/, "");
  const key = () => (ls.get(KEY) || "").trim();
  const enabled = () => !!(proxy() || key());

  function cacheGet(k, ttl) {
    const raw = ls.get("film:c:" + k);
    if (!raw) return null;
    try {
      const o = JSON.parse(raw);
      return Date.now() - o.t < ttl ? o.d : null;
    } catch { return null; }
  }
  function cacheSet(k, d) { ls.set("film:c:" + k, JSON.stringify({ t: Date.now(), d })); }

  async function get(path, params = {}) {
    const url = new URL((proxy() || BASE) + (proxy() ? "/3" : "") + path);
    const headers = {};
    if (!proxy()) {
      const k = key();
      if (/^eyJ/.test(k) || k.length > 40) headers.Authorization = "Bearer " + k;
      else url.searchParams.set("api_key", k);
    }
    for (const [a, b] of Object.entries(params)) if (b != null) url.searchParams.set(a, b);
    let res;
    try { res = await fetch(url, { headers }); }
    catch (e) { const err = new Error("network"); err.status = 0; throw err; }
    if (!res.ok) { const err = new Error("http " + res.status); err.status = res.status; throw err; }
    return res.json();
  }

  const year = (d) => (d ? +String(d).slice(0, 4) : null);
  const pick = (r) => ({
    tmdbId: r.id,
    poster: r.poster_path || null,
    rating: r.vote_count > 0 ? r.vote_average : null,
    votes: r.vote_count || 0,
    pop: r.popularity || 0,
    overview: r.overview || "",
    title: r.title || "",
    original: r.original_title || "",
    year: year(r.release_date),
    genreIds: r.genre_ids || [],
  });

  /** Находит фильм каталога в TMDB по названию и году (id в коде не зашиты, чтобы не ошибиться). */
  async function resolve(film) {
    const ck = "r:" + film.id;
    const hit = cacheGet(ck, 7 * 24 * H);
    if (hit) return hit.none ? null : hit;
    const data = await get("/search/movie", { query: film.tmdbQuery || film.en, language: "ru-RU", include_adult: "false" });
    const list = data.results || [];
    const exact = list.find((r) => year(r.release_date) === film.year);
    const near = list.find((r) => Math.abs((year(r.release_date) || 0) - film.year) <= 1);
    const r = exact || near;
    const out = r ? pick(r) : { none: true };
    cacheSet(ck, out);
    return r ? out : null;
  }
  const peekResolve = (film) => { const h = cacheGet("r:" + film.id, 7 * 24 * H); return h && !h.none ? h : null; };

  async function details(tmdbId) {
    const ck = "d:" + tmdbId;
    const hit = cacheGet(ck, 3 * 24 * H);
    if (hit) return hit;
    const d = await get("/movie/" + tmdbId, { language: "ru-RU", append_to_response: "credits" });
    const out = {
      overview: d.overview || "",
      tagline: d.tagline || "",
      runtime: d.runtime || null,
      title: d.title || "",
      original: d.original_title || "",
      year: year(d.release_date),
      genres: (d.genres || []).map((g) => g.name),
      countries: (d.production_countries || []).map((c) => c.name),
      director: ((d.credits && d.credits.crew) || []).filter((c) => c.job === "Director").map((c) => c.name),
      rating: d.vote_count > 0 ? d.vote_average : null,
      votes: d.vote_count || 0,
      poster: d.poster_path || null,
    };
    cacheSet(ck, out);
    return out;
  }

  async function providers(tmdbId) {
    const ck = "p:" + tmdbId;
    const hit = cacheGet(ck, 12 * H);
    if (hit) return hit;
    const d = await get("/movie/" + tmdbId + "/watch/providers");
    const res = d.results || {};
    const out = {};
    for (const [region, v] of Object.entries(res)) {
      out[region] = {
        link: v.link || null,
        flatrate: (v.flatrate || []).map((p) => p.provider_name),
        free: [...(v.free || []), ...(v.ads || [])].map((p) => p.provider_name),
        rent: (v.rent || []).map((p) => p.provider_name),
        buy: (v.buy || []).map((p) => p.provider_name),
      };
    }
    cacheSet(ck, out);
    return out;
  }
  const peekProviders = (tmdbId) => cacheGet("p:" + tmdbId, 12 * H);

  async function genres() {
    const hit = cacheGet("g", 30 * 24 * H);
    if (hit) return hit;
    const d = await get("/genre/movie/list", { language: "ru" });
    const m = {};
    (d.genres || []).forEach((g) => (m[g.id] = g.name));
    cacheSet("g", m);
    return m;
  }

  async function searchMovies(q) {
    const d = await get("/search/movie", { query: q, language: "ru-RU", include_adult: "false" });
    return (d.results || []).map(pick);
  }

  async function ping() { await get("/configuration"); }

  window.Tmdb = {
    enabled, key, setKey: (k) => ls.set(KEY, k), clearKey: () => ls.del(KEY),
    resolve, peekResolve, details, providers, peekProviders, genres, searchMovies, ping,
    img: (path, size) => IMG + size + path,
  };
})();
