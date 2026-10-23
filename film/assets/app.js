(() => {
  const CFG = window.FILM_CONFIG;
  const FILMS = window.FILMS;
  const PAGE = 12;
  const VIBE_N = 6;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  };

  /* ---------- бренд: одно место — config.js ---------- */
  $$("[data-brand]").forEach((el) => (el.textContent = CFG.projectName));
  const T = window.T;
  const LANG = () => window.I18N.lang;
  const numLocale = () => (LANG() === "en" ? "en-US" : "ru-RU");
  const setTitle = () => { document.title = CFG.projectName + " — " + T("библиотека фильмов и подбор по вайбу"); };
  setTitle();

  /* Локализованное представление фильма каталога (данные хранятся по-русски, английская версия — в data.en.js). */
  function lf(f) {
    if (LANG() !== "en" || !window.FILMS_EN || !window.FILMS_EN[f.id]) return f;
    const e = window.FILMS_EN[f.id];
    return { ...f, ru: e.title, desc: e.desc, why: e.why, who: e.who, vibes: e.vibes, dir: e.dir,
      genres: f.genres.map((g) => window.GENRES_EN[g] || g), countries: f.countries.map((c) => window.COUNTRIES_EN[c] || c) };
  }

  /* ---------- тема ---------- */
  const root = document.documentElement;
  const mq = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
  let themeTimer = 0;
  function applyTheme(t, save) {
    root.dataset.theme = t;
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = t === "dark" ? "#0a0a0a" : "#fafaf8";
    const b = $(".theme-btn");
    if (b) { const l = t === "dark" ? T("Включить светлую тему") : T("Включить тёмную тему"); b.setAttribute("aria-label", l); b.title = l; }
    if (save) { try { localStorage.setItem("film:theme", t); } catch { /* ignore */ } }
  }
  applyTheme(root.dataset.theme || "light", false);
  if (mq) mq.addEventListener("change", (e) => { let saved = null; try { saved = localStorage.getItem("film:theme"); } catch { /* ignore */ } if (!saved) applyTheme(e.matches ? "dark" : "light", false); });

  /* ---------- движение ---------- */
  const REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FINE = window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches;
  const ANIM = !REDUCED;
  if (ANIM) root.classList.add("js-anim");
  let quiet = false; // фоновые перерисовки (оценки, избранное) не должны проигрывать анимацию заново

  const io = ANIM && "IntersectionObserver" in window
    ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("seen"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -6% 0px", threshold: 0.05 })
    : null;
  /** Карточки появляются по очереди, постер «раскрывается шторкой». skip — сколько первых карточек не анимировать. */
  function reveal(rootEl, animate = true, skip = 0) {
    $$(".card", rootEl).forEach((c, i) => {
      if (!io || !animate || i < skip) { c.classList.add("seen"); return; }
      c.style.setProperty("--i", (i - skip) % 6);
      io.observe(c);
    });
  }
  /** Заголовок по словам: каждое слово выезжает из-под маски. */
  function splitWords(el, instant, hl) {
    if (!el || el.dataset.split) return;
    el.dataset.split = "1";
    const text = el.textContent.trim();
    el.setAttribute("aria-label", text);
    el.classList.add("split");
    const words = text.split(/\s+/);
    el.innerHTML = words.map((w, i) => `<span class="w${hl && i === words.length - 1 ? " hl" : ""}" aria-hidden="true"><span style="--i:${i}">${esc(w)}</span></span>`).join(" ");
    if (!ANIM || instant) { el.classList.add("in", "instant"); return; }
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("in")));
  }
  const revealOnScroll = ANIM && "IntersectionObserver" in window
    ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); revealOnScroll.unobserve(e.target); } }), { threshold: 0.15 })
    : null;
  function watchBlock(el) { if (revealOnScroll) revealOnScroll.observe(el); else el.classList.add("in"); }

  /* ---------- состояние ---------- */
  const guessRegion = () => {
    const m = (navigator.language || "").match(/-([A-Za-z]{2})$/);
    return m ? m[1].toUpperCase() : CFG.defaultRegion;
  };
  const S = {
    fav: new Set(store.get("film:fav", [])),
    later: new Set(store.get("film:later", [])),
    ext: store.get("film:ext", {}),
    enrich: {},
    posters: {}, // assets/posters.json (OMDb): id -> { imdb, poster, rating, votes } — работает без ключа в браузере
    f: { q: "", genre: "", period: "", country: "", rating: "", sort: "default", cat: "" },
    shown: PAGE,
    view: "home",
    tab: "fav",
    vibe: null,
    region: store.get("film:region", guessRegion()),
    tmdb: window.Tmdb.enabled(),
    progress: null,
    error: "",
  };

  const byId = (id) => FILMS.find((f) => f.id === id) || S.ext[id] || null;
  /* Источники постеров: живой TMDB (с ключом) -> assets/posters.json (OMDb, без ключа) -> постер внешнего фильма TMDB. */
  function posterSrc(f) {
    const T = window.Tmdb;
    const tm = (S.enrich[f.id] && S.enrich[f.id].poster) || f.poster;
    if (tm) return { src: T.img(tm, "w342"), srcset: `${T.img(tm, "w185")} 185w, ${T.img(tm, "w342")} 342w, ${T.img(tm, "w500")} 500w` };
    const sp = S.posters[f.id];
    return sp && sp.poster ? { src: sp.poster, srcset: "" } : null;
  }
  const rating = (f) => {
    const e = S.enrich[f.id];
    if (e && e.rating != null) return { v: e.rating, n: e.votes, src: "TMDB" };
    const sp = S.posters[f.id];
    if (sp && sp.rating != null) return { v: sp.rating, n: sp.votes, src: "IMDb" };
    return f.rating != null ? { v: f.rating, n: f.votes, src: "TMDB" } : null;
  };
  const hasRatings = () => S.tmdb || Object.values(S.posters).some((x) => x.rating != null);

  if (S.tmdb) for (const f of FILMS) { const h = window.Tmdb.peekResolve(f); if (h) S.enrich[f.id] = h; }

  const saveLists = () => { store.set("film:fav", [...S.fav]); store.set("film:later", [...S.later]); store.set("film:ext", extForSaved()); };
  function extForSaved() {
    const keep = {};
    for (const id of [...S.fav, ...S.later]) if (S.ext[id]) keep[id] = S.ext[id];
    return keep;
  }

  /* ---------- карточка ---------- */
  function posterHTML(f, sizes) {
    const p = posterSrc(f);
    if (p) {
      return `<img class="poster-img" src="${esc(p.src)}"${p.srcset ? ` srcset="${p.srcset}" sizes="${sizes}"` : ""} width="342" height="513" loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="${T("Постер")}: ${esc(f.ru)}">`;
    }
    return `<span class="ph" aria-hidden="true"><span class="ph-t">${esc(f.ru)}</span><span class="ph-y">${f.year || ""}</span></span>`;
  }
  function ratingHTML(f) {
    const r = rating(f);
    return r
      ? `<span class="rt" title="${esc(T("Источник: {src}, оценок: {n}", { src: r.src, n: (r.n || 0).toLocaleString(numLocale()) }))}">★ ${r.v.toFixed(1)}</span> <span class="src">${r.src}</span>`
      : `<span class="mute">${T("рейтинг не найден")}</span>`;
  }
  function availLine(f) {
    const e = S.enrich[f.id];
    if (!e || !S.tmdb) return "";
    const p = window.Tmdb.peekProviders(e.tmdbId);
    const r = p && p[S.region];
    if (!r) return "";
    const names = r.flatrate.length ? [T("Подписка"), r.flatrate] : r.free.length ? [T("Бесплатно"), r.free] : null;
    return names ? `<p class="avail">${names[0]}: ${esc(names[1].slice(0, 2).join(", "))}</p>` : "";
  }
  function castLine(f, opt) {
    if (opt.noCast || !S.f.q.trim()) return "";
    const m = matchedActors(f);
    return m.length ? `<p class="cast">${T("В ролях")}: ${m.slice(0, 3).map((a) => esc(personName(a))).join(", ")}</p>` : "";
  }
  function card(f, opt = {}) {
    f = lf(f);
    const fav = S.fav.has(f.id), later = S.later.has(f.id);
    let reason = "";
    if (opt.hits) {
      const tags = opt.hits.length
        ? opt.hits.slice(0, 3).map((h) => `<b class="${h.w >= 3 ? "strong" : ""}">${esc(h.label)}</b>`).join(" · ")
        : T("общая атмосфера");
      reason = `<div class="reason"><p class="reason-k">${T("Совпало")}: ${tags}</p><p>${esc(f.why)}</p></div>`;
    }
    return `<article class="card" data-id="${esc(f.id)}">
      <div class="poster-wrap">
        <a class="poster" href="#/film/${esc(f.id)}" aria-label="${esc(T("{title} — подробнее", { title: f.ru }))}">${posterHTML(f, "(min-width:1100px) 17vw, (min-width:720px) 28vw, 46vw")}</a>
        <div class="quick">
          <button type="button" class="qbtn" data-act="fav" data-id="${esc(f.id)}" aria-pressed="${fav}" aria-label="${fav ? T("Убрать из избранного") : T("В избранное")}: ${esc(f.ru)}" title="${fav ? T("Убрать из избранного") : T("В избранное")}">${fav ? "♥" : "♡"}</button>
          <button type="button" class="qbtn" data-act="later" data-id="${esc(f.id)}" aria-pressed="${later}" aria-label="${later ? T("Убрать из «Посмотреть позже»") : T("Посмотреть позже")}: ${esc(f.ru)}" title="${later ? T("Убрать из «Посмотреть позже»") : T("Посмотреть позже")}">${later ? "✓" : "+"}</button>
        </div>
      </div>
      <h3 class="card-title"><a href="#/film/${esc(f.id)}">${esc(f.ru)}</a></h3>
      <p class="meta">${f.year || T("год не найден")} · ${ratingHTML(f)}</p>
      ${castLine(f, opt)}<p class="desc">${esc(f.desc) || '<span class="mute">${T("Описание не найдено")}</span>'}</p>
      ${availLine(f)}${reason}
    </article>`;
  }
  const emptyDesc = (t) => `<p class="empty">${t}</p>`;

  /* ---------- фильтры ---------- */
  const PERIODS = () => [
    ["", T("Любой период")], ["old", T("до 1970")], ["70-80", "1970–1989"], ["90", "1990–1999"], ["00", "2000–2009"], ["10", T("2010 и позже")],
  ];
  const inPeriod = (y, p) => !p || (p === "old" ? y < 1970 : p === "70-80" ? y >= 1970 && y < 1990 : p === "90" ? y >= 1990 && y < 2000 : p === "00" ? y >= 2000 && y < 2010 : y >= 2010);
  const CATS = () => [["cult", T("Культовые")], ["underrated", T("Недооценённые")], ["evening", T("На вечер")], ["phil", T("Философские")], ["scifi", T("Научная фантастика")]];

  function fillSelects() {
    const en = LANG() === "en";
    const tr = (map, x) => (en && map[x]) || x;
    const genres = [...new Set(FILMS.flatMap((f) => f.genres))].sort((a, b) => tr(window.GENRES_EN, a).localeCompare(tr(window.GENRES_EN, b), numLocale()));
    const countries = [...new Set(FILMS.flatMap((f) => f.countries))].sort((a, b) => tr(window.COUNTRIES_EN, a).localeCompare(tr(window.COUNTRIES_EN, b), numLocale()));
    const opts = (arr, all, map) => `<option value="">${all}</option>` + arr.map((x) => `<option value="${esc(x)}">${esc(tr(map, x))}</option>`).join("");
    const keep = { genre: S.f.genre, country: S.f.country, period: S.f.period, rating: S.f.rating };
    $("#f-genre").innerHTML = opts(genres, T("Все жанры"), window.GENRES_EN);
    $("#f-country").innerHTML = opts(countries, T("Все страны"), window.COUNTRIES_EN);
    $("#f-period").innerHTML = PERIODS().map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
    $("#f-rating").innerHTML = `<option value="">${T("Любой")}</option>` + [6, 7, 8].map((n) => `<option value="${n}">${T("от {n}", { n })}</option>`).join("");
    $("#f-genre").value = keep.genre; $("#f-country").value = keep.country; $("#f-period").value = keep.period; $("#f-rating").value = keep.rating;
    $("#cats").innerHTML = `<li><button type="button" data-cat="" aria-pressed="${S.f.cat === ""}">${T("Все")}</button></li>` +
      CATS().map(([k, l]) => `<li><button type="button" data-cat="${k}" aria-pressed="${S.f.cat === k}">${l}</button></li>`).join("");
  }

  function applyTmdbUI() {
    const on = S.tmdb;
    const rated = hasRatings();
    $("#f-rating").disabled = !rated;
    $("#f-rating").title = rated ? "" : T("Рейтинг появится, когда в каталог загружены оценки");
    $('#f-sort option[value="pop"]').disabled = !on;
    $('#f-sort option[value="rating"]').disabled = !rated;
    if (!on && S.f.sort === "pop") { S.f.sort = "default"; $("#f-sort").value = "default"; }
    if (!rated) { S.f.rating = ""; if (S.f.sort === "rating") { S.f.sort = "default"; $("#f-sort").value = "default"; } }

    const note = $("#demo-note");
    if (S.error) note.innerHTML = `${esc(S.error)} <button class="link" type="button" data-act="open-settings">${T("Источник данных")}</button>`;
    else if (!on) note.innerHTML = `${Object.keys(S.posters).length ? T("Постеры и рейтинги: OMDb (IMDb).") : T("Постеры и рейтинги не загружены.")} ${T("Сервисы просмотра появятся после подключения TMDB.")} <button class="link" type="button" data-act="open-settings">${T("Подключить")}</button>`;
    else if (S.progress) note.textContent = T("Загружаем данные TMDB… {a} из {b}", { a: S.progress[0], b: S.progress[1] });
    else note.textContent = "";
    note.hidden = !note.textContent && !note.innerHTML;

    $("#foot-status").textContent = on ? T("Данные: OMDb (постеры, рейтинги IMDb), TMDB (описания, доступность просмотра).") : T("Данные: OMDb (постеры, рейтинги IMDb). Доступность просмотра появится после подключения TMDB.");
  }

  /* Поиск: нормализация убирает различия э/е, й/и, ё/е, удвоенные буквы и диакритику (Керри = Кэрри = Carrey). */
  const nrm = (t) => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/э/g, "е").replace(/[ъь]/g, "").replace(/(.)\1/g, "$1").replace(/[^a-zа-я0-9]+/g, " ").trim();
  const actorsOf = (m) => (S.posters[m.id] && S.posters[m.id].actors) || [];
  const ruName = (a) => (window.PEOPLE_RU && window.PEOPLE_RU[a]) || a;
  const personName = (a) => (LANG() === "ru" ? ruName(a) : a);
  const hayCache = new Map();
  function haystack(m) {
    const key = m.id + ":" + actorsOf(m).length;
    if (!hayCache.has(key)) {
      const en = (window.FILMS_EN && window.FILMS_EN[m.id]) || {};
      hayCache.set(key, nrm([m.ru, m.en, m.dir, en.title, en.dir, ...actorsOf(m), ...actorsOf(m).map(ruName)].join(" ")));
    }
    return hayCache.get(key);
  }
  const queryTokens = () => nrm(S.f.q).split(" ").filter(Boolean);
  const matchedActors = (m) => {
    const t = queryTokens();
    if (!t.length) return [];
    return actorsOf(m).filter((a) => { const h = " " + nrm(a + " " + ruName(a)); return t.some((x) => h.includes(" " + x)); });
  };

  function filtered() {
    const f = S.f;
    const tokens = queryTokens();
    let list = FILMS.filter((m) => {
      if (tokens.length) { const h = " " + haystack(m); if (!tokens.every((t) => h.includes(" " + t))) return false; }
      if (f.genre && !m.genres.includes(f.genre)) return false;
      if (f.country && !m.countries.includes(f.country)) return false;
      if (!inPeriod(m.year, f.period)) return false;
      if (f.cat && !m.cat.includes(f.cat)) return false;
      if (f.rating) { const r = rating(m); if (!r || r.v < +f.rating) return false; }
      return true;
    });
    const idx = (m) => FILMS.indexOf(m);
    const sorts = {
      default: (a, b) => idx(a) - idx(b),
      pop: (a, b) => ((S.enrich[b.id] || {}).pop || -1) - ((S.enrich[a.id] || {}).pop || -1),
      rating: (a, b) => ((rating(b) || { v: -1 }).v) - ((rating(a) || { v: -1 }).v),
      "year-desc": (a, b) => b.year - a.year,
      "year-asc": (a, b) => a.year - b.year,
    };
    return list.sort(sorts[f.sort]);
  }

  function renderLibrary(skip = 0) {
    const list = filtered();
    const grid = $("#grid");
    $("#count-line").textContent = list.length ? T("Фильмов: {n}", { n: list.length }) : "";
    if (!list.length) {
      grid.innerHTML = emptyDesc(T("Ничего не найдено. Измени запрос или сбрось фильтры.")) + `<p class="empty-act"><button class="btn btn-ghost" type="button" data-act="reset">${T("Сбросить фильтры")}</button></p>`;
    } else {
      grid.innerHTML = list.slice(0, S.shown).map((f) => card(f)).join("");
    }
    reveal(grid, !quiet, skip);
    $("#more").hidden = list.length <= S.shown;
    $("#more").textContent = T("Показать ещё ({n})", { n: Math.max(0, Math.min(PAGE, list.length - S.shown)) });
  }

  /* ---------- избранное ---------- */
  function updateCounts() {
    const n = S.fav.size + S.later.size;
    const c = $("#nav-count");
    c.hidden = !n; c.textContent = n;
    $("#n-fav").textContent = S.fav.size;
    $("#n-later").textContent = S.later.size;
  }
  function renderFav() {
    const ids = [...(S.tab === "fav" ? S.fav : S.later)];
    const list = ids.map(byId).filter(Boolean);
    $$("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === S.tab)));
    $("#fav-grid").innerHTML = list.length
      ? list.map((f) => card(f)).join("")
      : `<div class="empty big"><p class="empty-h">${S.tab === "fav" ? T("Здесь пока пусто") : T("Список пуст")}</p><p>${S.tab === "fav" ? T("Нажми ♡ на любой карточке, чтобы сохранить фильм.") : T("Нажми + на карточке — фильм ждёт тебя на потом.")}</p><p><a class="btn btn-ghost" href="#/library">${T("Открыть библиотеку")}</a></p></div>`;
    reveal($("#fav-grid"), !quiet);
  }

  function toggle(kind, id) {
    const set = kind === "fav" ? S.fav : S.later;
    set.has(id) ? set.delete(id) : set.add(id);
    saveLists();
    quiet = true;
    refreshAll();
    quiet = false;
    $$(`[data-act="${kind}"][data-id="${id}"]`).forEach((b) => { if (b.getAttribute("aria-pressed") === "true") b.classList.add("pop"); });
    const d = $("#film-dialog");
    if (d.open && d.dataset.id === id) syncFilmButtons(id);
  }

  /* ---------- вайб ---------- */
  function runVibe(q, keepOffset) {
    q = q.trim();
    if (!q) { $("#vibe-input").focus(); return; }
    const r = window.Vibe.search(q, FILMS);
    S.vibe = { q, r, offset: keepOffset ? S.vibe.offset : 0 };
    renderVibe();
    const box = $("#vibe-results");
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function renderVibe() {
    const box = $("#vibe-results");
    if (!S.vibe) { box.innerHTML = ""; return; }
    const { q, r, offset } = S.vibe;
    const pool = r.results;
    const set = [];
    for (let i = 0; i < Math.min(VIBE_N, pool.length); i++) set.push(pool[(offset + i) % pool.length]);
    const recognized = r.concepts.length
      ? T("Распознано: {list}.", { list: r.concepts.map((c) => esc(c.label)).join(", ") })
      : T("Знакомых настроений в запросе не найдено.");
    box.innerHTML = `<div class="vibe-head">
        <p class="eyebrow">${T("Подборка по запросу «{q}»", { q: esc(q.length > 80 ? q.slice(0, 80) + "…" : q) })}</p>
        <h2>${esc(r.title)}</h2>
        <p class="lead dark">${esc(r.description)}</p>
        <p class="logic">${recognized} ${T("Подбор — локальный: запрос сопоставляется с жанрами, темами, тоном и местом действия каждого фильма каталога. Это не нейросеть.")}</p>
      </div>
      <div class="grid vibe-grid">${set.map((x) => card(x.film, { hits: x.hits, noCast: true })).join("")}</div>
      <div class="vibe-actions">
        <button class="btn btn-ghost" type="button" data-act="edit-vibe">${T("Изменить запрос")}</button>
        ${pool.length > VIBE_N ? `<button class="btn" type="button" data-act="more-vibe">${T("Другая подборка")}</button>` : ""}
      </div>`;
    splitWords($("h2", box), quiet);
    reveal(box, !quiet);
  }

  /* ---------- модальное окно фильма ---------- */
  const regionName = (c) => { try { return new Intl.DisplayNames([LANG()], { type: "region" }).of(c) || c; } catch { return c; } };
  const REGIONS = ["RU", "UA", "BY", "KZ", "GE", "AM", "US", "CA", "GB", "DE", "FR", "ES", "IT", "PL", "TR", "IL", "AU", "JP", "BR", "MX"];

  let modalPushed = false;
  function openFilm(id) {
    const raw = byId(id);
    const d = $("#film-dialog");
    if (!raw) { closeFilm(true); return; }
    const f = lf(raw);
    d.dataset.id = id;
    const e = S.enrich[id];
    const similar = FILMS.includes(raw) ? window.Vibe.similar(raw, FILMS, 6).map(lf) : [];
    d.innerHTML = `<div class="film">
      <button class="close" type="button" data-act="close-film" aria-label="${T("Закрыть")}">×</button>
      <div class="film-poster"><div class="poster-static">${posterHTML(f, "(min-width:720px) 320px, 70vw")}</div></div>
      <div class="film-body">
        <p class="eyebrow" id="fm-year">${f.year || T("Год не найден")}</p>
        <h2 id="film-title">${esc(f.ru)}</h2>
        <p class="orig" id="fm-orig">${f.en && f.en !== f.ru ? esc(f.en) : ""}</p>
        <p class="facts" id="fm-facts">${[f.dir ? T("Режиссёр") + ": " + esc(f.dir) : T("Режиссёр: не найден"), f.runtime ? T("{n} мин", { n: f.runtime }) : T("Длительность: не найдена")].join(" · ")}</p>
        <p class="facts" id="fm-genres">${(f.genres || []).map(esc).join(" · ")}${f.countries && f.countries.length ? " · " + f.countries.map(esc).join(", ") : ""}</p>
        ${actorsOf(f).length ? `<p class="facts">${T("В ролях")}: ${actorsOf(f).map((a) => esc(personName(a))).join(", ")}</p>` : ""}
        <p class="rate" id="fm-rate"></p>
        <div class="actions" id="fm-actions"></div>

        <h3>${T("Описание")}</h3>
        <p id="fm-desc">${esc(f.desc) || T("Описание не найдено.")}</p>

        ${f.why ? `<h3>${T("Почему стоит посмотреть")}</h3><p>${esc(f.why)}</p>` : ""}
        ${f.vibes ? `<h3>${T("Вайб фильма")}</h3><ul class="tags tags-dark">${f.vibes.map((t) => `<li><button type="button" data-vibe="${esc(t)}">${esc(t)}</button></li>`).join("")}</ul>` : ""}
        ${f.who ? `<h3>${T("Кому понравится")}</h3><p>${esc(f.who)}</p>` : ""}

        <h3>${T("Где посмотреть")}</h3>
        <div class="watch" id="fm-watch"></div>

        ${similar.length ? `<h3>${T("Похожие фильмы")}</h3><ul class="similar">${similar.map((s) => `<li><a href="#/film/${esc(s.id)}" data-similar>${`<span class="sim-p">${posterHTML(s, "120px")}</span>`}<span class="sim-t">${esc(s.ru)}</span><span class="sim-y">${s.year}</span></a></li>`).join("")}</ul>` : ""}
      </div>
    </div>`;
    syncFilmButtons(id);
    renderRate(raw);
    if (!d.open) d.showModal();
    d.scrollTop = 0;
    const body = $(".film", d); if (body) body.scrollTop = 0;
    document.documentElement.classList.add("lock");
    loadFilmData(raw, d);
  }
  function renderRate(f) {
    const r = rating(f);
    $("#fm-rate").innerHTML = r
      ? `<b class="rt big">★ ${r.v.toFixed(1)}</b> / 10 · ${T("источник")}: ${r.src === "IMDb" ? T("IMDb (через OMDb)") : "TMDB"} (${T("оценок: {n}", { n: (r.n || 0).toLocaleString(numLocale()) })})`
      : `<span class="mute">${T("Рейтинг не найден")}</span>`;
  }
  function syncFilmButtons(id) {
    const fav = S.fav.has(id), later = S.later.has(id);
    $("#fm-actions").innerHTML = `<button class="btn ${fav ? "" : "btn-ghost"}" type="button" data-act="fav" data-id="${esc(id)}" aria-pressed="${fav}">${fav ? "♥ " + T("В избранном") : "♡ " + T("В избранное")}</button>
      <button class="btn ${later ? "" : "btn-ghost"}" type="button" data-act="later" data-id="${esc(id)}" aria-pressed="${later}">${later ? "✓ " : "+ "}${T("Посмотреть позже")}</button>`;
  }

  async function loadFilmData(f, d) {
    const watch = $("#fm-watch");
    const stale = () => d.dataset.id !== f.id;
    if (!S.tmdb) {
      watch.innerHTML = `<p class="mute">${T("Информация о доступности сейчас не найдена.")}</p><p class="mute small">${T("Сервисы просмотра приходят из TMDB (JustWatch).")} <button class="link" type="button" data-act="open-settings">${T("Подключить TMDB")}</button></p>`;
      return;
    }
    watch.innerHTML = `<p class="mute">${T("Загружаем…")}</p>`;
    try {
      let e = S.enrich[f.id];
      if (!e && FILMS.includes(f)) {
        e = await window.Tmdb.resolve(f);
        if (e) { S.enrich[f.id] = e; }
      }
      if (!e && f.tmdbId) e = { tmdbId: f.tmdbId };
      if (stale()) return;
      if (!e) { watch.innerHTML = `<p class="mute">${T("Информация о доступности сейчас не найдена.")}</p>`; return; }
      const [det, prov] = await Promise.all([window.Tmdb.details(e.tmdbId).catch(() => null), window.Tmdb.providers(e.tmdbId).catch(() => null)]);
      if (stale()) return;
      if (det) {
        if (det.overview) $("#fm-desc").textContent = det.overview;
        if (!f.dir && det.director.length) $("#fm-facts").textContent = `${T("Режиссёр")}: ${det.director.join(", ")}` + (det.runtime ? ` · ${T("{n} мин", { n: det.runtime })}` : "");
        if (!f.genres && det.genres.length) $("#fm-genres").textContent = det.genres.join(" · ");
        if (det.original && det.original !== f.ru && !$("#fm-orig").textContent) $("#fm-orig").textContent = det.original;
        if (!FILMS.includes(f)) { S.enrich[f.id] = { ...e, rating: det.rating, votes: det.votes }; }
        else if (det.rating != null) S.enrich[f.id] = { ...e, rating: det.rating, votes: det.votes };
        renderRate(f);
      }
      if (prov) renderWatch(prov, e);
      else watch.innerHTML = `<p class="mute">${T("Информация о доступности сейчас не найдена.")}</p><p class="mute small">${T("Не удалось связаться с TMDB.")}</p>`;
      scheduleRender();
    } catch (err) {
      if (!stale()) watch.innerHTML = `<p class="mute">${T("Информация о доступности сейчас не найдена.")}</p><p class="mute small">${err.status === 401 ? T("Ключ TMDB не принят.") : T("Не удалось связаться с TMDB.")}</p>`;
    }
  }
  function renderWatch(prov, e) {
    const watch = $("#fm-watch");
    const regions = [...new Set([S.region, ...REGIONS])];
    const sel = `<label class="region">${T("Регион")} <select id="region-sel">${regions.map((c) => `<option value="${c}"${c === S.region ? " selected" : ""}>${esc(regionName(c))}</option>`).join("")}</select></label>`;
    const r = prov[S.region];
    const groups = r ? [[T("Подписка"), r.flatrate], [T("Бесплатно"), r.free], [T("Аренда"), r.rent], [T("Покупка"), r.buy]].filter(([, a]) => a.length) : [];
    let body;
    if (!groups.length) body = `<p class="mute">${T("Информация о доступности сейчас не найдена.")}</p><p class="mute small">${T("Регион")}: ${esc(regionName(S.region))}. ${T("Попробуй выбрать другой.")}</p>`;
    else {
      body = groups.map(([t, a]) => `<div class="wgroup"><p class="wk">${t}</p><ul>${a.map((n) => `<li>${r.link ? `<a href="${esc(r.link)}" target="_blank" rel="noopener noreferrer">${esc(n)}</a>` : esc(n)}</li>`).join("")}</ul></div>`).join("") +
        `<p class="mute small">${T("Регион")}: ${esc(regionName(S.region))}. ${T("Ссылки ведут на страницу фильма на TMDB, где собраны варианты просмотра. Данные: JustWatch через TMDB.")}</p>`;
    }
    watch.innerHTML = sel + body;
    watch.dataset.tmdb = e.tmdbId;
    watch._prov = prov;
  }

  function closeFilm(replace) {
    const d = $("#film-dialog");
    if (d.open) d.close();
    document.documentElement.classList.remove("lock");
    const base = S.view === "fav" ? "#/favorites" : "#/";
    if (/^#\/film\//.test(location.hash)) {
      if (modalPushed && !replace) { modalPushed = false; history.back(); }
      else history.replaceState(null, "", base);
    }
  }

  /* ---------- маршрутизация ---------- */
  let initial = true;
  function route() {
    const h = location.hash || "#/";
    const m = h.match(/^#\/film\/(.+)$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      const dlg = $("#film-dialog");
      if (!dlg.open && !initial) modalPushed = true;
      if (!dlg.open || dlg.dataset.id !== id) openFilm(id);
      return;
    }
    if ($("#film-dialog").open) { $("#film-dialog").close(); document.documentElement.classList.remove("lock"); }
    modalPushed = false;
    const view = h === "#/favorites" ? "fav" : "home";
    const changed = view !== S.view;
    S.view = view;
    $("#view-home").hidden = view !== "home";
    $("#view-fav").hidden = view !== "fav";
    $$("[data-nav]").forEach((a) => a.removeAttribute("aria-current"));
    const cur = view === "fav" ? "favorites" : h === "#/library" ? "library" : h === "#/vibe" ? "vibe" : null;
    if (cur) $(`[data-nav="${cur}"]`).setAttribute("aria-current", "page");
    if (view === "fav") renderFav();
    if (changed || h === "#/library" || h === "#/vibe" || h === "#/") {
      const target = h === "#/library" ? $("#library") : h === "#/vibe" ? $("#vibe") : null;
      if (target) target.scrollIntoView({ behavior: "smooth" });
      else if (changed) window.scrollTo(0, 0);
    }
  }

  function refreshAll() {
    updateCounts();
    renderLibrary();
    renderVibe();
    if (S.view === "fav") renderFav();
  }
  let raf = 0;
  function scheduleRender() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; quiet = true; renderLibrary(); renderVibe(); if (S.view === "fav") renderFav(); quiet = false; applyTmdbUI(); });
  }

  /* ---------- TMDB: загрузка и внешний поиск ---------- */
  async function loadTmdb() {
    if (!S.tmdb) return;
    const todo = FILMS.filter((f) => !S.enrich[f.id]);
    S.progress = [FILMS.length - todo.length, FILMS.length];
    applyTmdbUI();
    let i = 0, fatal = null;
    const worker = async () => {
      while (i < todo.length && !fatal) {
        const f = todo[i++];
        try {
          const e = await window.Tmdb.resolve(f);
          if (e) S.enrich[f.id] = e;
        } catch (err) { fatal = fatal || err; }
        S.progress[0]++;
        scheduleRender();
      }
    };
    await Promise.all(Array.from({ length: 5 }, worker));
    S.progress = null;
    if (fatal) {
      S.error = fatal.status === 401 || fatal.status === 403
        ? T("Ключ TMDB не принят — показан демо-режим.")
        : T("Не удалось загрузить данные TMDB — показаны только данные каталога.");
      if (fatal.status === 401 || fatal.status === 403) S.tmdb = false;
    }
    scheduleRender();
  }

  let extTimer = 0, extSeq = 0;
  function extSearch() {
    clearTimeout(extTimer);
    const q = S.f.q.trim();
    const box = $("#ext");
    if (!S.tmdb || q.length < 2) { box.hidden = true; return; }
    extTimer = setTimeout(async () => {
      const seq = ++extSeq;
      try {
        const [res, genres] = await Promise.all([window.Tmdb.searchMovies(q), window.Tmdb.genres().catch(() => ({}))]);
        if (seq !== extSeq) return;
        const known = new Set(Object.values(S.enrich).map((e) => e.tmdbId));
        const list = res.filter((r) => !known.has(r.tmdbId) && r.year).slice(0, 12).map((r) => {
          const f = {
            id: "t" + r.tmdbId, tmdbId: r.tmdbId, ru: r.title || r.original, en: r.original, year: r.year,
            desc: r.overview, genres: r.genreIds.map((g) => genres[g]).filter(Boolean), countries: [], poster: r.poster,
            rating: r.rating, votes: r.votes,
          };
          S.ext[f.id] = f;
          return f;
        });
        $("#ext-grid").innerHTML = list.map((f) => card(f)).join("");
        reveal($("#ext-grid"), true);
        box.hidden = !list.length;
      } catch { if (seq === extSeq) box.hidden = true; }
    }, 450);
  }

  /* ---------- язык ---------- */
  function updateLangBtn() {
    const b = $("#lang-btn");
    if (!b) return;
    const en = LANG() === "en";
    b.textContent = en ? "RU" : "EN";
    b.setAttribute("aria-label", en ? "Русский" : "English");
    b.title = en ? "Русский" : "English";
  }
  function setLang(l) {
    window.I18N.set(l);
    document.documentElement.lang = l;
    window.I18N.applyStatic();
    setTitle();
    hayCache.clear();
    applyTheme(root.dataset.theme, false);
    updateLangBtn();
    fillSelects();
    applyTmdbUI();
    if (S.vibe) S.vibe.r = window.Vibe.search(S.vibe.q, FILMS);
    quiet = true;
    refreshAll();
    quiet = false;
    const d = $("#film-dialog");
    if (d.open) openFilm(d.dataset.id);
    extSearch();
    if (window.restartPlaceholder) window.restartPlaceholder();
  }

  /* ---------- события ---------- */
  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-act], [data-cat], [data-tab], [data-vibe], a[data-similar], #vibe-tags button, [data-nav], [data-brand]");
    if (!t) return;
    if (t.matches("#vibe-tags button")) { $("#vibe-input").value = t.textContent; runVibe(t.textContent); return; }
    if (t.dataset.vibe) {
      closeFilm(true);
      if (S.view !== "home") { history.replaceState(null, "", "#/"); route(); }
      $("#vibe-input").value = t.dataset.vibe; runVibe(t.dataset.vibe); return;
    }
    if (t.dataset.cat !== undefined && t.closest("#cats")) {
      S.f.cat = S.f.cat === t.dataset.cat ? "" : t.dataset.cat; S.shown = PAGE;
      $$("#cats button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cat === S.f.cat)));
      renderLibrary(); return;
    }
    if (t.dataset.tab) { S.tab = t.dataset.tab; renderFav(); return; }
    if (t.matches("a[data-similar]")) return;
    if (t.matches("[data-nav], [data-brand]")) { if (location.hash === t.getAttribute("href")) { ev.preventDefault(); route(); } return; }
    switch (t.dataset.act) {
      case "fav": case "later": toggle(t.dataset.act, t.dataset.id); break;
      case "lang": setLang(LANG() === "ru" ? "en" : "ru"); break;
      case "theme": {
        // меняем тему сразу и синхронно; плавность даёт CSS-переход цветов
        const next = root.dataset.theme === "dark" ? "light" : "dark";
        if (ANIM) { root.classList.add("theme-anim"); clearTimeout(themeTimer); themeTimer = setTimeout(() => root.classList.remove("theme-anim"), 650); }
        applyTheme(next, true);
        break;
      }
      case "close-film": closeFilm(); break;
      case "focus-search":
        if (S.view !== "home") { history.replaceState(null, "", "#/"); route(); }
        $("#library").scrollIntoView({ behavior: "smooth" });
        setTimeout(() => $("#f-q").focus({ preventScroll: true }), 300); break;
      case "edit-vibe": window.scrollTo({ top: 0, behavior: "smooth" }); $("#vibe-input").focus({ preventScroll: true }); $("#vibe-input").select(); break;
      case "more-vibe": S.vibe.offset = (S.vibe.offset + VIBE_N) % S.vibe.r.results.length; renderVibe(); $("#vibe-results").scrollIntoView({ behavior: "smooth", block: "start" }); break;
      case "reset": resetFilters(); break;
      case "open-settings": openSettings(); break;
    }
  });
  // постер, который не загрузился, заменяем заглушкой
  document.addEventListener("error", (ev) => {
    const img = ev.target;
    if (img.tagName !== "IMG" || !img.classList.contains("poster-img")) return;
    const alt = (img.alt || "").replace(T("Постер") + ": ", "");
    img.replaceWith(Object.assign(document.createElement("span"), { className: "ph", innerHTML: `<span class="ph-t">${esc(alt)}</span>` }));
  }, true);

  $("#film-dialog").addEventListener("click", (ev) => { if (ev.target.id === "film-dialog") closeFilm(); });
  $("#film-dialog").addEventListener("cancel", (ev) => { ev.preventDefault(); closeFilm(); });
  $("#film-dialog").addEventListener("change", (ev) => {
    if (ev.target.id !== "region-sel") return;
    S.region = ev.target.value; store.set("film:region", S.region);
    const w = $("#fm-watch");
    if (w._prov) renderWatch(w._prov, { tmdbId: w.dataset.tmdb });
    scheduleRender();
  });

  $("#vibe-form").addEventListener("submit", (ev) => { ev.preventDefault(); runVibe($("#vibe-input").value); });
  $("#vibe-input").addEventListener("keydown", (ev) => { if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); runVibe(ev.target.value); } });

  const bind = (sel, key) => $(sel).addEventListener("input", (ev) => { S.f[key] = ev.target.value; S.shown = PAGE; renderLibrary(); if (key === "q") extSearch(); });
  bind("#f-q", "q"); bind("#f-genre", "genre"); bind("#f-period", "period"); bind("#f-country", "country"); bind("#f-rating", "rating"); bind("#f-sort", "sort");
  $("#more").addEventListener("click", () => { const before = Math.min(S.shown, filtered().length); S.shown += PAGE; renderLibrary(before); });
  $("#filters-toggle").addEventListener("click", (ev) => {
    const open = $("#filters").classList.toggle("open");
    ev.currentTarget.setAttribute("aria-expanded", String(open));
  });
  function resetFilters() {
    S.f = { q: "", genre: "", period: "", country: "", rating: "", sort: "default", cat: "" };
    S.shown = PAGE;
    for (const [s, v] of [["#f-q", ""], ["#f-genre", ""], ["#f-period", ""], ["#f-country", ""], ["#f-rating", ""], ["#f-sort", "default"]]) $(s).value = v;
    $$("#cats button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cat === "")));
    renderLibrary(); extSearch();
  }

  /* ---------- настройки источника ---------- */
  function openSettings() {
    const d = $("#settings-dialog");
    $("#key-input").value = "";
    $("#set-error").textContent = "";
    $("#set-status").textContent = CFG.tmdbProxy ? T("Сейчас: TMDB через прокси.") : window.Tmdb.enabled() ? T("Сейчас: TMDB подключён.") : T("Сейчас: TMDB не подключён.");
    if (!d.open) d.showModal();
    $("#key-input").focus();
  }
  $("#settings-form .close").addEventListener("click", () => $("#settings-dialog").close());
  $("#key-clear").addEventListener("click", () => { window.Tmdb.clearKey(); location.reload(); });
  $("#settings-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const k = $("#key-input").value.trim();
    if (!k) { $("#set-error").textContent = T("Вставь ключ TMDB."); return; }
    const btn = $("#key-save"); btn.disabled = true; btn.textContent = T("Проверяем…");
    window.Tmdb.setKey(k);
    try { await window.Tmdb.ping(); location.reload(); }
    catch (err) {
      window.Tmdb.clearKey();
      $("#set-error").textContent = err.status === 401 ? T("Ключ не принят TMDB. Проверь, что скопирован целиком.") : T("Не удалось связаться с TMDB. Проверь соединение и попробуй ещё раз.");
      btn.disabled = false; btn.textContent = T("Подключить");
    }
  });
  $("#settings-dialog").addEventListener("click", (ev) => { if (ev.target.id === "settings-dialog") ev.target.close(); });

  window.addEventListener("hashchange", route);
  // «Назад» на закрытой модалке не должен ломать состояние
  $("#film-dialog").addEventListener("close", () => document.documentElement.classList.remove("lock"));

  /* ---------- живые детали ---------- */
  // Свет проектора в плашке и наклон постера за курсором — только для мыши.
  if (FINE && ANIM) {
    let fr = 0, last = null;
    document.addEventListener("pointermove", (ev) => {
      last = ev;
      if (fr) return;
      fr = requestAnimationFrame(() => {
        fr = 0;
        const box = ev.target.closest && ev.target.closest(".vibe-box");
        if (box) { const r = box.getBoundingClientRect(); box.style.setProperty("--mx", ev.clientX - r.left + "px"); box.style.setProperty("--my", ev.clientY - r.top + "px"); }
        const w = ev.target.closest && ev.target.closest(".poster-wrap");
        $$(".poster-wrap.tilt").forEach((x) => { if (x !== w) { x.classList.remove("tilt"); x.style.removeProperty("--rx"); x.style.removeProperty("--ry"); } });
        if (w) {
          const r = w.getBoundingClientRect();
          const px = (ev.clientX - r.left) / r.width, py = (ev.clientY - r.top) / r.height;
          w.classList.add("tilt");
          w.style.setProperty("--ry", ((px - 0.5) * 9).toFixed(2) + "deg");
          w.style.setProperty("--rx", ((0.5 - py) * 9).toFixed(2) + "deg");
          w.style.setProperty("--sx", (px * 100).toFixed(1) + "%");
          w.style.setProperty("--sy", (py * 100).toFixed(1) + "%");
        }
      });
    }, { passive: true });
    document.addEventListener("pointerleave", () => $$(".poster-wrap.tilt").forEach((x) => x.classList.remove("tilt")));
  }

  // Подсказка в поле вайба «печатается» сама, пока поле пусто и не в фокусе.
  (function typedPlaceholder() {
    const input = $("#vibe-input");
    const baseRu = input.getAttribute("data-ru-placeholder") || input.placeholder;
    const base = () => T(baseRu);
    if (!ANIM) return;
    const lines = () => [
      T("хочу фильм с вайбом будущего, ночного города и одиночества..."),
      T("атмосфера ночного Токио..."),
      T("мрачное, философское и психологическое кино..."),
      T("что-то похожее на сон..."),
      T("хочу почувствовать себя главным героем..."),
      T("фильм с вайбом свободы и приключений..."),
    ];
    let li = 0, ci = 0, dir = 1, timer = 0, running = false;
    const idle = () => document.activeElement === input || input.value !== "" || document.hidden;
    function tick() {
      timer = 0;
      if (idle()) { running = false; input.placeholder = base(); return; }
      const line = lines()[li];
      ci += dir;
      input.placeholder = T("Например: ") + line.slice(0, ci) + (ci < line.length || dir < 0 ? "▍" : "");
      let wait = dir > 0 ? 55 + Math.random() * 45 : 22;
      if (dir > 0 && ci >= line.length) { dir = -1; wait = 2200; }
      else if (dir < 0 && ci <= 0) { dir = 1; li = (li + 1) % lines().length; wait = 450; }
      timer = setTimeout(tick, wait);
      running = true;
    }
    const start = () => { if (!timer && !idle()) { ci = 0; dir = 1; tick(); } };
    input.addEventListener("focus", () => { clearTimeout(timer); timer = 0; running = false; input.placeholder = base(); });
    input.addEventListener("blur", () => setTimeout(start, 600));
    document.addEventListener("visibilitychange", () => { if (!document.hidden) start(); });
    window.restartPlaceholder = () => { clearTimeout(timer); timer = 0; li = 0; input.placeholder = base(); setTimeout(start, 800); };
    setTimeout(start, 1800);
  })();

  // Тонкая жёлтая линия прогресса прокрутки под шапкой.
  (function progress() {
    const bar = $("#progress");
    if (!bar) return;
    let pr = 0;
    const upd = () => { pr = 0; const h = document.documentElement.scrollHeight - innerHeight; bar.style.transform = `scaleX(${h > 0 ? Math.min(1, scrollY / h) : 0})`; };
    addEventListener("scroll", () => { if (!pr) pr = requestAnimationFrame(upd); }, { passive: true });
    upd();
  })();

  /* ---------- старт ---------- */
  document.documentElement.lang = LANG();
  window.I18N.applyStatic();
  updateLangBtn();
  applyTheme(root.dataset.theme, false);
  fillSelects();
  applyTmdbUI();
  splitWords($("#vibe-h"));
  $$(".sec-head").forEach(watchBlock);
  // Данные постеров ждём недолго, чтобы первая отрисовка сразу показала их, а не заглушки.
  const postersReady = Promise.race([
    fetch("assets/posters.json").then((r) => (r.ok ? r.json() : {})).then((j) => { S.posters = (j && j.films) || {}; }).catch(() => {}),
    new Promise((r) => setTimeout(r, 900)),
  ]);
  postersReady.then(() => {
    applyTmdbUI();
    refreshAll();
    route();
    initial = false;
    loadTmdb();
    // если файл пришёл позже таймаута — перерисуем без анимации
    if (!Object.keys(S.posters).length) fetch("assets/posters.json").then((r) => (r.ok ? r.json() : {})).then((j) => { S.posters = (j && j.films) || {}; scheduleRender(); }).catch(() => {});
  });
})();
