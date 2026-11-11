import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
let html = await readFile('web/index.html', 'utf8');
const scheduleHelpers = await readFile('web/schedule-state.js', 'utf8');
html = html.replace('/* SCHEDULE_STATE */', scheduleHelpers.replaceAll('export ', ''));
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
const manifest = JSON.parse(await readFile('web/manifest.webmanifest', 'utf8'));
await rm('dist', { recursive: true, force: true });
await mkdir('dist/server', { recursive: true });
const prefix = 'const serviceWorkerCode = ' + JSON.stringify(serviceWorkerCode) + ';\n' + 'const page = ' + JSON.stringify(html) + ';\nconst appAssets = ' + JSON.stringify(assets) + ';\nconst appManifest = ' + JSON.stringify(manifest) + ';\n';
await writeFile('dist/server/index.js', prefix + fuel.replaceAll('export ', '') + '\n' + alarm.replaceAll('export ', '') + '\n' + telegram.replaceAll('export ', '') + '\n' + parser.replaceAll('export ', '') + '\n' + server.replace(/^import .*?;\n/gm, ''));
