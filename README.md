# onmisto

Вебдодаток для iPhone з графіками відключень Хмельницькобленерго.

Пошук населеного пункту, вулиці й будинку на hoe.com.ua; вибір підчерги; графіки та планові роботи; таймер; темна і світла теми. Адреси зберігаються у браузері користувача. Підтримується додавання на Початковий екран через Safari → Поширити.

Дані завантажуються під час роботи застосунку. Останній успішно отриманий графік зберігається для перегляду без мережі. Фонові сповіщення не реалізовані.

## Публікація з GitHub

Потрібен Cloudflare Worker: GitHub Pages не виконує серверні запити для отримання даних HOE. Весь сайт і API працюють на одному домені Worker.

1. У Cloudflare відкрийте Workers & Pages → Create application → Import a repository.
2. Підключіть GitHub і виберіть original989/onmisto, гілку main.
3. Назва Worker: onmisto. Build command: `npm run build`. Deploy command: `npx wrangler deploy`. Root directory: `/`.
4. Після успішної публікації відкрийте видану адресу workers.dev у Safari та додайте на Початковий екран.

Cloudflare публікує оновлення після нових комітів у main. Токени та ключі не потрібно додавати до репозиторію.

## Перевірка локально

Node.js 22 або новіше:

```sh
npm run build
npm run validate
npx wrangler dev
```

## Джерело і надійність

Офіційне джерело: https://hoe.com.ua/shutdown/new та https://hoe.com.ua/page/pogodinni-vidkljuchennja. Це незалежний застосунок. Опубліковані графіки не гарантують фактичної наявності електрики; аварійні зміни можливі.

Сервер звертається лише до фіксованих маршрутів hoe.com.ua та перевіряє формат відповідей. У разі помилки застосунок показує недоступність даних. Загальний графік кешується до 120 секунд, події адреси — до 60 секунд. Автооновлення у відкритому застосунку — кожні 5 хвилин.

## Повідомлення Telegram

Вкладка «Безпека» показує останні 20 доступних дописів публічного прев’ю https://t.me/s/starkon_24_7 лише за свіжого активного обласного статусу або тривоги в частині області. Фільтру за словами, темою чи віком допису немає: новини, реклама та короткі повідомлення також відображаються. Дописи без тексту мають посилання на оригінал; фото й відео відкриваються в Telegram. Це не архів усіх дописів за тривогу: Telegram обмежує публічну сторінку, а деякі дописи можуть передувати поточній тривозі.

Серверний /api/telegram перевіряє статус через той самий loadAirRaid, що й віджет. За inactive або unknown повертає порожній масив і не запитує Telegram. Застарілий статус не вважається відбоєм. Клієнт також ховає стрічку за неактивного, невідомого або застарілого статусу. Перевірка кожні 30 секунд у відкритому розділі, серверний кеш Telegram до 30 секунд. Немає фонових push-сповіщень. Канал неофіційний; застосунок не визначає позиції цілей і не виводить статус безпеки з тексту дописів.

## Офіційний статус повітряної тривоги

Картка над вкладками показує статус для Хмельницької області, включаючи районні/місцеві тривоги. Дані: офіційне API застосунку «Повітряна тривога» https://api.ukrainealarm.com/. Доступ запитується у власника API. Після отримання ключа додайте у Cloudflare Worker → Settings → Variables and Secrets секрет `UKRAINEALARM_API_KEY`. Не додавайте ключ до GitHub або клієнтського коду.

Маршрут `/api/air-raid` отримує дерево регіонів і активні тривоги, враховує лише тип AIR та перевіряє формат. Оновлення в інтерфейсі кожні 30 секунд, поки застосунок відкритий; кеш сервера до 30 секунд. Статуси: active (область), partial (райони/громади), inactive (жодної активної повітряної тривоги за даними API), unconfigured, unknown. При помилці або даних старших за 90 секунд статус недоступний. Це не фонові push-сповіщення.

Поки ключ не додано, живий статус не підключений. Перевірки на тестових відповідях: `node --test tests/alarm.test.mjs`.

### Ubilling без ключа

