// Скачивает постеры из assets/posters.json в assets/posters/<id>.jpg и заменяет ссылки на локальные пути,
// чтобы сайт не зависел от чужих серверов. Запуск: node film/scripts/localize-posters.mjs
// Уже скачанные файлы пропускаются; после fetch-posters.mjs запусти скрипт ещё раз.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const file = fileURLToPath(new URL("assets/posters.json", root));
const dir = fileURLToPath(new URL("assets/posters/", root));
mkdirSync(dir, { recursive: true });

const data = JSON.parse(readFileSync(file, "utf8"));
let done = 0, skipped = 0, failed = [];
for (const [id, f] of Object.entries(data.films)) {
  if (!f.poster) continue;
  const local = `assets/posters/${id}.jpg`;
  const path = dir + id + ".jpg";
  if (/^https?:/.test(f.poster)) {
    if (!existsSync(path)) {
      try {
        const res = await fetch(f.poster);
        if (!res.ok) throw new Error("HTTP " + res.status);
        writeFileSync(path, Buffer.from(await res.arrayBuffer()));
        done++;
      } catch (e) { failed.push(id + " (" + e.message + ")"); continue; }
    } else skipped++;
    f.poster = local;
  }
}
writeFileSync(file, JSON.stringify(data, null, 1) + "\n");
console.log(`Скачано: ${done}, уже было: ${skipped}` + (failed.length ? `, ошибки: ${failed.join(", ")}` : ""));
