import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
let html = await readFile('web/index.html', 'utf8');
const scheduleHelpers = await readFile('web/schedule-state.js', 'utf8');
html = html.replace('/* SCHEDULE_STATE */', scheduleHelpers.replaceAll('export ', ''));
html = html.replace('/* ADVERTISEMENT */', (await readFile('web/advertisement.js','utf8')).replaceAll('$', '$$$$'));
html = html.replace('/* VISIT_TRACKER */', (await readFile('web/visit-tracker.js','utf8')).replaceAll('$', '$$$$'));
const stats = await readFile('worker/stats.js','utf8');
const adsManagerPage = await readFile('web/ads-manager.html','utf8');
const ads = await readFile('worker/ads.js','utf8');
const serviceWorkerCode = await readFile('web/sw.js', 'utf8');
const server = await readFile('worker/index.js', 'utf8');
const parser = await readFile('worker/parse.js', 'utf8');
const telegram = await readFile('worker/telegram.js', 'utf8');
const alarm = await readFile('worker/alarm.js', 'utf8');
const fuel = await readFile('worker/fuel.js', 'utf8');
const assets = {};
for (const size of [180, 192, 512]) {
  const path = '/icons/onmisto-' + size + '.png';
  assets[path] = (await readFile('web' + path)).toString('base64');
}
assets['/share/onmisto-v1.png'] = (await readFile('web/share-card.base64','utf8')).trim();
const manifest = JSON.parse(await readFile('web/manifest.webmanifest', 'utf8'));
await rm('dist', { recursive: true, force: true });
await mkdir('dist/server', { recursive: true });
const prefix = 'const adsManagerPage = ' + JSON.stringify(adsManagerPage) + ';\n' + 'const serviceWorkerCode = ' + JSON.stringify(serviceWorkerCode) + ';\n' + 'const page = ' + JSON.stringify(html) + ';\nconst appAssets = ' + JSON.stringify(assets) + ';\nconst appManifest = ' + JSON.stringify(manifest) + ';\n';
await writeFile('dist/server/index.js', prefix + stats.replace(/^import .*?;\n/gm, '') + '\n' + ads.replaceAll('export ', '') + '\n' + fuel.replaceAll('export ', '') + '\n' + alarm.replaceAll('export ', '') + '\n' + telegram.replaceAll('export ', '') + '\n' + parser.replaceAll('export ', '') + '\n' + server.replace(/^import .*?;\n/gm, ''));
