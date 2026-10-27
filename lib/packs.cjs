const fs = require('node:fs/promises');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { inside, atomicJson, secureUrl } = require('./util.cjs');
const { download } = require('./network.cjs');
function validateIndex(index) {
  if (index.formatVersion !== 1 || index.game !== 'minecraft' || !index.dependencies?.minecraft || !Array.isArray(index.files)) throw new Error('Неподдерживаемый формат .mrpack');
  if (index.files.length > 10000) throw new Error('Слишком много файлов в сборке');
  const allowed = ['minecraft', 'fabric-loader', 'quilt-loader', 'forge', 'neoforge'];
  for (const [dep,value] of Object.entries(index.dependencies)) {
    if (!allowed.includes(dep)) throw new Error('Неподдерживаемая зависимость: ' + dep);
    if (typeof value !== 'string' || !/^[a-zA-Z0-9.+_-]{1,100}$/.test(value)) throw new Error('Некорректная версия зависимости: ' + dep);
  }
  if (Object.keys(index.dependencies).length > 2) throw new Error('Несколько загрузчиков в одном пакете не поддерживаются');
  const seen = new Set();
  for (const f of index.files) {
    inside(path.resolve('validation'), f.path);
    if (seen.has(f.path.toLowerCase())) throw new Error('Повторяющийся путь: ' + f.path); seen.add(f.path.toLowerCase());
    if (!f.hashes || !(/^[a-f0-9]{128}$/i.test(f.hashes.sha512 || '') || /^[a-f0-9]{40}$/i.test(f.hashes.sha1 || ''))) throw new Error('Отсутствует хеш файла: ' + f.path);
    if (!Array.isArray(f.downloads) || !f.downloads.length) throw new Error('Нет адреса файла: ' + f.path);
    for (const u of f.downloads) secureUrl(u);
    if (f.fileSize < 0 || f.fileSize > 2 * 1024 ** 3) throw new Error('Недопустимый размер файла');
  }
  return index;
}
async function importPack(file, destination, settings, report) {
  if ((await fs.stat(file)).size > 512 * 1024 ** 2) throw new Error('Архив .mrpack больше 512 МБ');
  const zip = new AdmZip(file);
  const entries = zip.getEntries();
  if (entries.length > 20000 || entries.reduce((sum, e) => sum + e.header.size, 0) > 4 * 1024 ** 3) throw new Error('Архив слишком большой');
  const indexEntry = zip.getEntry('modrinth.index.json');
  if (!indexEntry || indexEntry.header.size > 8 * 1024 ** 2) throw new Error('Нет корректного modrinth.index.json');
  const index = validateIndex(JSON.parse(indexEntry.getData().toString('utf8')));
  const overrides = [];
  for (const prefix of ['overrides/', 'client-overrides/']) for (const e of entries) {
    if (!e.isDirectory && e.entryName.startsWith(prefix)) {
      const relative = e.entryName.slice(prefix.length); inside(destination, relative);
      const mode = e.attr >>> 16; if ((mode & 0xf000) === 0xa000) throw new Error('Символические ссылки в архиве запрещены');
      overrides.push([relative, e]);
    }
  }
  await fs.mkdir(destination, { recursive: true });
  const files = index.files.filter(f => f.env?.client !== 'unsupported');
  // Optional client files are deliberately installed; unsupported files are skipped.
  let done = 0;
  const queue = [...files];
  const results = await Promise.allSettled(Array.from({ length: Math.min(4, files.length) }, async () => {
    while (queue.length) { const f = queue.shift(); await download(f.downloads, inside(destination, f.path), f.hashes, settings, p => report({ phase: 'Файлы сборки', detail: f.path, current: done, total: files.length, ...p })); report({ phase: 'Файлы сборки', current: ++done, total: files.length }); }
  }));
  const failed = results.find(r => r.status === 'rejected'); if (failed) throw failed.reason;
  for (const [relative, e] of overrides) { const target = inside(destination, relative); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, e.getData()); }
  await atomicJson(path.join(destination, '.stasya-pack.json'), { name: index.name, version: index.versionId, files: files.map(f => f.path) });
  return index;
}
module.exports = { validateIndex, importPack };

