const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const crypto=require('node:crypto');const AdmZip=require('adm-zip');
const {getLaunchState}=require('../ui/launch-state.js');const {Engine:BaseEngine}=require('../lib/engine.cjs');const {commitMods}=require('../lib/mod-files.cjs');
const Engine=BaseEngine;
const {createPkce,parseCallback,MicrosoftAuth,MicrosoftSession}=require('../lib/microsoft.cjs');const {MICROSOFT_CLIENT_ID,MICROSOFT_REDIRECT_URI}=require('../lib/config.cjs');
test('launch requirements explain missing or stale selections and prioritize ongoing work',()=>{
  const s={accounts:[],instances:[],selectedAccount:'stale',selectedInstance:'stale'};
  assert.equal(getLaunchState(s).action,'account');assert.match(getLaunchState(s).hint,/Microsoft/);
  s.accounts=[{id:'a',name:'Stasya',type:'microsoft',licenseVerified:true}];s.selectedAccount='a';assert.equal(getLaunchState(s).action,'instance');
  s.instances=[{id:'i',name:'Test'}];s.selectedInstance='i';assert.equal(getLaunchState(s).disabled,false);
  s.busy=true;s.operation='Вход Microsoft';assert.equal(getLaunchState(s).hint,'Вход Microsoft');assert.equal(getLaunchState(s).disabled,true);
  s.running=true;s.busy=false;assert.equal(getLaunchState(s).disabled,false);s.stopping=true;assert.equal(getLaunchState(s).disabled,true);
});
test('OAuth PKCE uses unique random verifier/state and validates exact callback origin',()=>{
  const a=createPkce(),b=createPkce();assert.notEqual(a.verifier,b.verifier);assert.notEqual(a.state,b.state);assert.equal(crypto.createHash('sha256').update(a.verifier).digest('base64url'),a.challenge);
  assert.equal(parseCallback(MICROSOFT_REDIRECT_URI+'?state='+a.state+'&code=valid',a.state),'valid');
  assert.equal(parseCallback('https://evil.example/oauth20_desktop.srf?state='+a.state+'&code=bad',a.state),null);
  assert.throws(()=>parseCallback(MICROSOFT_REDIRECT_URI+'?state=bad&code=x',a.state),/Проверка/);
  assert.throws(()=>parseCallback(MICROSOFT_REDIRECT_URI+'?state='+a.state+'&error=access_denied',a.state),/отменён/);
});
test('incompatible token caches require a fresh login',async()=>{
  const auth=new MicrosoftAuth();await assert.rejects(auth.refresh('old-refresh-token'),/старой версии/);await assert.rejects(auth.refresh(JSON.stringify({schema:1,clientId:'wrong'})),/изменилось/);
  assert.equal(auth.clientId,MICROSOFT_CLIENT_ID);
});
test('Microsoft/Xbox exchange returns real profile, keeps auth requests out of proxy and disables redirects',async()=>{
  const previous=global.fetch,calls=[];const responses=[{Token:'xbox'},{Token:'xsts',DisplayClaims:{xui:[{uhs:'hash'}]}},{access_token:'mc-secret'},{items:[{name:'game_minecraft'}]},{id:'a'.repeat(32),name:'Stasya'}];
  try{
    global.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(responses.shift()),{status:200});};
    const fakeClient={getTokenCache:()=>({serialize:()=>'{"private":"cache"}'})};const s=new MicrosoftSession(fakeClient,{accessToken:'ms-secret',account:{homeAccountId:'home'}},()=>{},MICROSOFT_CLIENT_ID);
    const mc=await s.getMinecraft();assert.equal(mc.mclc().name,'Stasya');assert.equal(mc.mclc().access_token,'mc-secret');assert.equal(calls.length,5);
    assert.ok(calls.every(c=>c.options.redirect==='error'));assert.match(calls[0].options.body,/d=ms-secret/);assert.equal(calls[4].options.headers.Authorization,'Bearer mc-secret');assert.equal(JSON.parse(s.save()).clientId,MICROSOFT_CLIENT_ID);
  }finally{global.fetch=previous;}
});
test('unapproved Minecraft application reports actionable error and never invents a license',async()=>{
  const previous=global.fetch;let n=0;
  try{global.fetch=async()=>new Response(JSON.stringify(++n===1?{Token:'x'}:n===2?{Token:'x',DisplayClaims:{xui:[{uhs:'h'}]}}:{error:'Invalid app registration'}),{status:n===3?403:200});
    const s=new MicrosoftSession({}, {accessToken:'test'},()=>{},MICROSOFT_CLIENT_ID);await assert.rejects(s.getMinecraft(),/одобрение Mojang/);
  }finally{global.fetch=previous;}
});
test('partial mod update restores files, disabled versions and metadata on state save failure',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stasya-rollback-'));
  try{const e=new Engine(dir,()=>{},{});await e.init();e.state.instances.push({id:'i',loader:'fabric',mods:[{project:'p',file:'old.jar'}]});const mods=path.join(e.folder('i'),'mods');await fs.mkdir(mods,{recursive:true});await fs.writeFile(path.join(mods,'old.jar'),'old');await fs.writeFile(path.join(mods,'old.jar.disabled'),'older-disabled');e.save=async()=>{throw new Error('Disk failure');};
    await assert.rejects(commitMods(e,'i',[{name:'new.jar',bytes:Buffer.from('new')}],[{project:'p',file:'new.jar'}]),/Disk failure/);
    assert.equal(await fs.readFile(path.join(mods,'old.jar'),'utf8'),'old');assert.equal(await fs.readFile(path.join(mods,'old.jar.disabled'),'utf8'),'older-disabled');await assert.rejects(fs.access(path.join(mods,'new.jar')));assert.equal(e.state.instances[0].mods[0].file,'old.jar');
  }finally{await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
test('failed mrpack save does not leave ghost instances and imported mods keep project metadata',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stasya-import-'));const previous=global.fetch;
  try{const e=new Engine(dir,()=>{},{});await e.init();const zip=new AdmZip();const hash=crypto.createHash('sha512').update('mod').digest('hex');zip.addFile('modrinth.index.json',Buffer.from(JSON.stringify({formatVersion:1,game:'minecraft',name:'Test',versionId:'1',dependencies:{minecraft:'1.21.1','fabric-loader':'0.19.5'},files:[{path:'mods/sodium.jar',hashes:{sha512:hash},downloads:['https://cdn.modrinth.com/data/project/versions/version/sodium.jar'],fileSize:3}]})));const archive=path.join(dir,'test.mrpack');zip.writeZip(archive);global.fetch=async()=>new Response('mod');
    const imported=await e.import(archive);assert.equal(imported.mods[0].project,'project');assert.equal(imported.mods[0].version,'version');const selected=e.state.selectedInstance;
    e.save=async()=>{throw new Error('Disk failure');};await assert.rejects(e.import(archive),/Disk failure/);assert.equal(e.state.instances.length,1);assert.equal(e.state.selectedInstance,selected);
  }finally{global.fetch=previous;await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
test('concurrent manifest requests share one fetch and NeoForge needs an explicit version',async()=>{
  const e=new Engine('unused',()=>{},{});let count=0;e.loadVersions=async()=>{count++;await new Promise(r=>setImmediate(r));return{versions:[{id:'1.21.1'}]};};
  await Promise.all([e.versions(),e.versions(),e.versions()]);assert.equal(count,1);e.state={instances:[],accounts:[],settings:{}};await assert.rejects(e.create({name:'Test',minecraft:'1.21.1',loader:'neoforge'}),/NeoForge/);assert.equal(e.state.instances.length,0);
});
test('stop is idempotent and failed process termination re-enables controls',()=>{
  const e=new Engine('unused',()=>{},{});e.state={accounts:[],instances:[],settings:{}};let count=0;e.process={kill:()=>{count++;return true;}};e.stop();e.stop();assert.equal(count,1);assert.equal(e.stopping,true);
  e.stopping=false;e.process={kill:()=>false};assert.throws(()=>e.stop(),/Не удалось остановить/);assert.equal(e.stopping,false);
});
test('custom proxy source rewrites mrpack CDN URLs too',()=>{
  const {rewriteUrl}=require('../lib/util.cjs');assert.equal(rewriteUrl('https://cdn.modrinth.com/data/mod.jar',{source:'custom',proxyCdn:'https://cdn.example'}),'https://cdn.example/data/mod.jar');
});
test('failed rollback retains backups instead of deleting the last recoverable copy',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stasya-recovery-'));const originalCopy=fs.copyFile;
  try{const e=new Engine(dir,()=>{},{});await e.init();e.state.instances.push({id:'i',name:'Test',mods:[{project:'p',file:'old.jar'}]});const mods=path.join(e.folder('i'),'mods');await fs.mkdir(mods,{recursive:true});await fs.writeFile(path.join(mods,'old.jar'),'recoverable');e.save=async()=>{throw new Error('save failed');};
    fs.copyFile=async(source,target,...args)=>{if(source.includes('rollback-'))throw new Error('restore blocked');return originalCopy(source,target,...args);};
    await assert.rejects(commitMods(e,'i',[{name:'new.jar',bytes:Buffer.from('new')}],[{project:'p',file:'new.jar'}]),/Резервные копии сохранены/);
    fs.copyFile=originalCopy;const backup=(await fs.readdir(path.join(dir,'downloads'))).find(n=>n.startsWith('rollback-'));assert.ok(backup);const entries=await fs.readdir(path.join(dir,'downloads',backup));const bytes=await Promise.all(entries.map(n=>fs.readFile(path.join(dir,'downloads',backup,n),'utf8')));assert.ok(bytes.includes('recoverable'));
  }finally{fs.copyFile=originalCopy;await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
test('loading existing data repairs stale selections without dropping profiles',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stasya-migrate-'));
  try{await fs.writeFile(path.join(dir,'state.json'),JSON.stringify({settings:{},accounts:[{id:'a',name:'Demo',type:'microsoft'}],instances:[{id:'i',name:'World'}],selectedAccount:'missing',selectedInstance:'missing'}));const e=new Engine(dir,()=>{},{});await e.init();assert.equal(e.state.selectedAccount,'a');assert.equal(e.state.selectedInstance,'i');assert.deepEqual(e.state.instances[0].mods,[]);}
  finally{await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
test('missing license blocks launch before downloading or installing the game',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stasya-license-'));
  try{const e=new BaseEngine(dir,()=>{},{});await e.init();e.state.accounts=[{id:'a',name:'Player',type:'microsoft'}];e.state.selectedAccount='a';e.state.instances=[{id:'i',name:'World',mods:[]}];let installed=false;e.install=async()=>{installed=true;throw new Error('Unexpected install');};await assert.rejects(e.play('i'),error=>error.code==='LICENSE_REQUIRED');assert.equal(installed,false);assert.equal(e.busy,false);
  }finally{await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
test('expired ownership is rechecked on launch and prevents a historically verified account from playing',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stasya-ownership-'));
  try{const e=new BaseEngine(dir,()=>{},{decrypt:x=>x,encrypt:x=>x});await e.init();e.state.accounts=[{id:'a',name:'Player',type:'microsoft',licenseVerified:true,secret:'old'}];e.state.selectedAccount='a';e.state.instances=[{id:'i',name:'World',mods:[]}];let installed=false;e.install=async()=>{installed=true;};e.authManager=()=>({refresh:async()=>({save:()=> 'rotated',getMinecraft:async()=>{throw Object.assign(new Error('No ownership'),{code:'NO_LICENSE'});}})});await assert.rejects(e.play('i'),error=>error.code==='NO_LICENSE');assert.equal(installed,false);assert.equal(e.state.accounts[0].licenseVerified,false);assert.equal(e.state.accounts[0].secret,'rotated');
  }finally{await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
test('an empty entitlement response is not treated as owning Minecraft',async()=>{
  const previous=global.fetch;let n=0;
  try{global.fetch=async()=>new Response(JSON.stringify(++n===1?{Token:'x'}:n===2?{Token:'x',DisplayClaims:{xui:[{uhs:'h'}]}}:n===3?{access_token:'minecraft'}:{items:[]}),{status:200});const s=new MicrosoftSession({}, {accessToken:'test'},()=>{},MICROSOFT_CLIENT_ID);await assert.rejects(s.getMinecraft(),e=>e.code==='NO_LICENSE');assert.equal(n,4);
  }finally{global.fetch=previous;}
});

