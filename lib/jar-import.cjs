const fs=require('node:fs/promises');const path=require('node:path');const crypto=require('node:crypto');const AdmZip=require('adm-zip');const {inside}=require('./util.cjs');const {commitMods}=require('./mod-files.cjs');
function inspectJar(bytes,loader){
 let zip;try{zip=new AdmZip(bytes);}catch{throw new Error('Файл не является корректным JAR/ZIP');}
 const entries=zip.getEntries();if(!entries.length || entries.length>30000 || entries.reduce((n,e)=>n+e.header.size,0)>1024**3)throw new Error('Недопустимый размер или структура JAR');
 const entry=name=>entries.find(e=>e.entryName===name && !e.isDirectory);
 let metadata;
 for(const file of loader==='quilt'?['quilt.mod.json','fabric.mod.json']:loader==='fabric'?['fabric.mod.json']:loader==='neoforge'?['META-INF/neoforge.mods.toml','META-INF/mods.toml']:['META-INF/mods.toml','mcmod.info']){
  const e=entry(file);if(!e)continue;if(e.header.size>1024**2)throw new Error('Слишком большой файл описания мода');
  const text=e.getData().toString('utf8');
  if(file.endsWith('.json') || file==='mcmod.info'){let data;try{data=JSON.parse(text);}catch{throw new Error('Повреждено описание мода: '+file);}const m=data.quilt_loader || (Array.isArray(data)?data[0]:data);metadata={modId:m?.id || m?.modid,name:m?.metadata?.name || m?.name || m?.id,version:String(m?.version || '')};}
  else{const id=text.match(/\bmodId\s*=\s*["']([^"']+)["']/)?.[1];metadata={modId:id,name:text.match(/\bdisplayName\s*=\s*["']([^"']+)["']/)?.[1] || id,version:text.match(/\bversion\s*=\s*["']([^"']+)["']/)?.[1] || ''};}
  break;
 }
 if(!metadata?.modId || !/^[a-zA-Z0-9_.-]{1,128}$/.test(metadata.modId))throw new Error('В JAR не найдено описание мода для '+loader+'. Проверьте загрузчик выбранной сборки.');
 try{if(!zip.test())throw new Error('CRC');}catch{throw new Error('JAR повреждён: проверка архива не пройдена');}
 return metadata;
}
async function importJars(engine,instanceId,paths){
 const i=engine.instance(instanceId);if(i.loader==='vanilla')throw new Error('Для JAR-модов нужна сборка Fabric, Forge, NeoForge или Quilt');
 if(!Array.isArray(paths) || !paths.length || paths.length>30)throw new Error('Выберите от 1 до 30 файлов .jar');
 const files=[],records=[],names=new Set(),ids=new Set();let total=0;
 for(const file of paths){if(typeof file!=='string' || !/\.jar$/i.test(file))throw new Error('Поддерживаются только файлы .jar');const stat=await fs.stat(file);if(!stat.isFile() || stat.size>512*1024**2 || (total+=stat.size)>1024**3)throw new Error('JAR слишком большой');const name=path.basename(file);inside(engine.root,name);if(names.has(name.toLowerCase()))throw new Error('Повторяющееся имя JAR');names.add(name.toLowerCase());
  const bytes=await fs.readFile(file),metadata=inspectJar(bytes,i.loader);if(ids.has(metadata.modId))throw new Error('В выбранных файлах две версии одного мода: '+metadata.modId);ids.add(metadata.modId);
  files.push({name,bytes});records.push({...metadata,file:name,manual:true,sha512:crypto.createHash('sha512').update(bytes).digest('hex')});
 }
 await commitMods(engine,i.id,files,records);return {count:files.length,instanceId:i.id,names:records.map(r=>r.name)};
}
module.exports={inspectJar,importJars};
