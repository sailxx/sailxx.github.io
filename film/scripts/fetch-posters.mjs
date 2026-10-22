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

async function lookup(title, year) {
  const url = new URL("https://www.omdbapi.com/");
  url.search = new URLSearchParams({ apikey: key, t: title, y: String(year), type: "movie" });
  const res = await fetch(url);
  if (res.status === 401) throw new Error("OMDb: ключ не принят (401)");
  const j = await res.json();
  if (j.Response === "False") { if (/limit/i.test(j.Error || "")) throw new Error("OMDb: " + j.Error); return null; }
  return j;
}

const num = (v) => (v && v !== "N/A" ? +String(v).replace(/,/g, "") : null);
const films_out = {};
const missing = [];
for (const f of films) {
  const title = f.tmdbQuery || f.en;
  let j = null;
  for (const y of [f.year, f.year - 1, f.year + 1]) { j = await lookup(title, y); if (j) break; }
  if (!j) { missing.push(f.id); console.log("MISS", f.id); continue; }
  const poster = j.Poster && j.Poster !== "N/A" ? j.Poster : null;
  films_out[f.id] = { imdb: j.imdbID, poster, rating: num(j.imdbRating), votes: num(j.imdbVotes) };
  console.log(poster ? "ok  " : "ok* ", f.id, `${j.Title} (${j.Year})`, j.imdbRating, poster ? "" : "— без постера");
}
const out = { source: "OMDb (IMDb)", updated: new Date().toISOString().slice(0, 10), films: films_out };
writeFileSync(fileURLToPath(new URL("assets/posters.json", root)), JSON.stringify(out, null, 1) + "\n");
console.log(`\nГотово: ${Object.keys(films_out).length} из ${films.length}.` + (missing.length ? ` Не найдены: ${missing.join(", ")}` : ""));
