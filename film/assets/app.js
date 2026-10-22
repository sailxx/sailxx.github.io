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
  document.title = CFG.projectName + " — библиотека фильмов и подбор по вайбу";

  /* ---------- тема ---------- */
  const root = document.documentElement;
  const mq = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
  function applyTheme(t, save) {
    root.dataset.theme = t;
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = t === "dark" ? "#0a0a0a" : "#fafaf8";
    const b = $(".theme-btn");
    if (b) { const l = t === "dark" ? "Включить светлую тему" : "Включить тёмную тему"; b.setAttribute("aria-label", l); b.title = l; }
    if (save) { try { localStorage.setItem("film:theme", t); } catch { /* ignore */ } }
  }
  applyTheme(root.dataset.theme || "light", false);
  if (mq) mq.addEventListener("change", (e) => { let saved = null; try { saved = localStorage.getItem("film:theme"); } catch { /* ignore */ } if (!saved) applyTheme(e.matches ? "dark" : "light", false); });

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
      return `<img class="poster-img" src="${esc(p.src)}"${p.srcset ? ` srcset="${p.srcset}" sizes="${sizes}"` : ""} width="342" height="513" loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="Постер: ${esc(f.ru)}">`;
    }
    return `<span class="ph" aria-hidden="true"><span class="ph-t">${esc(f.ru)}</span><span class="ph-y">${f.year || ""}</span></span>`;
  }
  function ratingHTML(f) {
    const r = rating(f);
    return r
      ? `<span title="Источник: ${r.src}, оценок: ${(r.n || 0).toLocaleString("ru")}">${r.src} ${r.v.toFixed(1)}</span>`
      : `<span class="mute">рейтинг не найден</span>`;
  }
  function availLine(f) {
    const e = S.enrich[f.id];
    if (!e || !S.tmdb) return "";
    const p = window.Tmdb.peekProviders(e.tmdbId);
    const r = p && p[S.region];
    if (!r) return "";
    const names = r.flatrate.length ? ["Подписка", r.flatrate] : r.free.length ? ["Бесплатно", r.free] : null;
    return names ? `<p class="avail">${names[0]}: ${esc(names[1].slice(0, 2).join(", "))}</p>` : "";
  }
  function card(f, opt = {}) {
    const fav = S.fav.has(f.id), later = S.later.has(f.id);
    let reason = "";
    if (opt.hits) {
      const tags = opt.hits.length
        ? opt.hits.slice(0, 3).map((h) => `<b class="${h.w >= 3 ? "strong" : ""}">${esc(h.label)}</b>`).join(" · ")
        : "общая атмосфера";
      reason = `<div class="reason"><p class="reason-k">Совпало: ${tags}</p><p>${esc(f.why)}</p></div>`;
    }
    return `<article class="card" data-id="${esc(f.id)}">
      <div class="poster-wrap">
        <a class="poster" href="#/film/${esc(f.id)}" aria-label="${esc(f.ru)} — подробнее">${posterHTML(f, "(min-width:1100px) 17vw, (min-width:720px) 28vw, 46vw")}</a>
        <div class="quick">
          <button type="button" class="qbtn" data-act="fav" data-id="${esc(f.id)}" aria-pressed="${fav}" aria-label="${fav ? "Убрать из избранного" : "В избранное"}: ${esc(f.ru)}" title="${fav ? "Убрать из избранного" : "В избранное"}">${fav ? "♥" : "♡"}</button>
          <button type="button" class="qbtn" data-act="later" data-id="${esc(f.id)}" aria-pressed="${later}" aria-label="${later ? "Убрать из «Посмотреть позже»" : "Посмотреть позже"}: ${esc(f.ru)}" title="${later ? "Убрать из «Посмотреть позже»" : "Посмотреть позже"}">${later ? "✓" : "+"}</button>
        </div>
      </div>
      <h3 class="card-title"><a href="#/film/${esc(f.id)}">${esc(f.ru)}</a></h3>
      <p class="meta">${f.year || "год не найден"} · ${ratingHTML(f)}</p>
      <p class="desc">${esc(f.desc) || '<span class="mute">Описание не найдено</span>'}</p>
      ${availLine(f)}${reason}
    </article>`;
  }
  const emptyDesc = (t) => `<p class="empty">${t}</p>`;

  /* ---------- фильтры ---------- */
  const PERIODS = [
    ["", "Любой период"], ["old", "до 1970"], ["70-80", "1970–1989"], ["90", "1990–1999"], ["00", "2000–2009"], ["10", "2010 и позже"],
  ];
  const inPeriod = (y, p) => !p || (p === "old" ? y < 1970 : p === "70-80" ? y >= 1970 && y < 1990 : p === "90" ? y >= 1990 && y < 2000 : p === "00" ? y >= 2000 && y < 2010 : y >= 2010);
  const CATS = [["cult", "Культовые"], ["underrated", "Недооценённые"], ["evening", "На вечер"], ["phil", "Философские"], ["scifi", "Научная фантастика"]];

  function fillSelects() {
    const genres = [...new Set(FILMS.flatMap((f) => f.genres))].sort((a, b) => a.localeCompare(b, "ru"));
    const countries = [...new Set(FILMS.flatMap((f) => f.countries))].sort((a, b) => a.localeCompare(b, "ru"));
    const opts = (arr, all) => `<option value="">${all}</option>` + arr.map((x) => `<option>${esc(x)}</option>`).join("");
    $("#f-genre").innerHTML = opts(genres, "Все жанры");
    $("#f-country").innerHTML = opts(countries, "Все страны");
    $("#f-period").innerHTML = PERIODS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
    $("#f-rating").innerHTML = `<option value="">Любой</option><option value="6">от 6</option><option value="7">от 7</option><option value="8">от 8</option>`;
    $("#cats").innerHTML = `<li><button type="button" data-cat="" aria-pressed="true">Все</button></li>` +
      CATS.map(([k, l]) => `<li><button type="button" data-cat="${k}" aria-pressed="false">${l}</button></li>`).join("");
  }

  function applyTmdbUI() {
    const on = S.tmdb;
    const rated = hasRatings();
    $("#f-rating").disabled = !rated;
    $("#f-rating").title = rated ? "" : "Рейтинг появится, когда в каталог загружены оценки";
    $('#f-sort option[value="pop"]').disabled = !on;
    $('#f-sort option[value="rating"]').disabled = !rated;
    if (!on && S.f.sort === "pop") { S.f.sort = "default"; $("#f-sort").value = "default"; }
    if (!rated) { S.f.rating = ""; if (S.f.sort === "rating") { S.f.sort = "default"; $("#f-sort").value = "default"; } }

    const note = $("#demo-note");
    if (S.error) note.innerHTML = `${esc(S.error)} <button class="link" type="button" data-act="open-settings">Источник данных</button>`;
    else if (!on) note.innerHTML = `${Object.keys(S.posters).length ? "Постеры и рейтинги: OMDb (IMDb)." : "Демо-режим: постеры и рейтинги не загружены."} Сервисы просмотра появятся после подключения TMDB. <button class="link" type="button" data-act="open-settings">Подключить</button>`;
    else if (S.progress) note.textContent = `Загружаем данные TMDB… ${S.progress[0]} из ${S.progress[1]}`;
    else note.textContent = "";
    note.hidden = !note.textContent && !note.innerHTML;

    $("#foot-status").textContent = on ? "Данные: TMDB (постеры, рейтинги, доступность)." : "Демо-режим: данные TMDB не подключены.";
  }

  function filtered() {
    const f = S.f;
    const q = f.q.trim().toLowerCase().replace(/ё/g, "е");
    let list = FILMS.filter((m) => {
      if (q && !(`${m.ru} ${m.en} ${m.dir}`.toLowerCase().replace(/ё/g, "е").includes(q))) return false;
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

  function renderLibrary() {
    const list = filtered();
    const grid = $("#grid");
    $("#count-line").textContent = list.length ? `Фильмов: ${list.length}` : "";
    if (!list.length) {
      grid.innerHTML = emptyDesc("Ничего не найдено. Измени запрос или сбрось фильтры.") + `<p class="empty-act"><button class="btn btn-ghost" type="button" data-act="reset">Сбросить фильтры</button></p>`;
    } else {
      grid.innerHTML = list.slice(0, S.shown).map((f) => card(f)).join("");
    }
    $("#more").hidden = list.length <= S.shown;
    $("#more").textContent = `Показать ещё (${Math.min(PAGE, list.length - S.shown)})`;
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
      : `<div class="empty big"><p class="empty-h">${S.tab === "fav" ? "Здесь пока пусто" : "Список пуст"}</p><p>${S.tab === "fav" ? "Нажми ♡ на любой карточке, чтобы сохранить фильм." : "Нажми + на карточке — фильм ждёт тебя на потом."}</p><p><a class="btn btn-ghost" href="#/library">Открыть библиотеку</a></p></div>`;
  }

  function toggle(kind, id) {
    const set = kind === "fav" ? S.fav : S.later;
    set.has(id) ? set.delete(id) : set.add(id);
    saveLists();
    refreshAll();
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
      ? `Распознано: ${r.concepts.map((c) => esc(c.label)).join(", ")}.`
      : "Знакомых настроений в запросе не найдено.";
    box.innerHTML = `<div class="vibe-head">
        <p class="eyebrow">Подборка по запросу «${esc(q.length > 80 ? q.slice(0, 80) + "…" : q)}»</p>
        <h2>${esc(r.title)}</h2>
        <p class="lead dark">${esc(r.description)}</p>
        <p class="logic">${recognized} Подбор — локальный: запрос сопоставляется с жанрами, темами, тоном и местом действия каждого фильма каталога. Это не нейросеть.</p>
      </div>
      <div class="grid vibe-grid">${set.map((x) => card(x.film, { hits: x.hits })).join("")}</div>
      <div class="vibe-actions">
        <button class="btn btn-ghost" type="button" data-act="edit-vibe">Изменить запрос</button>
        ${pool.length > VIBE_N ? `<button class="btn" type="button" data-act="more-vibe">Другая подборка</button>` : ""}
      </div>`;
  }

  /* ---------- модальное окно фильма ---------- */
  const regionName = (c) => { try { return new Intl.DisplayNames(["ru"], { type: "region" }).of(c) || c; } catch { return c; } };
  const REGIONS = ["RU", "UA", "BY", "KZ", "GE", "AM", "US", "CA", "GB", "DE", "FR", "ES", "IT", "PL", "TR", "IL", "AU", "JP", "BR", "MX"];

  let modalPushed = false;
  function openFilm(id) {
    const f = byId(id);
    const d = $("#film-dialog");
    if (!f) { closeFilm(true); return; }
    d.dataset.id = id;
    const e = S.enrich[id];
    const similar = FILMS.includes(f) ? window.Vibe.similar(f, FILMS, 6) : [];
    const meta = [f.dir, f.runtime ? f.runtime + " мин" : null].filter(Boolean);
    d.innerHTML = `<div class="film">
      <button class="close" type="button" data-act="close-film" aria-label="Закрыть">×</button>
      <div class="film-poster"><div class="poster-static">${posterHTML(f, "(min-width:720px) 320px, 70vw")}</div></div>
      <div class="film-body">
        <p class="eyebrow" id="fm-year">${f.year || "Год не найден"}</p>
        <h2 id="film-title">${esc(f.ru)}</h2>
        <p class="orig" id="fm-orig">${f.en && f.en !== f.ru ? esc(f.en) : ""}</p>
        <p class="facts" id="fm-facts">${[f.dir ? "Режиссёр: " + esc(f.dir) : "Режиссёр: не найден", f.runtime ? f.runtime + " мин" : "Длительность: не найдена"].join(" · ")}</p>
        <p class="facts" id="fm-genres">${(f.genres || []).map(esc).join(" · ")}${f.countries && f.countries.length ? " · " + f.countries.map(esc).join(", ") : ""}</p>
        <p class="rate" id="fm-rate"></p>
        <div class="actions" id="fm-actions"></div>

        <h3>Описание</h3>
        <p id="fm-desc">${esc(f.desc) || "Описание не найдено."}</p>

        ${f.why ? `<h3>Почему стоит посмотреть</h3><p>${esc(f.why)}</p>` : ""}
        ${f.vibes ? `<h3>Вайб фильма</h3><ul class="tags tags-dark">${f.vibes.map((t) => `<li><button type="button" data-vibe="${esc(t)}">${esc(t)}</button></li>`).join("")}</ul>` : ""}
        ${f.who ? `<h3>Кому понравится</h3><p>${esc(f.who)}</p>` : ""}

        <h3>Где посмотреть</h3>
        <div class="watch" id="fm-watch"></div>

        ${similar.length ? `<h3>Похожие фильмы</h3><ul class="similar">${similar.map((s) => `<li><a href="#/film/${esc(s.id)}" data-similar>${`<span class="sim-p">${posterHTML(s, "120px")}</span>`}<span class="sim-t">${esc(s.ru)}</span><span class="sim-y">${s.year}</span></a></li>`).join("")}</ul>` : ""}
      </div>
    </div>`;
    syncFilmButtons(id);
    renderRate(f);
    if (!d.open) d.showModal();
    d.scrollTop = 0;
    const body = $(".film", d); if (body) body.scrollTop = 0;
    document.documentElement.classList.add("lock");
    loadFilmData(f, d);
  }
  function renderRate(f) {
    const r = rating(f);
    $("#fm-rate").innerHTML = r
      ? `<b>${r.v.toFixed(1)}</b> / 10 · источник: ${r.src === "IMDb" ? "IMDb (через OMDb)" : "TMDB"} (${(r.n || 0).toLocaleString("ru")} оценок)`
      : `<span class="mute">Рейтинг не найден</span>`;
  }
  function syncFilmButtons(id) {
    const fav = S.fav.has(id), later = S.later.has(id);
    $("#fm-actions").innerHTML = `<button class="btn ${fav ? "" : "btn-ghost"}" type="button" data-act="fav" data-id="${esc(id)}" aria-pressed="${fav}">${fav ? "♥ В избранном" : "♡ В избранное"}</button>
      <button class="btn ${later ? "" : "btn-ghost"}" type="button" data-act="later" data-id="${esc(id)}" aria-pressed="${later}">${later ? "✓ Посмотреть позже" : "+ Посмотреть позже"}</button>`;
  }

  async function loadFilmData(f, d) {
    const watch = $("#fm-watch");
    const stale = () => d.dataset.id !== f.id;
    if (!S.tmdb) {
      watch.innerHTML = `<p class="mute">Информация о доступности сейчас не найдена.</p><p class="mute small">Сервисы просмотра приходят из TMDB (JustWatch). <button class="link" type="button" data-act="open-settings">Подключить TMDB</button></p>`;
      return;
    }
    watch.innerHTML = `<p class="mute">Загружаем…</p>`;
    try {
      let e = S.enrich[f.id];
      if (!e && FILMS.includes(f)) {
        e = await window.Tmdb.resolve(f);
        if (e) { S.enrich[f.id] = e; }
      }
      if (!e && f.tmdbId) e = { tmdbId: f.tmdbId };
      if (stale()) return;
      if (!e) { watch.innerHTML = `<p class="mute">Информация о доступности сейчас не найдена.</p>`; return; }
      const [det, prov] = await Promise.all([window.Tmdb.details(e.tmdbId).catch(() => null), window.Tmdb.providers(e.tmdbId).catch(() => null)]);
      if (stale()) return;
      if (det) {
        if (det.overview) $("#fm-desc").textContent = det.overview;
        if (!f.dir && det.director.length) $("#fm-facts").textContent = `Режиссёр: ${det.director.join(", ")}` + (det.runtime ? ` · ${det.runtime} мин` : "");
        if (!f.genres && det.genres.length) $("#fm-genres").textContent = det.genres.join(" · ");
        if (det.original && det.original !== f.ru && !$("#fm-orig").textContent) $("#fm-orig").textContent = det.original;
        if (!FILMS.includes(f)) { S.enrich[f.id] = { ...e, rating: det.rating, votes: det.votes }; }
        else if (det.rating != null) S.enrich[f.id] = { ...e, rating: det.rating, votes: det.votes };
        renderRate(f);
      }
      if (prov) renderWatch(prov, e);
      else watch.innerHTML = `<p class="mute">Информация о доступности сейчас не найдена.</p><p class="mute small">Не удалось связаться с TMDB.</p>`;
      scheduleRender();
    } catch (err) {
      if (!stale()) watch.innerHTML = `<p class="mute">Информация о доступности сейчас не найдена.</p><p class="mute small">${err.status === 401 ? "Ключ TMDB не принят." : "Не удалось связаться с TMDB."}</p>`;
    }
  }
  function renderWatch(prov, e) {
    const watch = $("#fm-watch");
    const regions = [...new Set([S.region, ...REGIONS])];
    const sel = `<label class="region">Регион <select id="region-sel">${regions.map((c) => `<option value="${c}"${c === S.region ? " selected" : ""}>${esc(regionName(c))}</option>`).join("")}</select></label>`;
    const r = prov[S.region];
    const groups = r ? [["Подписка", r.flatrate], ["Бесплатно", r.free], ["Аренда", r.rent], ["Покупка", r.buy]].filter(([, a]) => a.length) : [];
    let body;
    if (!groups.length) body = `<p class="mute">Информация о доступности сейчас не найдена.</p><p class="mute small">Регион: ${esc(regionName(S.region))}. Попробуй выбрать другой.</p>`;
    else {
      body = groups.map(([t, a]) => `<div class="wgroup"><p class="wk">${t}</p><ul>${a.map((n) => `<li>${r.link ? `<a href="${esc(r.link)}" target="_blank" rel="noopener noreferrer">${esc(n)}</a>` : esc(n)}</li>`).join("")}</ul></div>`).join("") +
        `<p class="mute small">Регион: ${esc(regionName(S.region))}. Ссылки ведут на страницу фильма на TMDB, где собраны варианты просмотра. Данные: JustWatch через TMDB.</p>`;
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
    raf = requestAnimationFrame(() => { raf = 0; renderLibrary(); renderVibe(); if (S.view === "fav") renderFav(); applyTmdbUI(); });
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
        ? "Ключ TMDB не принят — показан демо-режим."
        : "Не удалось загрузить данные TMDB — показаны только данные каталога.";
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
        box.hidden = !list.length;
      } catch { if (seq === extSeq) box.hidden = true; }
    }, 450);
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
      case "theme": applyTheme(root.dataset.theme === "dark" ? "light" : "dark", true); break;
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
    const alt = (img.alt || "").replace("Постер: ", "");
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
  $("#more").addEventListener("click", () => { S.shown += PAGE; renderLibrary(); });
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
    $("#set-status").textContent = CFG.tmdbProxy ? "Сейчас: TMDB через прокси." : window.Tmdb.enabled() ? "Сейчас: TMDB подключён." : "Сейчас: демо-режим.";
    if (!d.open) d.showModal();
    $("#key-input").focus();
  }
  $("#settings-form .close").addEventListener("click", () => $("#settings-dialog").close());
  $("#key-clear").addEventListener("click", () => { window.Tmdb.clearKey(); location.reload(); });
  $("#settings-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const k = $("#key-input").value.trim();
    if (!k) { $("#set-error").textContent = "Вставь ключ TMDB."; return; }
    const btn = $("#key-save"); btn.disabled = true; btn.textContent = "Проверяем…";
    window.Tmdb.setKey(k);
    try { await window.Tmdb.ping(); location.reload(); }
    catch (err) {
      window.Tmdb.clearKey();
      $("#set-error").textContent = err.status === 401 ? "Ключ не принят TMDB. Проверь, что скопирован целиком." : "Не удалось связаться с TMDB. Проверь соединение и попробуй ещё раз.";
      btn.disabled = false; btn.textContent = "Подключить";
    }
  });
  $("#settings-dialog").addEventListener("click", (ev) => { if (ev.target.id === "settings-dialog") ev.target.close(); });

  window.addEventListener("hashchange", route);
  // «Назад» на закрытой модалке не должен ломать состояние
  $("#film-dialog").addEventListener("close", () => document.documentElement.classList.remove("lock"));

  /* ---------- старт ---------- */
  fetch("assets/posters.json").then((r) => (r.ok ? r.json() : {})).then((j) => { S.posters = (j && j.films) || {}; scheduleRender(); }).catch(() => {});
  fillSelects();
  applyTmdbUI();
  refreshAll();
  route();
  initial = false;
  loadTmdb();
})();
