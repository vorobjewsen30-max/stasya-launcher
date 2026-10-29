const fs=require('node:fs/promises');const path=require('node:path');const crypto=require('node:crypto');const {inside}=require('./util.cjs');
const folders={mod:'mods',resourcepack:'resourcepacks',shader:'shaderpacks'};
async function commitMods(engine,id,files,records) {
 const i=engine.instance(id),root=engine.folder(id),names=new Set(),touched=new Set(),replaced=[];
 const field=entry=>{const f=folders[entry.contentType || 'mod'];if(!f)throw new Error('Неизвестный тип файла');return f;};
 for(const f of files){const directory=field(f),key=directory+'/'+f.name;inside(root,key);if(f.name.includes('/') || names.has(key.toLowerCase()))throw new Error('Повторяющееся имя файла мода');names.add(key.toLowerCase());await fs.mkdir(inside(root,directory),{recursive:true});touched.add(key);touched.add(key+'.disabled');}
 for(const record of records){const directory=field(record),old=(i[directory] || []).find(m=>m.project && m.project===record.project);if(old && old.file!==record.file){const key=directory+'/'+old.file;inside(root,key);replaced.push(key);touched.add(key);touched.add(key+'.disabled');}}
 const previous=Object.fromEntries(Object.values(folders).map(f=>[f,Array.isArray(i[f])?i[f].map(m=>({...m})):undefined]));
 const backup=inside(engine.root,'downloads/rollback-'+crypto.randomUUID());await fs.mkdir(backup,{recursive:true});const saved=[];let mutated=false,retainBackup=false;
 try{
  for(const [n,key]of [...touched].entries()){const target=inside(root,key),copy=path.join(backup,String(n));let exists=true;try{await fs.copyFile(target,copy);}catch(e){if(e.code!=='ENOENT')throw e;exists=false;}saved.push({target,copy,exists});}
  mutated=true;for(const key of replaced)await fs.rename(inside(root,key),inside(root,key+'.disabled')).catch(e=>{if(e.code!=='ENOENT')throw e;});
  for(const f of files){const target=inside(root,field(f)+'/'+f.name);if(f.source)await fs.copyFile(f.source,target);else await fs.writeFile(target,f.bytes);await fs.rm(target+'.disabled',{force:true});}
  for(const directory of Object.values(folders)){const updates=records.filter(r=>field(r)===directory);if(!updates.length)continue;i[directory]=(i[directory] || []).filter(m=>!updates.some(r=>r.file===m.file || (r.project && r.project===m.project)));i[directory].push(...updates);}
  await engine.save();
 }catch(e){
  for(const [key,value]of Object.entries(previous)){if(value===undefined)delete i[key];else i[key]=value;}
  let rollbackError;if(mutated)for(const entry of saved){try{if(entry.exists)await fs.copyFile(entry.copy,entry.target);else await fs.rm(entry.target,{force:true});}catch(error){rollbackError=error;}}
  if(rollbackError){retainBackup=true;throw new Error('Не удалось полностью восстановить моды. Резервные копии сохранены в '+backup,{cause:e});}throw e;
 }finally{if(!retainBackup)await fs.rm(backup,{recursive:true,force:true,maxRetries:5,retryDelay:100}).catch(()=>engine.report({kind:'log',text:'Временные резервные копии остались в '+backup}));}
}
module.exports={commitMods};
