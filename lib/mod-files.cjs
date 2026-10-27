const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {inside}=require('./util.cjs');
// Caller holds Engine.exclusive. Keep both mod files and metadata on the old
// version if a copy, rename or state save fails partway through an update.
async function commitMods(engine,id,files,records) {
  const i=engine.instance(id),mods=path.join(engine.folder(id),'mods');await fs.mkdir(mods,{recursive:true});
  const names=new Set();for(const f of files){inside(mods,f.name);if(f.name.includes('/') || names.has(f.name.toLowerCase()))throw new Error('Повторяющееся имя файла мода');names.add(f.name.toLowerCase());}
  const replaced=[];
  for(const record of records)if(record.project){const old=i.mods.find(m=>m.project===record.project);if(old && old.file!==record.file)replaced.push(old.file);}
  const touched=[...new Set([...files.map(f=>f.name),...replaced,...replaced.map(n=>n+'.disabled')])];
  const backup=inside(engine.root,'downloads/rollback-'+crypto.randomUUID());await fs.mkdir(backup,{recursive:true});
  const saved=[],previous=i.mods.map(m=>({...m}));let mutated=false,retainBackup=false;
  try{
    for(const [n,name]of touched.entries()){
      const target=inside(mods,name),copy=path.join(backup,String(n));let exists=true;
      try{await fs.copyFile(target,copy);}catch(e){if(e.code!=='ENOENT')throw e;exists=false;}saved.push({target,copy,exists});
    }
    mutated=true;
    for(const old of replaced)await fs.rename(inside(mods,old),inside(mods,old+'.disabled')).catch(e=>{if(e.code!=='ENOENT')throw e;});
    for(const f of files){const target=inside(mods,f.name);if(f.source)await fs.copyFile(f.source,target);else await fs.writeFile(target,f.bytes);}
    i.mods=i.mods.filter(m=>!records.some(r=>r.file===m.file || (r.project && r.project===m.project)));i.mods.push(...records);await engine.save();
  }catch(e){
    i.mods=previous;
    let rollbackError;
    if(mutated)for(const entry of saved){try{if(entry.exists)await fs.copyFile(entry.copy,entry.target);else await fs.rm(entry.target,{force:true});}catch(error){rollbackError=error;}}
    if(rollbackError){retainBackup=true;throw new Error('Не удалось полностью восстановить моды. Резервные копии сохранены в '+backup,{cause:e});}
    throw e;
  }finally{if(!retainBackup)await fs.rm(backup,{recursive:true,force:true,maxRetries:5,retryDelay:100}).catch(()=>engine.report({kind:'log',text:'Временные резервные копии остались в '+backup}));}
}
module.exports={commitMods};

