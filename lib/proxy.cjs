const fs = require('node:fs/promises');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { inside, secureUrl } = require('./util.cjs');
const {commitMods}=require('./mod-files.cjs');
function allowedDownload(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'blob:') return u.origin === 'https://modrinth.black';
    secureUrl(url); return ['cdn.modrinth.com','modrinth.black'].includes(u.hostname);
  } catch { return false; }
}
function validateJar(bytes) {
  const zip = new AdmZip(bytes);
  if (!zip.getEntries().length || !zip.test()) throw new Error('Повреждённый JAR-файл');
}
async function installProxyMods(engine, id, source, filename, metadata = {}) {
  return engine.exclusive(async () => {
    const i = engine.instance(id); if (i.loader === 'vanilla') throw new Error('Для модов нужен загрузчик');
    if ((await fs.stat(source)).size > 512 * 1024 ** 2) throw new Error('Архив модов больше 512 МБ');
    const mods = inside(engine.folder(id), 'mods'); await fs.mkdir(mods, { recursive:true });
    const files = [];
    if (filename.toLowerCase().endsWith('.jar')) { inside(mods, filename); const bytes = await fs.readFile(source); validateJar(bytes); files.push({ name:filename, bytes }); }
    else {
      const zip = new AdmZip(source); const entries = zip.getEntries();
      if (entries.length > 5000 || entries.reduce((n,e)=>n+e.header.size,0) > 1024 ** 3) throw new Error('ZIP с модами слишком большой');
      const seen = new Set();
      for (const e of entries) if (!e.isDirectory && e.entryName.toLowerCase().endsWith('.jar')) {
        inside(mods, e.entryName); const name = path.posix.basename(e.entryName);
        if (seen.has(name.toLowerCase())) throw new Error('Повторяющееся имя мода в ZIP'); seen.add(name.toLowerCase());
        if (e.header.size > 256 * 1024 ** 2) throw new Error('Мод в ZIP слишком большой');
        const bytes = e.getData(); validateJar(bytes); files.push({ name,bytes });
      }
      if (!files.length) throw new Error('В ZIP нет модов .jar. Для сборок используй .mrpack.');
    }
    await commitMods(engine,id,files,files.map(f=>({...i.mods.find(m=>m.file===f.name),...(filename.toLowerCase().endsWith('.jar')?metadata:{}),name:f.name,file:f.name,source:'modrinth.black'})));return files.length;
  });
}
module.exports = { allowedDownload, installProxyMods };

