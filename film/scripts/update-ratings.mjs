// Обновляет rating и votes в assets/posters.json из открытых наборов данных IMDb (без ключа и без OMDb).
// Данные IMDb разрешено использовать только в некоммерческих целях: https://developer.imdb.com/non-commercial-datasets/
// Запуск: node film/scripts/update-ratings.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const file = fileURLToPath(new URL("../assets/posters.json", import.meta.url));
const data = JSON.parse(readFileSync(file, "utf8"));
const want = new Map(Object.values(data.films).filter((f) => f.imdb).map((f) => [f.imdb, f]));

const res = await fetch("https://datasets.imdbws.com/title.ratings.tsv.gz");
if (!res.ok) throw new Error("IMDb datasets: HTTP " + res.status);
const text = gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8");

let n = 0;
for (const line of text.split("\n")) {
  const [id, rating, votes] = line.split("\t");
  const f = want.get(id);
  if (f) { f.rating = +rating; f.votes = +votes; n++; }
}
data.source = "IMDb non-commercial datasets";
data.updated = new Date().toISOString().slice(0, 10);
writeFileSync(file, JSON.stringify(data, null, 1) + "\n");
console.log(`Обновлено рейтингов: ${n} из ${want.size}`);
