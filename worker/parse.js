export const sourceUrl = 'https://hoe.com.ua/shutdown/new';
export const scheduleUrl = 'https://hoe.com.ua/page/pogodinni-vidkljuchennja';
const months = ['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'];
export function textOnly(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?\s*>|<\/(?:p|div|tr|h[1-6])>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => String.fromCodePoint(code[0].toLowerCase() === 'x' ? parseInt(code.slice(1),16) : Number(code)))
    .replace(/&(nbsp|amp|lt|gt|quot|apos|ndash|mdash);/gi, (_, entity) => ({nbsp:' ',amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",ndash:'–',mdash:'—'}[entity.toLowerCase()]))
    .replace(/[ \t\u00a0]+/g, ' ').trim();
}
export function kyivDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Kyiv', year:'numeric', month:'2-digit', day:'2-digit'}).format(now);
}
export function mergeIntervals(intervals) {
  const merged=[];
  for (const [start,end] of intervals.toSorted((a,b)=>a[0]-b[0])) {
    const last=merged.at(-1);
    if (last && start<=last[1]) last[1]=Math.max(last[1],end);
    else merged.push([start,end]);
  }
  return merged;
}
export function parseSchedules(html, now = new Date()) {
  const days=[];
  const reference = new Date(kyivDate(now) + 'T12:00:00Z');
  for (const block of html.split(/<hr\b[^>]*>/i)) {
    const text=textOnly(block);
    const date=text.match(/(?:Укренерго[»”"\s]*|на)\s*(\d{1,2})\s+(січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)(?:\s+(20\d{2}))?/i);
    if (!date || !/Підчерга/i.test(text)) continue;
    const month=months.indexOf(date[2].toLowerCase());
    const year=date[3] ? Number(date[3]) : reference.getUTCFullYear();
    const candidates=(date[3]?[year]:[year-1,year,year+1]).map(y=>new Date(Date.UTC(y,month,Number(date[1]))));
    candidates.sort((a,b)=>Math.abs(a-reference)-Math.abs(b-reference));
    const dateKey=candidates[0].toISOString().slice(0,10);
    const queues={};
    for (const row of text.matchAll(/Підчерга\s+([1-6]\.[12])\s*[–—−-]\s*([^\n]+)/gi)) {
      const intervals=[];
      for (const interval of row[2].matchAll(/(\d{1,2}):(\d{2})\s*[–—−-]\s*(\d{1,2}):(\d{2})/g)) {
        const [sh,sm,eh,em]=interval.slice(1).map(Number);
        const start=sh*60+sm, end=eh*60+em;
        if (sm>59 || em>59 || sh>23 || eh>24 || end>1440 || start>=end) throw new Error('Невідомий формат годин у джерелі.');
        intervals.push([start,end]);
      }
      if (!intervals.length) throw new Error('Не вдалося прочитати години відключень.');
      queues[row[1]]=mergeIntervals(intervals);
    }
    if (Object.keys(queues).length !== 12) throw new Error('У джерелі неповний графік підчерг.');
    if (!days.some(day=>day.date===dateKey)) days.push({date:dateKey,queues});
  }
  if (!days.length) throw new Error('Не вдалося розпізнати графік на сайті обленерго.');
  return { days:days.sort((a,b)=>a.date.localeCompare(b.date)), source:scheduleUrl, fetchedAt:now.toISOString(), today:kyivDate(now) };
}
function parseLocalDate(value) {
  const match=value.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) throw new Error('Змінився формат часу відключень за адресою.');
  const [,day,month,year,hour,minute]=match;
  if (+month<1 || +month>12 || +day<1 || +day>31 || +hour>23 || +minute>59) throw new Error('Некоректна дата в джерелі.');
  return year+'-'+month+'-'+day+'T'+hour+':'+minute;
}
export function parseEvents(html) {
  const events=[];
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell=>textOnly(cell[1]));
    if (!cells.length) continue;
    if (cells.length!==6) throw new Error('Змінилася таблиця відключень за адресою.');
    const [work,type,queue,emergencyQueue,from,to]=cells;
    const start=parseLocalDate(from), end=parseLocalDate(to);
    if (end<start) throw new Error('Некоректний інтервал відключення.');
    events.push({work,type,queue,emergencyQueue,start,end});
  }
  const note=textOnly(html);
  if (!events.length && !/table-shutdowns|відсутн|немає|не запланован|не знайден|не зареєстрован/i.test(html)) throw new Error('Відповідь про відключення має невідомий формат.');
  return {events, note:events.length?'':note.slice(0,1000)};
}
export function parseQueues(html) {
  const text=textOnly(html);
  if (!/ГПВ|погодинн|не знайден|відсутн/i.test(text)) throw new Error('Не вдалося визначити чергу будинку.');
  const hourly=text.match(/(?:ГПВ[)\s]*|погодинних відключень)[\s\S]*?підчерги\s*:\s*([^\n]+)/i);
  return [...new Set((hourly?.[1]||'').match(/[1-6]\.[12]/g)||[])];
}
