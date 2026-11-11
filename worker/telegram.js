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
let telegramCache = null;
let telegramPending = null;
export async function loadTelegramFeed() {
  if (telegramCache && Date.now() - telegramCache.at < 30000) return telegramCache.data;
  if (telegramPending) return telegramPending;
  telegramPending = (async () => {
    const response = await fetch('https://t.me/s/' + telegramChannel, {signal:AbortSignal.timeout(12000), redirect:'error', headers:{Accept:'text/html'}});
    if (!response.ok) throw new Error('Telegram тимчасово не віддає повідомлення. Відкрий канал у Telegram.');
    const html = await response.text();
    if (html.length > 2500000) throw new Error('Не вдалося прочитати стрічку Telegram.');
    const data = parseTelegramFeed(html);
    telegramCache = {at:Date.now(), data};
    return data;
  })();
  try { return await telegramPending; }
  finally { telegramPending = null; }
}
