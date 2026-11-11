// Public channel only. No user-provided URLs or Telegram account credentials.
const telegramChannel = 'starkon_24_7';
const telegramSource = 'https://t.me/' + telegramChannel;
function telegramText(html) {
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/div>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, code) => {
      const number = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
      return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : '';
    })
    .replace(/&(nbsp|amp|lt|gt|quot|apos);/gi, (_, entity) => ({nbsp:' ', amp:'&', lt:'<', gt:'>', quot:'"', apos:"'"}[entity.toLowerCase()]))
    .replace(/[ \t\u00a0]+/g, ' ').trim();
}
function telegramMessageText(block) {
  const start = /<div\b[^>]*class="[^"]*\btgme_widget_message_text\b[^"]*"[^>]*>/i.exec(block);
  if (!start) return '';
  const body = block.slice(start.index + start[0].length);
  let depth = 1;
  for (const tag of body.matchAll(/<\/?div\b[^>]*>/gi)) {
    depth += /^<\//.test(tag[0]) ? -1 : 1;
    if (!depth) return telegramText(body.slice(0, tag.index));
  }
  throw new Error('Невідомий формат повідомлення Telegram.');
}
export function parseTelegramFeed(html, now = new Date()) {
  if (!/tgme_channel_history/.test(html)) throw new Error('Публічна стрічка Telegram недоступна. Відкрий канал у Telegram.');
  const markers = [...html.matchAll(/data-post="starkon_24_7\/(\d+)"/g)];
  const posts = new Map();
  for (let i = 0; i < markers.length; i++) {
    const block = html.slice(markers[i].index, markers[i + 1]?.index ?? html.length);
    const id = markers[i][1];
    const text = telegramMessageText(block);
    const datetime = /<time\b[^>]*datetime="([^"]+)"/i.exec(block)?.[1];
    if (!text) continue; // Media-only posts stay in Telegram.
    const timestamp = Date.parse(datetime);
    if (!datetime || !Number.isFinite(timestamp)) throw new Error('Не вдалося перевірити час повідомлення Telegram.');
    posts.set(id, {id, text:text.slice(0,12000), truncated:text.length>12000, publishedAt:new Date(timestamp).toISOString(), url:telegramSource+'/'+id});
  }
  if (!posts.size) throw new Error('У публічній стрічці немає доступних текстових повідомлень. Відкрий Telegram.');
  return {channel:'Старокостянтинів 24/7', source:telegramSource, fetchedAt:now.toISOString(), posts:[...posts.values()].sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)||Number(b.id)-Number(a.id)).slice(0,20)};
}

export function filterThreatPosts(posts, now = new Date()) {
  const ordered = [...posts].sort((a,b)=>a.publishedAt.localeCompare(b.publishedAt)||Number(a.id)-Number(b.id));
  const selected = [];
  let contextAt = -Infinity;
  const cutoff = now.getTime() - 30 * 60 * 1000;
  for (const post of ordered) {
    const at = Date.parse(post.publishedAt);
    if (!Number.isFinite(at) || at < cutoff || at > now.getTime()+60000) continue;
    const text = post.text.toLocaleLowerCase('uk-UA');
    // A heuristic, not a verification of a threat or an official alarm status.
    const promo = /збір|донат|розіграш|ваканс|прода[єюм]|купити|реклам/.test(text.slice(0,180));
    const news = /вчора|минуло[їг]|минулого|за минулу|за ніч|підсум|статистик|річниц|повідомлялося|зеленськ|президент|міністр|за його словами|випробуємо|промислов|розроб[кц]|наступного року|наступного місяця|експорт/.test(text);
    if (promo || news) continue;
    const headline = text.split('\n\n')[0].trim();
    const subject = /шахед|shahed|бпла|бплa|безпілот|ракет|аеробаліст|кинджал|ціл[іьяю]/.test(headline);
    const movementWords = /летить|летять|проліта|пряму[єють]|руха[єють]|курсом|поверта[єють]|віддаля[єють]|наближа[єють]/.test(headline);
    const location = /поблизу|над\s|в районі|у районі|в напрямку|у напрямку|за\s+\d+\s*км|на\s+\S+/.test(headline);
    const alert = /повітрян.{0,15}тривог|відбій|загроза.{0,35}(баліст|ракет|бпла)|ппо працю|працює ппо|робота ппо/.test(headline);
    const explosion = /^\s*[❗️‼️⚠️🔴\s]*(?:чути\s+)?вибух[и!\.\s]/.test(headline);
    const threat = headline.length<=280 && (alert || explosion || (subject && (movementWords || location)));
    const movement = headline.length<=200 && /летить курсо|летять курсо|курс без змін/.test(headline);
    const shortContext = text.length <= 240 && at-contextAt <= 10*60*1000 &&
      /без змін|над нами|в сторону|у бік|за\s+\d+\s*км|^[\s❗️⚠️🔴]*на\s/.test(text);
    if (threat || movement || shortContext) {
      selected.push({...post, selection:shortContext&&!threat&&!movement?'context':'keywords'});
      contextAt=at;
    }
  }
  return {posts:selected.reverse(), filter:{region:'Хмельницька область', windowMinutes:30, inspected:posts.length, hidden:posts.length-selected.length, method:'keywords-and-context', officialAlarmConnected:false}};
}

let telegramCache = null;
let telegramPending = null;
export async function loadTelegramFeed() {
  if (telegramCache && Date.now() - telegramCache.at < 30000) return {...telegramCache.data,...filterThreatPosts(telegramCache.data.posts)};
  if (telegramPending) return telegramPending.then(data=>({...data,...filterThreatPosts(data.posts)}));
  telegramPending = (async () => {
    const response = await fetch('https://t.me/s/' + telegramChannel, {signal:AbortSignal.timeout(12000), redirect:'manual', headers:{Accept:'text/html'}});
    if (!response.ok) throw new Error('Telegram тимчасово не віддає повідомлення. Відкрий канал у Telegram.');
    const html = await response.text();
    if (html.length > 2500000) throw new Error('Не вдалося прочитати стрічку Telegram.');
    const data = parseTelegramFeed(html);
    telegramCache = {at:Date.now(), data};
    return data;
  })();
  try { const data = await telegramPending; return {...data,...filterThreatPosts(data.posts)}; }
  finally { telegramPending = null; }
}
