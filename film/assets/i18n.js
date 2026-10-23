/* Интерфейс на двух языках. Исходный текст — русский и служит ключом: T("Русская строка") возвращает
   английский перевод, когда выбран English. Статические элементы страницы помечены data-i18n. */
(function () {
  const KEY = "film:lang";
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* ignore */ }
  const nav = ((navigator.languages && navigator.languages[0]) || navigator.language || "ru").toLowerCase();
  let lang = saved === "en" || saved === "ru" ? saved : /^(ru|uk|be|kk)/.test(nav) ? "ru" : "en";

  const EN = {
    // шапка и навигация
    "К библиотеке": "Skip to library",
    "На главную": "Home",
    "Основная навигация": "Main navigation",
    "Библиотека": "Library",
    "По вайбу": "By vibe",
    "Избранное": "Favourites",
    "Переключить тему": "Toggle theme",
    "Включить светлую тему": "Switch to light theme",
    "Включить тёмную тему": "Switch to dark theme",
    "Поиск по названию": "Search by title",
    // плашка
    "Что ты хочешь почувствовать?": "What do you want to feel?",
    "Опиши атмосферу, настроение или мир, в который хочешь погрузиться. Мы подберём фильмы под твой вайб.": "Describe the atmosphere, the mood or the world you want to step into. We will pick films for your vibe.",
    "Опиши свой вайб": "Describe your vibe",
    "Например: хочу фильм с вайбом будущего, ночного города и одиночества...": "For example: I want a film with the vibe of the future, a night city and loneliness...",
    "Например: ": "For example: ",
    "Найти мой вайб →": "Find my vibe →",
    "Примеры запросов": "Example queries",
    "Будущее": "The future",
    "Киберпанк": "Cyberpunk",
    "Ночной город": "Night city",
    "Экзистенциальность": "Existentialism",
    "Мрачная атмосфера": "Dark atmosphere",
    "Ностальгия": "Nostalgia",
    "Свобода": "Freedom",
    "Сон наяву": "Waking dream",
    "хочу фильм с вайбом будущего, ночного города и одиночества...": "I want a film with the vibe of the future, a night city and loneliness...",
    "атмосфера ночного Токио...": "the atmosphere of night-time Tokyo...",
    "мрачное, философское и психологическое кино...": "dark, philosophical and psychological cinema...",
    "что-то похожее на сон...": "something like a dream...",
    "хочу почувствовать себя главным героем...": "I want to feel like the main character...",
    "фильм с вайбом свободы и приключений...": "a film with the vibe of freedom and adventure...",
    // библиотека
    "От культовой классики до фильмов, которые ты ещё не открыл.": "From cult classics to films you have not discovered yet.",
    "Название, режиссёр или актёр": "Title, director or actor",
    "Фильтры": "Filters",
    "Сортировка": "Sort",
    "Подборка": "Curated",
    "По популярности": "By popularity",
    "По рейтингу": "By rating",
    "Новее сначала": "Newest first",
    "Старше сначала": "Oldest first",
    "Жанр": "Genre",
    "Период": "Period",
    "Страна": "Country",
    "Рейтинг": "Rating",
    "Быстрые категории": "Quick categories",
    "Все": "All",
    "Все жанры": "All genres",
    "Все страны": "All countries",
    "Любой": "Any",
    "Любой период": "Any period",
    "до 1970": "before 1970",
    "2010 и позже": "2010 and later",
    "от {n}": "{n}+",
    "Культовые": "Cult",
    "Недооценённые": "Underrated",
    "На вечер": "For tonight",
    "Философские": "Philosophical",
    "Научная фантастика": "Science fiction",
    "Фильмов: {n}": "Films: {n}",
    "Ничего не найдено. Измени запрос или сбрось фильтры.": "Nothing found. Change the query or reset the filters.",
    "Сбросить фильтры": "Reset filters",
    "Показать ещё": "Show more",
    "Показать ещё ({n})": "Show more ({n})",
    "Ещё из TMDB": "More from TMDB",
    "Рейтинг появится, когда в каталог загружены оценки": "Rating will appear once ratings are loaded into the catalogue",
    "Постеры и рейтинги: OMDb (IMDb).": "Posters and ratings: OMDb (IMDb).",
    "Постеры и рейтинги не загружены.": "Posters and ratings are not loaded.",
    "Сервисы просмотра появятся после подключения TMDB.": "Where-to-watch services will appear once TMDB is connected.",
    "Подключить": "Connect",
    "Загружаем данные TMDB… {a} из {b}": "Loading TMDB data… {a} of {b}",
    "Данные: OMDb (постеры, рейтинги IMDb), TMDB (описания, доступность просмотра).": "Data: OMDb (posters, IMDb ratings), TMDB (descriptions, availability).",
    "Данные: OMDb (постеры, рейтинги IMDb). Доступность просмотра появится после подключения TMDB.": "Data: OMDb (posters, IMDb ratings). Availability will appear once TMDB is connected.",
    "Ключ TMDB не принят — показан демо-режим.": "The TMDB key was rejected — demo mode is shown.",
    "Не удалось загрузить данные TMDB — показаны только данные каталога.": "Could not load TMDB data — only catalogue data is shown.",
    // карточка
    "Постер": "Poster",
    "{title} — подробнее": "{title} — details",
    "Источник: {src}, оценок: {n}": "Source: {src}, ratings: {n}",
    "рейтинг не найден": "rating not found",
    "год не найден": "year not found",
    "Описание не найдено": "Description not found",
    "Описание не найдено.": "Description not found.",
    "Подписка": "Subscription",
    "Бесплатно": "Free",
    "Аренда": "Rent",
    "Покупка": "Buy",
    "В ролях": "Starring",
    "Совпало": "Matches",
    "общая атмосфера": "overall atmosphere",
    "В избранное": "Add to favourites",
    "В избранном": "In favourites",
    "Убрать из избранного": "Remove from favourites",
    "Посмотреть позже": "Watch later",
    "Убрать из «Посмотреть позже»": "Remove from “Watch later”",
    // избранное
    "Всё, что ты сохранил. Данные хранятся только в этом браузере.": "Everything you saved. The data is stored only in this browser.",
    "Списки": "Lists",
    "Здесь пока пусто": "Nothing here yet",
    "Список пуст": "The list is empty",
    "Нажми ♡ на любой карточке, чтобы сохранить фильм.": "Press ♡ on any card to save a film.",
    "Нажми + на карточке — фильм ждёт тебя на потом.": "Press + on a card — the film will wait for you.",
    "Открыть библиотеку": "Open the library",
    // вайб
    "Распознано: {list}.": "Recognised: {list}.",
    "Знакомых настроений в запросе не найдено.": "No familiar moods were found in the query.",
    "Подборка по запросу «{q}»": "Selection for “{q}”",
    "Подбор — локальный: запрос сопоставляется с жанрами, темами, тоном и местом действия каждого фильма каталога. Это не нейросеть.": "The matching is local: your query is compared with the genres, themes, tone and setting of each film in the catalogue. It is not a neural network.",
    "Изменить запрос": "Edit the query",
    "Другая подборка": "Another selection",
    "Фильмы с выраженной атмосферой": "Films with a strong atmosphere",
    "Близкие по тексту": "Close by text",
    "В запросе нет знакомых нам настроений, поэтому показываем картины с самой выраженной атмосферой — задумчивые, снотворные и философские. Добавь слова вроде «одиночество», «неон», «ностальгия», «дорога» — подборка станет точнее.": "There are no moods we recognise in the query, so we show the films with the strongest atmosphere — thoughtful, dreamlike and philosophical. Add words like “loneliness”, “neon”, “nostalgia”, “road” and the selection will get more precise.",
    "Здесь — {a}, а ещё {b}.": "Here: {a}, and also {b}.",
    "Здесь — {a}.": "Here: {a}.",
    "Прямых совпадений по настроению нет — подобрали фильмы по словам из запроса.": "There are no direct mood matches — we picked films by the words in your query.",
    // окно фильма
    "Закрыть": "Close",
    "Год не найден": "Year not found",
    "Режиссёр": "Director",
    "Режиссёр: не найден": "Director: not found",
    "{n} мин": "{n} min",
    "Длительность: не найдена": "Runtime: not found",
    "Описание": "Description",
    "Почему стоит посмотреть": "Why watch it",
    "Вайб фильма": "The film's vibe",
    "Кому понравится": "Who will like it",
    "Где посмотреть": "Where to watch",
    "Похожие фильмы": "Similar films",
    "источник": "source",
    "IMDb (через OMDb)": "IMDb (via OMDb)",
    "оценок: {n}": "{n} ratings",
    "Рейтинг не найден": "Rating not found",
    "Регион": "Region",
    "Информация о доступности сейчас не найдена.": "Availability information is not found right now.",
    "Сервисы просмотра приходят из TMDB (JustWatch).": "Streaming services come from TMDB (JustWatch).",
    "Подключить TMDB": "Connect TMDB",
    "Загружаем…": "Loading…",
    "Не удалось связаться с TMDB.": "Could not reach TMDB.",
    "Ключ TMDB не принят.": "The TMDB key was rejected.",
    "Попробуй выбрать другой.": "Try choosing another one.",
    "Ссылки ведут на страницу фильма на TMDB, где собраны варианты просмотра. Данные: JustWatch через TMDB.": "The links lead to the film's page on TMDB, where all viewing options are collected. Data: JustWatch via TMDB.",
    // подвал и настройки
    "Рейтинги IMDb и постеры получены через OMDb API. Этот продукт использует TMDB API, но не одобрен и не сертифицирован TMDB. Данные о доступности просмотра предоставлены JustWatch через TMDB.": "IMDb ratings and posters are obtained through the OMDb API. This product uses the TMDB API but is not endorsed or certified by TMDB. Watch-availability data is provided by JustWatch via TMDB.",
    "Источник данных": "Data source",
    "Постеры, рейтинги IMDb и актёры уже встроены в каталог (источник — OMDb) и работают без ключа. TMDB нужен для раздела «Где посмотреть» и свежих описаний; без него вместо сервисов просмотра показывается «Информация о доступности сейчас не найдена».": "Posters, IMDb ratings and actors are already built into the catalogue (source: OMDb) and work without a key. TMDB is needed for the “Where to watch” section and fresh descriptions; without it, “Availability information is not found right now” is shown instead of services.",
    "Чтобы подключить TMDB, вставь свой бесплатный ключ (API Read Access Token или API Key) из <a href=\"https://www.themoviedb.org/settings/api\" target=\"_blank\" rel=\"noopener\">настроек TMDB</a>. Ключ сохраняется только в localStorage этого браузера и отправляется только на api.themoviedb.org.": "To connect TMDB, paste your free key (API Read Access Token or API Key) from the <a href=\"https://www.themoviedb.org/settings/api\" target=\"_blank\" rel=\"noopener\">TMDB settings</a>. The key is stored only in this browser's localStorage and is sent only to api.themoviedb.org.",
    "Ключ TMDB": "TMDB key",
    "eyJ… или 32 символа": "eyJ… or 32 characters",
    "Отключить": "Disconnect",
    "Сейчас: TMDB через прокси.": "Now: TMDB via proxy.",
    "Сейчас: TMDB подключён.": "Now: TMDB is connected.",
    "Сейчас: TMDB не подключён.": "Now: TMDB is not connected.",
    "Вставь ключ TMDB.": "Paste your TMDB key.",
    "Проверяем…": "Checking…",
    "Ключ не принят TMDB. Проверь, что скопирован целиком.": "TMDB did not accept the key. Check that it was copied in full.",
    "Не удалось связаться с TMDB. Проверь соединение и попробуй ещё раз.": "Could not reach TMDB. Check your connection and try again.",
    "библиотека фильмов и подбор по вайбу": "film library and discovery by vibe",
  };

  function T(s, p) {
    let r = lang === "en" && EN[s] !== undefined ? EN[s] : s;
    if (p) r = r.replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? p[k] : m));
    return r;
  }

  /** Переводит статические элементы страницы: текст (data-i18n) и атрибуты (data-i18n-attr="placeholder,aria-label"). */
  function applyStatic() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      if (el.dataset.ru === undefined) el.dataset.ru = el.innerHTML;
      el.innerHTML = T(el.dataset.ru);
    });
    document.querySelectorAll("[data-i18n-attr]").forEach((el) => {
      el.dataset.i18nAttr.split(",").forEach((a) => {
        a = a.trim();
        const k = "ru" + a.replace(/(^|-)(\w)/g, (m, x, c) => c.toUpperCase());
        if (el.dataset[k] === undefined) el.dataset[k] = el.getAttribute(a) || "";
        if (el.dataset[k]) el.setAttribute(a, T(el.dataset[k]));
        if (a === "aria-label" && el.hasAttribute("title") && el.dataset[k]) el.setAttribute("title", T(el.dataset[k]));
      });
    });
  }

  window.I18N = {
    get lang() { return lang; },
    set(l) { lang = l === "en" ? "en" : "ru"; try { localStorage.setItem(KEY, lang); } catch (e) { /* ignore */ } },
    T, EN, applyStatic,
  };
  window.T = T;
})();
