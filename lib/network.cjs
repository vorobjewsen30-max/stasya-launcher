const fs = require('node:fs/promises');
const { createWriteStream, createReadStream } = require('node:fs');
const { pipeline } = require('node:stream/promises');
const { Readable, Transform } = require('node:stream');
const crypto = require('node:crypto');
const path = require('node:path');
const { secureUrl } = require('./util.cjs');
const UA = 'StasyaLauncher/' + require('../package.json').version;
let transport;
function setFetch(fn) { transport = fn; }
async function authResponse(url, options = {}) {
  secureUrl(url);
  return (transport || fetch)(url, { ...options, redirect:'error', signal:options.signal || AbortSignal.timeout(30000) });
}
async function request(url, settings = {}, options = {}) {
  let current = secureUrl(url).href;
  for (let n = 0; n < 6; n++) {
    secureUrl(current);
    const response = await (transport || fetch)(current, { ...options, headers: { 'User-Agent': UA, ...options.headers }, redirect: 'manual', signal: options.signal || AbortSignal.timeout(45000) });
    if ([301,302,303,307,308].includes(response.status)) { current = new URL(response.headers.get('location'), current).href; await response.body?.cancel(); continue; }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Сервер ${new URL(current).hostname}: HTTP ${response.status}`); }
    if (response.url) secureUrl(response.url);
    return response;
  }
  throw new Error('Слишком много перенаправлений');
}
async function json(url, settings, options = {}) {
  let last;
  for (let attempt=0;attempt<(options.attempts || 3);attempt++) try { return await (await request(url, settings, { signal: AbortSignal.timeout(options.timeout || 20000) })).json(); } catch(e) { last=e; }
  throw new Error(`Не удалось получить данные ${new URL(url).hostname}: ${last.message}`);
}
async function hashFile(file, algorithm) { const h = crypto.createHash(algorithm); for await (const b of createReadStream(file)) h.update(b); return h.digest('hex'); }
async function download(urls, file, hashes = {}, settings = {}, progress = () => {}, maxBytes = 2 * 1024 ** 3) {
  const algorithm = hashes.sha512 ? 'sha512' : hashes.sha256 ? 'sha256' : hashes.sha1 ? 'sha1' : null;
  if (algorithm && await hashFile(file, algorithm).catch(() => '') === hashes[algorithm]) return;
  await fs.mkdir(path.dirname(file), { recursive: true });
  let last;
  for (const url of Array.isArray(urls) ? urls : [urls]) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const tmp = file + '.part';
      try {
        const response = await request(url, settings); const total = Number(response.headers.get('content-length')) || 0; let count = 0; let lastEvent = 0;
        if (total > maxBytes) { await response.body.cancel(); throw new Error('Файл слишком большой'); }
        const meter = new Transform({ transform(chunk, _, cb) { count += chunk.length; if (count > maxBytes) return cb(new Error('Файл слишком большой')); if (Date.now() - lastEvent > 180) { progress({ bytes: count, total }); lastEvent = Date.now(); } cb(null, chunk); } });
        await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(tmp));
        if (algorithm && await hashFile(tmp, algorithm) !== hashes[algorithm]) throw new Error('Контрольная сумма не совпала: ' + path.basename(file));
        await fs.rename(tmp, file); progress({ bytes: count, total: count }); return;
      } catch (e) { last = e; await fs.rm(tmp, { force: true }); }
    }
  }
  throw new Error(last ? `Не скачан ${path.basename(file)}: ${last.message}` : 'Нет адресов скачивания', { cause:last });
}
module.exports = { json, download, hashFile, setFetch, authResponse };


