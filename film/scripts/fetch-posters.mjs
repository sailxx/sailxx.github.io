// Сохраняет id фильмов и пути постеров TMDB в assets/posters.json,
// чтобы постеры показывались всем без ключа в браузере.
// Запуск локально: TMDB_TOKEN=<read access token или api key> node film/scripts/fetch-posters.mjs
// Рейтинги и доступность сюда не пишутся: они меняются и берутся из TMDB на лету.
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const token = (process.env.TMDB_TOKEN || "").trim();
if (!token) { console.error("Нужна переменная TMDB_TOKEN"); process.exit(1); }

const root = new URL("../", import.meta.url);
const ctx = { window: {} };
vm.runInNewContext(readFileSync(new URL("assets/data.js", root), "utf8"), ctx);
const films = ctx.window.FILMS;

const bearer = /^eyJ/.test(token) || token.length > 40;
async function search(query) {
  const url = new URL("https://api.themoviedb.org/3/search/movie");
  url.searchParams.set("query", query);
  url.searchParams.set("language", "ru-RU");
  url.searchParams.set("include_adult", "false");
  if (!bearer) url.searchParams.set("api_key", token);
  const res = await fetch(url, { headers: bearer ? { Authorization: "Bearer " + token } : {} });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return (await res.json()).results || [];
}

const out = {};
const missing = [];
for (const f of films) {
  const list = await search(f.tmdbQuery || f.en);
  const y = (r) => +String(r.release_date || "").slice(0, 4);
  const r = list.find((x) => y(x) === f.year && x.poster_path) || list.find((x) => Math.abs(y(x) - f.year) <= 1 && x.poster_path);
  if (r) out[f.id] = { tmdbId: r.id, poster: r.poster_path };
  else missing.push(f.id);
  console.log(r ? "ok  " : "MISS", f.id, r ? `${r.title} (${r.release_date})` : "");
}
writeFileSync(fileURLToPath(new URL("assets/posters.json", root)), JSON.stringify(out, null, 1) + "\n");
console.log(`\nГотово: ${Object.keys(out).length} из ${films.length}.` + (missing.length ? ` Не найдены: ${missing.join(", ")}` : ""));