Якщо секрет UKRAINEALARM_API_KEY не налаштований, /api/air-raid використовує https://ubilling.net.ua/aerialalerts/ — сторонній агрегатор. Відповідь states["Хмельницька область"].alertnow перевіряється як boolean. Цей формат не дає окремих районних/місцевих статусів: інтерфейс показує «Обласну тривогу не зафіксовано», а не стверджує відсутність усіх місцевих тривог. Джерело показано прямо в картці.

cachedat інтерпретується за Europe/Kyiv (зіставлено з живою відповіддю сервера); якщо формат/часова зона зміняться, дані будуть відхилені як невідомі чи застарілі. Дані старші за 120 секунд або з майбутнього (>30 секунд) не використовуються. changed не є часом отримання даних. Серверний кеш до 30 секунд, запити об’єднуються, помилки не показуються як відбій. Власник сервісу вказує ліміт 2 запити/с на хост: https://wiki.ubilling.net.ua/doku.php?id=aerialalertsapi.

## Збережений графік та зміни

Після успішного отримання погодинного графіка браузер зберігає його в localStorage на цьому пристрої. Час отримання показується в офлайн-банері. Помилки джерела не перезаписують збережений графік. Останні перевірені події доданих адрес також зберігаються і позначаються як попередні до повторної перевірки.

