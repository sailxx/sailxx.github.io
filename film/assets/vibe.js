/* Локальный подбор по вайбу: словарь синонимов -> понятия -> веса фильмов.
   Никакого ИИ: запрос раскладывается на известные понятия, фильмы ранжируются по сумме весов. */
(function () {
  const norm = (s) => String(s).toLowerCase().replace(/ё/g, "е");
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const T = window.T;
  const isEn = () => window.I18N && window.I18N.lang === "en";
  // Запрос распознаётся на обоих языках независимо от языка интерфейса; подписи — на языке интерфейса.
  const rules = Object.entries(window.CONCEPTS).map(([id, c]) => {
    const e = (window.CONCEPTS_EN && window.CONCEPTS_EN[id]) || { syn: [] };
    return {
      id,
      ru: c,
      en: e,
      res: [...c.syn, ...e.syn].map((s) => new RegExp("(^|[^а-яa-z0-9])" + esc(norm(s)))),
    };
  });

  const vecs = {};
  function vec(film) {
    if (vecs[film.id]) return vecs[film.id];
    const o = {};
    (film.v || "").split(",").forEach((p) => {
      const [k, w] = p.split(":");
      if (k && +w > 0) o[k] = +w;
    });
    return (vecs[film.id] = o);
  }

  function parse(query) {
    const q = " " + norm(query).replace(/\s+/g, " ") + " ";
    const found = [];
    for (const r of rules) {
      let hits = 0;
      for (const re of r.res) if (re.test(q)) hits++;
      if (hits) { const src = isEn() && r.en.label ? r.en : r.ru; found.push({ id: r.id, label: src.label, desc: src.desc, strength: 1 + Math.min(hits - 1, 2) * 0.5 }); }
    }
    return found;
  }

  function textScore(film, q) {
    const words = norm(q).split(/[^а-яa-z0-9]+/).filter((w) => w.length >= 5).map((w) => w.slice(0, 5));
    if (!words.length) return 0;
    const fe = (window.FILMS_EN && window.FILMS_EN[film.id]) || {};
    const hay = norm([film.ru, film.en, film.desc, film.vibes.join(" "), fe.title, fe.desc, (fe.vibes || []).join(" ")].join(" "));
    let s = 0;
    for (const w of words) if (hay.includes(w)) s += 0.5;
    return s;
  }

  function search(query, films) {
    const concepts = parse(query);
    const total = concepts.reduce((a, c) => a + c.strength, 0);
    let list = films.map((f, i) => {
      const v = vec(f);
      let sum = 0, covered = 0;
      const hits = [];
      for (const c of concepts) {
        const w = v[c.id] || 0;
        if (w) { sum += w * c.strength; covered++; hits.push({ label: c.label, w }); }
      }
      hits.sort((a, b) => b.w - a.w);
      const coverage = concepts.length ? covered / concepts.length : 0;
      const score = sum * (0.55 + 0.45 * coverage) + textScore(f, query);
      return { film: f, score, hits, i, total };
    });

    let abstract = false;
    list = list.filter((r) => r.score > 0);
    if (!concepts.length && !list.length) {
      abstract = true;
      list = films.map((f, i) => {
        const v = vec(f);
        const score = (v.think || 0) + (v.dream || 0) + (v.existential || 0) + (v.melancholy || 0) + (v.philosophy || 0);
        return { film: f, score, hits: [], i, total: 0 };
      });
    }
    list.sort((a, b) => b.score - a.score || a.i - b.i);

    const top = concepts.slice().sort((a, b) => b.strength - a.strength).slice(0, 3);
    const title = abstract
      ? T("Фильмы с выраженной атмосферой")
      : concepts.length
        ? top.map((c) => c.label).join(" · ")
        : T("Близкие по тексту");
    let description;
    if (abstract) {
      description = T("В запросе нет знакомых нам настроений, поэтому показываем картины с самой выраженной атмосферой — задумчивые, снотворные и философские. Добавь слова вроде «одиночество», «неон», «ностальгия», «дорога» — подборка станет точнее.");
    } else if (concepts.length) {
      const d = top.slice(0, 2).map((c) => c.desc);
      description = d[1] ? T("Здесь — {a}, а ещё {b}.", { a: d[0], b: d[1] }) : T("Здесь — {a}.", { a: d[0] });
    } else {
      description = T("Прямых совпадений по настроению нет — подобрали фильмы по словам из запроса.");
    }
    return { concepts, title, description, abstract, results: list.slice(0, 24) };
  }

  function similar(film, films, n) {
    const a = vec(film);
    const norma = Math.sqrt(Object.values(a).reduce((s, x) => s + x * x, 0)) || 1;
    return films
      .filter((f) => f.id !== film.id)
      .map((f) => {
        const b = vec(f);
        let dot = 0;
        for (const k in a) if (b[k]) dot += a[k] * b[k];
        const nb = Math.sqrt(Object.values(b).reduce((s, x) => s + x * x, 0)) || 1;
        const g = f.genres.filter((x) => film.genres.includes(x)).length / new Set([...f.genres, ...film.genres]).size;
        return { f, s: dot / (norma * nb) + 0.35 * g };
      })
      .sort((x, y) => y.s - x.s)
      .slice(0, n)
      .map((x) => x.f);
  }

  window.Vibe = { search, similar, parse };
})();
