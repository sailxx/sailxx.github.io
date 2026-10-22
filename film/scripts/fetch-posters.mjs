// Загружает из OMDb постеры и рейтинги IMDb и сохраняет их в assets/posters.json,
// чтобы сайт показывал их всем без ключа в браузере.
// Запуск локально:  OMDB_KEY=<ключ> node film/scripts/fetch-posters.mjs
// Ключ бесплатный: https://www.omdbapi.com/apikey.aspx
// Рейтинг — снимок на дату в поле updated; чтобы обновить, запусти скрипт ещё раз.
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const key = (process.env.OMDB_KEY || "").trim();
if (!key) { console.error("Нужна переменная OMDB_KEY"); process.exit(1); }

const root = new URL("../", import.meta.url);
const ctx = { window: {} };
vm.runInNewContext(readFileSync(new URL("assets/data.js", root), "utf8"), ctx);
const films = ctx.window.FILMS;

const norm = (t) => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
// Фильмы, чьё название в IMDb отличается от обычного: id сверяются с ответом OMDb (год ±1).
const HINT = {
  her: "tt1798709", birdman: "tt2562232", "ex-machina": "tt0470752", "mulholland-drive": "tt0166924",
  "city-of-god": "tt0317248", "cinema-paradiso": "tt0095765", se7en: "tt0114369", "children-of-men": "tt0206634",
  "ghost-in-the-shell": "tt0113568", "chungking-express": "tt0109424", "perfect-blue": "tt0156887",
  "virgin-suicides": "tt0159097", nostalghia: "tt0086022",
};

// Название в OMDb может отличаться от обычного (Se7en -> Seven): допустимые варианты для сверки.
const ALIAS = { se7en: ["seven"], nostalghia: ["nostalgia"] };
const titleOk = (f, got) => {
  const g = norm(got);
  return [f.tmdbQuery || f.en, f.en, ...(ALIAS[f.id] || [])].filter(Boolean).map(norm).some((t) => t && (g === t || g.includes(t) || t.includes(g)));
};

async function api(params) {
  const url = new URL("https://www.omdbapi.com/");
  url.search = new URLSearchParams({ apikey: key, ...params });
  const res = await fetch(url);
  if (res.status === 401) throw new Error("OMDb: ключ не принят (401)");
  const j = await res.json();
  if (j.Response === "False" && /limit/i.test(j.Error || "")) throw new Error("OMDb: " + j.Error);
  return j;
}

async function findId(f) {
  if (HINT[f.id]) return HINT[f.id];
  const title = f.tmdbQuery || f.en;
  const j = await api({ s: title, y: String(f.year), type: "movie" });
  let list = (j.Search || []).filter((r) => norm(r.Title) === norm(title));
  if (!list.length) {
    const j2 = await api({ s: title, type: "movie" });
    list = (j2.Search || []).filter((r) => norm(r.Title) === norm(title) && Math.abs(parseInt(r.Year) - f.year) <= 1);
  }
  list.sort((a, b) => Math.abs(parseInt(a.Year) - f.year) - Math.abs(parseInt(b.Year) - f.year));
  return list[0] && Math.abs(parseInt(list[0].Year) - f.year) <= 1 ? list[0].imdbID : null;
}

const num = (v) => (v && v !== "N/A" ? +String(v).replace(/,/g, "") : null);
const films_out = {};
const missing = [];
for (const f of films) {
  const id = await findId(f);
  const j = id ? await api({ i: id }) : null;
  const tol = HINT[f.id] ? 3 : 1; // у id из подсказок год в OMDb бывает прокатным, а не премьерным
  if (!j || j.Response === "False" || j.Type !== "movie" || Math.abs(parseInt(j.Year) - f.year) > tol || !titleOk(f, j.Title)) {
    missing.push(f.id); console.log("MISS", f.id, j && j.Title ? `(получено: ${j.Title}, ${j.Year})` : ""); continue;
  }
  const poster = j.Poster && j.Poster !== "N/A" ? j.Poster : null;
  films_out[f.id] = { imdb: j.imdbID, poster, rating: num(j.imdbRating), votes: num(j.imdbVotes) };
  console.log(poster ? "ok  " : "ok* ", f.id.padEnd(22), `${j.Title} (${j.Year})`, j.imdbRating, poster ? "" : "— без постера");
}
const out = { source: "OMDb (IMDb)", updated: new Date().toISOString().slice(0, 10), films: films_out };
writeFileSync(fileURLToPath(new URL("assets/posters.json", root)), JSON.stringify(out, null, 1) + "\n");
console.log(`\nГотово: ${Object.keys(films_out).length} из ${films.length}.` + (missing.length ? ` Не найдены: ${missing.join(", ")}` : ""));
