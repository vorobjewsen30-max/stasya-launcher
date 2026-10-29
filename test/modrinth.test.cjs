const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const crypto=require('node:crypto');
const {availableMods,resolveMods}=require('../lib/modrinth.cjs');const {Engine}=require('../lib/engine.cjs');
const instance={id:'target',name:'Target build',minecraft:'1.21.1',loader:'fabric',mods:[]};
const make=(project,id,date='2026-01-01',dependencies=[],extra={})=>({project_id:project,id,name:project+' '+id,version_number:id,date_published:date,game_versions:['1.21.1'],loaders:['fabric'],dependencies,files:[{filename:project+'-'+id+'.jar',url:'https://cdn.example/'+id,hashes:{sha512:crypto.createHash('sha512').update(id).digest('hex')}}],...extra});
const required=(project,version)=>({dependency_type:'required',project_id:project,version_id:version});
function resolver(all){return {projectVersions:async id=>all.filter(v=>v.project_id===id),getVersion:async id=>{const v=all.find(v=>v.id===id);assert.ok(v,'version exists '+id);return v;}};}
test('latest mod is selected by publication date, filtered by loader and Minecraft',()=>{
 const list=[make('mod','99','2025-01-01'),make('mod','2','2026-01-01'),make('mod','wrong','2026-05-01',[],{loaders:['forge']}),make('mod','server','2026-06-01',[],{environment:'dedicated_server_only'})];
 assert.deepEqual(availableMods(list,instance).map(v=>v.id),['2','99']);
});
test('required dependencies include nested and pinned versions, optional and embedded are skipped',async()=>{
 const root=make('main','m',undefined,[required('api'),{dependency_type:'optional',project_id:'optional'},{dependency_type:'embedded',project_id:'embedded'}]);
 const api=make('api','a',undefined,[required(null,'g1')]),gecko=make('gecko','g1'),newer=make('gecko','g2','2026-05-01');
 const plan=await resolveMods(root,instance,resolver([root,api,gecko,newer]));assert.deepEqual([...plan.keys()],['main','api','gecko']);assert.equal(plan.get('gecko').id,'g1');
});
test('shared dependencies are deduplicated and backtracking respects a later exact pin',async()=>{
 const root=make('main','root',undefined,[required('a'),required('b')]);const a=make('a','a1',undefined,[required('lib')]),b=make('b','b1',undefined,[required('lib','lib1')]);const l1=make('lib','lib1'),l2=make('lib','lib2','2026-02-01');
 const plan=await resolveMods(root,instance,resolver([root,a,b,l1,l2]));assert.equal(plan.size,4);assert.equal(plan.get('lib').id,'lib1');
});
test('cycles terminate and conflicting exact pins fail before downloads',async()=>{
 const a=make('a','a1',undefined,[required('b')]),b=make('b','b1',undefined,[required('a','a1')]);assert.equal((await resolveMods(a,instance,resolver([a,b]))).size,2);
 const root=make('main','m',undefined,[required('lib','one'),required('lib','two')]);await assert.rejects(resolveMods(root,instance,resolver([root,make('lib','one'),make('lib','two')])),/Конфликт/);
});
test('missing external dependency and incompatible pinned dependency fail explicitly',async()=>{
 const external=make('main','m',undefined,[{dependency_type:'required',file_name:'external.jar'}]);await assert.rejects(resolveMods(external,instance,resolver([external])),/не указал проект/);
 const main=make('main','m',undefined,[required('lib','wrong')]);const wrong=make('lib','wrong',undefined,[],{game_versions:['1.20.1']});await assert.rejects(resolveMods(main,instance,resolver([main,wrong])),/Несовместимая/);
});
test('install chooses latest automatically, installs all dependencies only into requested build and re-enables required JAR',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stasya-mods-'));const previous=global.fetch;
 try{const engine=new Engine(dir,()=>{},{});await engine.init();engine.state.instances=[structuredClone(instance),{...structuredClone(instance),id:'other'}];engine.state.selectedInstance='other';
  const old=make('main','old','2025-01-01'),main=make('main','latest','2026-01-01',[required('api')]),api=make('api','api1');const all=[old,main,api];let calls=[];
  global.fetch=async raw=>{const url=new URL(raw);calls.push(url.href);if(url.hostname==='cdn.example')return new Response(url.pathname.slice(1));if(/\/project\/[^/]+$/.test(url.pathname))return new Response(JSON.stringify({project_type:'mod'}));const project=url.pathname.match(/\/project\/([^/]+)\/version/);return new Response(JSON.stringify(project?all.filter(v=>v.project_id===project[1]):all.find(v=>v.id===url.pathname.split('/').pop())));};
  const mods=path.join(dir,'instances/target/mods');await fs.mkdir(mods,{recursive:true});await fs.writeFile(path.join(mods,'api-api1.jar.disabled'),'disabled');
  const result=await engine.installProject({project:'main',instanceId:'target',type:'mod',versionId:'old'});assert.equal(result.version,'latest');assert.equal(result.count,2);assert.equal(result.dependencyCount,1);assert.equal(await fs.readFile(path.join(mods,'main-latest.jar'),'utf8'),'latest');await assert.rejects(fs.access(path.join(mods,'api-api1.jar.disabled')));assert.equal(engine.instance('other').mods.length,0);assert.equal(engine.state.selectedInstance,'other');assert.equal(calls.filter(v=>v.includes('cdn.example')).length,2);
 }finally{global.fetch=previous;await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
test('failed dependency download leaves existing mods and metadata unchanged',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stasya-mod-failure-'));const previous=global.fetch;
 try{const engine=new Engine(dir,()=>{},{});await engine.init();engine.state.instances=[structuredClone(instance)];const main=make('main','new',undefined,[required('api')]),api=make('api','broken');const all=[main,api];const mods=path.join(dir,'instances/target/mods');await fs.mkdir(mods,{recursive:true});await fs.writeFile(path.join(mods,'existing.jar'),'original');
 global.fetch=async raw=>{const url=new URL(raw);if(url.hostname==='cdn.example')return new Response(url.pathname==='/broken'?'corrupt':'new');if(/\/project\/[^/]+$/.test(url.pathname))return new Response(JSON.stringify({project_type:'mod'}));return new Response(JSON.stringify(all.filter(v=>v.project_id===url.pathname.split('/')[3])));};
 await assert.rejects(engine.installProject({project:'main',instanceId:'target'}),/Контрольная сумма/);assert.deepEqual(await fs.readdir(mods),['existing.jar']);assert.equal(engine.instance('target').mods.length,0);assert.equal(engine.busy,false);
 }finally{global.fetch=previous;await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
test('resource packs and shaders install ZIPs into their own folders, including on Vanilla',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stasya-packs-'));const previous=global.fetch;
 try{const engine=new Engine(dir,()=>{},{});await engine.init();engine.state.instances=[{...structuredClone(instance),loader:'vanilla'}];
 for(const type of ['resourcepack','shader']){const v=make(type,'zip',undefined,[],{loaders:type==='shader'?['iris','optifine']:['minecraft']});v.files[0].filename=type+'.zip';global.fetch=async raw=>new URL(raw).hostname==='cdn.example'?new Response('zip'):new Response(JSON.stringify([v]));const result=await engine.installProject({project:type,instanceId:'target',type});assert.equal(result.count,1);const directory=type==='shader'?'shaderpacks':'resourcepacks';assert.equal(await fs.readFile(path.join(dir,'instances/target',directory,type+'.zip'),'utf8'),'zip');assert.equal(engine.instance('target')[directory][0].project,type);}
 assert.deepEqual(engine.instance('target').mods,[]);
 }finally{global.fetch=previous;await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
test('resource pack with a required mod resolves cross-type dependencies and rolls back all folders on save failure',async()=>{
 const {commitMods}=require('../lib/mod-files.cjs');const root=make('pack','zip',undefined,[required('lib')],{loaders:['minecraft'],files:[{filename:'pack.zip'}]}),lib=make('lib','jar');
 const plan=await resolveMods(root,instance,{...resolver([root,lib]),kind:'resourcepack',getProjectType:async()=> 'mod'});assert.equal(plan.get('lib').contentType,'mod');assert.equal(plan.get('pack').contentType,'resourcepack');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stasya-cross-rollback-'));
 try{const e=new Engine(dir,()=>{},{});await e.init();e.state.instances=[structuredClone(instance)];e.save=async()=>{throw new Error('Disk full');};await assert.rejects(commitMods(e,'target',[{name:'lib.jar',bytes:Buffer.from('lib')},{name:'pack.zip',bytes:Buffer.from('pack'),contentType:'resourcepack'}],[{project:'lib',file:'lib.jar'},{project:'pack',file:'pack.zip',contentType:'resourcepack'}]),/Disk full/);await assert.rejects(fs.access(path.join(dir,'instances/target/mods/lib.jar')));await assert.rejects(fs.access(path.join(dir,'instances/target/resourcepacks/pack.zip')));assert.deepEqual(e.instance('target').mods,[]);}
 finally{await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
test('old catalog settings migrate to direct Modrinth without changing accounts or builds',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stasya-settings-'));
 try{await fs.writeFile(path.join(dir,'state.json'),JSON.stringify({settings:{memory:8192,source:'proxy',proxyApi:'https://example.org',proxyCdn:'https://example.org'},accounts:[],instances:[instance],selectedInstance:'target'}));const e=new Engine(dir,()=>{},{});await e.init();assert.equal(e.state.settings.memory,8192);assert.equal(e.state.settings.source,undefined);assert.equal(e.state.settings.proxyApi,undefined);assert.equal(e.instance('target').name,'Target build');}
 finally{await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
