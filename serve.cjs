// ローカル確認専用。アプリ本体はNode.jsに依存しません。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/manifest.webmanifest', ['manifest.webmanifest', 'application/manifest+json; charset=utf-8']],
  ['/service-worker.js', ['service-worker.js', 'text/javascript; charset=utf-8']],
  ['/scripts/pwa.js', ['scripts/pwa.js', 'text/javascript; charset=utf-8']],
  ['/icons/icon-192.png', ['icons/icon-192.png', 'image/png']],
  ['/icons/icon-512.png', ['icons/icon-512.png', 'image/png']],
  ['/icons/apple-touch-icon.png', ['icons/apple-touch-icon.png', 'image/png']],
  ['/styles/main.css', ['styles/main.css', 'text/css; charset=utf-8']],
  ['/scripts/app.js', ['scripts/app.js', 'text/javascript; charset=utf-8']],
  ['/scripts/records.js', ['scripts/records.js', 'text/javascript; charset=utf-8']],
  ['/scripts/date-time.js', ['scripts/date-time.js', 'text/javascript; charset=utf-8']],
  ['/scripts/db.js', ['scripts/db.js', 'text/javascript; charset=utf-8']],
  ['/scripts/backup.js', ['scripts/backup.js', 'text/javascript; charset=utf-8']],
  ['/scripts/backup-ui.js', ['scripts/backup-ui.js', 'text/javascript; charset=utf-8']],
  ['/scripts/week.js', ['scripts/week.js', 'text/javascript; charset=utf-8']],
  ['/print.html', ['print.html', 'text/html; charset=utf-8']],
  ['/scripts/print.js', ['scripts/print.js', 'text/javascript; charset=utf-8']],
  ['/styles/print.css', ['styles/print.css', 'text/css; charset=utf-8']],
]);
// テスト用ページは専用ポートで明示的に起動した場合だけ配信する。
if (process.env.ACTIVITY_MOOD_PORT === '4174') {
  for (const name of ['phase8.html', 'phase8.js', 'phase8-frame.html', 'phase8-isolation.js', 'phase8-chrome.html', 'phase8-chrome.js']) files.set(`/tests/${name}`, [`tests/${name}`, name.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8']);
  files.set('/tests/phase7.html', ['tests/phase7.html', 'text/html; charset=utf-8']);
  files.set('/tests/phase7.js', ['tests/phase7.js', 'text/javascript; charset=utf-8']);
  files.set('/tests/phase6.html', ['tests/phase6.html', 'text/html; charset=utf-8']);
  files.set('/tests/phase6.js', ['tests/phase6.js', 'text/javascript; charset=utf-8']);
  files.set('/tests/phase3.html', ['tests/phase3.html', 'text/html; charset=utf-8']);
  files.set('/tests/phase3.js', ['tests/phase3.js', 'text/javascript; charset=utf-8']);
  files.set('/tests/print-sample.html', ['tests/print-sample.html', 'text/html; charset=utf-8']);
  files.set('/tests/print-sample.js', ['tests/print-sample.js', 'text/javascript; charset=utf-8']);
}
const server = http.createServer((req, res) => {
  if (process.env.ACTIVITY_MOOD_PORT === '4174' && req.url === '/tests/phase8-hold.svg' && req.method === 'GET') {
    setTimeout(() => { res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' }); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'); }, 15000);
    return;
  }
  const file = files.get(req.url.split('?')[0]);
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(path.join(__dirname, file[0]), (error, data) => {
    if (error) { console.error(error); res.writeHead(500); res.end('Cannot read file'); return; }
    res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});
server.on('error', (error) => { console.error('起動できません:', error.message); process.exitCode = 1; });
const port = Number(process.env.ACTIVITY_MOOD_PORT || 4173);
server.listen(port, '127.0.0.1', () => console.log(`行動・気分記録: http://127.0.0.1:${port}`));