Service Worker /sw.js зберігає лише оболонку сайту, manifest та іконки, щоб відкрити її без мережі після першого успішного завантаження онлайн. Усі /api/* виключені з кешування; зокрема стан тривоги та Telegram ніколи не відновлюються з цього кешу. Позначка «доступний офлайн» з’являється після встановлення оболонки й успішного збереження графіка. Safari може очистити дані сайту, тому збереження не є постійною гарантією доступу.

Зміни визначаються для тієї самої дати й підчерги між двома успішними завантаженнями на цьому пристрої, з точністю до хвилини. Новий день, перше завантаження та розбиття однакового інтервалу не вважаються зміною. Змінені години виділено синьою рамкою та крапкою; «Що змінилось?» показує додані й прибрані відключення. «Зрозуміло» прибирає позначки. Порівнюється погодинний графік, а не історія подій адреси.

Перевірки: node --test tests/*.test.mjs. Повне відкриття офлайн у Safari на iPhone потрібно перевірити після встановлення нової версії з мережею.

## Дизель UPG у Славуті

Поруч із віджетом тривоги — віджет звичайного EURO DIESEL на конкретній АЗК №502: Славута, вул. Приміська, 2-Г. Сервер /api/fuel отримує офіційну карту https://upg.ua/merezha_azk/, без виконання скриптів витягує JSON objmap, перевіряє id 524, адресу в Славуті, Active, тип пального id 5 / EURO DIESEL, ціну й LastPriceUpdateDate. Середні ціни області та преміальний upgDIESEL не підставляються.

У віджеті — дата ціни, у деталях — час перевірки та джерело. Кеш сервера до 30 хв, перевірка у відкритому застосунку кожні 15 хв, є ручне оновлення. Помилка джерела не замінюється нульовою ціною; попередня ціна позначається. Знижки лояльності не враховано. Розклад цін залежить від UPG; підтвердження джерела — дані конкретної АЗК, а не гарантія ціни на колонці.

## Автоперемикання пального та зміна за добу

Віджет перемикає всі доступні види пального конкретної АЗК кожні 8 секунд, поки сторінка видима. Клавіатурний фокус на віджеті та відкритий діалог призупиняють автоперемикання. Назва пального перемикає його вручну, «Усі ціни» відкриває повний список. Спочатку показується EURO DIESEL.

data/fuel-history.json містить фактично отримані добові знімки цієї АЗК, до 62 днів. Workflow .github/workflows/fuel-history.yml робить один вечірній знімок близько 23:55 за Києвом, враховує літній/зимовий час; GitHub може затримувати запуски. Перший знімок — день увімкнення функції, заднім числом ціни не створюються. Зміна обчислюється в цілих копійках для того самого id і назви пального відносно останнього збереженого знімка саме попереднього київського календарного дня. Якщо його немає, показується «Немає ціни за вчора». Це не порівняння із середньою ціною або з попереднім відкриттям додатка.

Workflow використовує тільки GITHUB_TOKEN поточного репозиторію з contents:write і не потребує додаткових ключів. Історія читається Worker з публічного raw-файлу GitHub, кеш до 30 хв. Помилка історії не блокує поточні ціни.

## Advertisement management

Open `/ads-manager` on the live Worker. The owner supplies a fine-grained GitHub token scoped only to `original989/onmisto`, Contents: read and write. The token is kept only in page memory and sent through the fixed same-origin /api/ad-management endpoint to api.github.com; never commit it, put it in a URL, or send it in chat. Reloading or leaving the page requires reconnecting. The manager reads and updates `data/ads.json` on main through the server proxy to GitHub's Contents API, using the current file SHA to reject concurrent edits. Images are resized in the browser and stored as JPEG data URLs in the same file (no external image tracking). Ads and their edit history are public repository content.

The public `/api/advertisement` reads validated data from the fixed GitHub raw URL, cached for 60 seconds. Open clients refresh it every 20 seconds and on returning to the page. The card is labelled Реклама and links use sponsored/noopener/noreferrer. Missing or invalid source data displays an empty ad placement, never a stale campaign. The manager is not linked in visitor navigation, but is public; write authorization is enforced by GitHub, not by hiding its URL. No Cloudflare secret or paid database is required. Local checks: `npm run build && npm run validate && node --test tests/ads.test.mjs`.

The advertisement now appears directly below the Light/Safety tabs. Owner controls include Show/Hide, edit/save, Delete with confirmation, and a live publication check. Save success is distinguished from a public delivery check. A revision-specific public check bypasses an earlier in-memory snapshot. Deletion clears the current card; earlier versions remain in Git history.

## Visitor statistics

Owner analytics are in `/ads-manager` after signing in with the existing GitHub token. `/api/visitor-stats` verifies the token with GitHub `/user` and requires login original989; another account cannot read metrics. Owner verification hashes are cached for at most 60 seconds. The browser sends `/api/visit` while visible, once on open and then every minute. A browser-local random visitor ID and a shared 30-minute session ID are SHA-256 hashed on the Worker before persistence. Visits also reset at the Kyiv calendar day boundary. Respect Do Not Track; disabled storage or scripts, bot filtering, network failures, browser data clearing and multiple devices affect counts. These are estimated browsers, not identified people. No IPs, addresses, full referrer URLs or raw user-agent strings are stored by this feature.

`VisitStats` is a SQLite-backed Cloudflare Durable Object, bound as VISIT_STATS and provisioned with migration `onmisto-visits-v1`. Deployment uses Wrangler. Its schema stores per-session records with coarsened device/source categories; records older than the 30-day window are pruned on the next request. SQL provides distinct visitors and visits for today, 7 and 30 days; active means a heartbeat within the last 5 minutes. Source categories may be unknown when apps omit referrer information. No history before first collection is reconstructed. Tests use real in-memory SQLite: `node --test tests/stats.test.mjs`.

## Advertisement analytics

`/api/ad-event` accepts only same-origin POSTs with a browser/session pseudonym, event kind and current active campaign ID. The server derives the campaign ID from normalized banner content and validates it against the current ad; arbitrary titles and stale campaigns are not recorded. IDs reuse the visit pseudonyms and DNT setting. An impression requires at least 50% intersection for one continuous second while visible, or an actual click. Counts are unique per Kyiv day, session and campaign; repeat rendering and clicks are deduplicated. A click atomically implies an impression, keeping CTR bounded. Metrics are approximate and can miss blocked scripts or failed requests. Banner changes create a distinct campaign, hiding/showing the same content keeps its history. Up to 30 days of aggregate/session events are retained in the existing SQLite Durable Object, with per-campaign title, impressions, clicks, viewers and CTR shown only in the owner dashboard. No public statistics endpoint or third-party tracking pixel is used. Cloudflare fetch authentication uses redirect:manual (redirect:error is unsupported).
