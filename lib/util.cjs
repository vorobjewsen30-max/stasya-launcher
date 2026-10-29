const path = require('node:path');
const fs = require('node:fs/promises');
function inside(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.includes(':') || relative.includes('\0') || relative.split('/').some(p => p === '..' || p === '.') || relative.startsWith('/')) throw new Error('Недопустимый путь: ' + relative);
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) throw new Error('Путь выходит за пределы сборки');
  if (relative.split('/').some(p => /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p) || /[. ]$/.test(p))) throw new Error('Недопустимое имя файла');
  return resolved;
}
function secureUrl(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password) throw new Error('Нужен HTTPS URL без логина и пароля');
  return u;
}
async function atomicJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file + '.tmp', JSON.stringify(data, null, 2)); await fs.rename(file + '.tmp', file);
}
module.exports = { inside, secureUrl, atomicJson };

