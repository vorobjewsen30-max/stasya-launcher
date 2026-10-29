// Real Modrinth downloads into a fresh isolated directory. Never launches a game.
const {app,net}=require('electron');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const assert=require('node:assert/strict');const {Engine}=require('../lib/engine.cjs');const {json,setFetch,hashFile}=require('../lib/network.cjs');
app.whenReady().then(async()=>{
 setFetch(require('../lib/transport.cjs').createTransport(net));const root=await fs.mkdtemp(path.join(os.tmpdir(),'stasya-live-catalog-'));
 const e=new Engine(root,()=>{},{});await e.init();e.state.instances=[{id:'fabric',name:'Fabric catalog test',minecraft:'1.21.1',loader:'fabric',mods:[]},{id:'forge',name:'Forge catalog test',minecraft:'1.20.1',loader:'forge',mods:[]}];
 const installed=[];
 for(const [project,type,id]of [['iris','mod','fabric'],['complementary-reimagined','shader','fabric'],['fresh-animations','resourcepack','fabric']]){
  const result=await e.installProject({project,type,instanceId:id});installed.push({project,type,...result});console.log('INSTALLED',JSON.stringify(installed.at(-1)));
 }
 const hits=await e.search({query:'point blank',type:'mod',instanceId:'forge'});const point=hits.hits.find(h=>/point.?blank/i.test(h.title));if(point){const result=await e.installProject({project:point.project_id,type:'mod',instanceId:'forge'});console.log('POINT_BLANK',point.title,JSON.stringify(result));}
 for(const i of e.state.instances)for(const [field,type]of [['mods','mod'],['resourcepacks','resourcepack'],['shaderpacks','shader']])for(const record of i[field] || []){const v=await json('https://api.modrinth.com/v2/version/'+record.version);const f=v.files.find(f=>f.filename===record.file);assert.ok(f);assert.equal(await hashFile(path.join(root,'instances',i.id,field,record.file),'sha512'),f.hashes.sha512);}
 assert.ok(e.instance('fabric').mods.some(m=>m.project==='AANobbMI'),'Iris requires Sodium');console.log('INTEGRATION_CATALOG_OK',root);app.exit(0);
}).catch(e=>{console.error(e.stack||e);app.exit(1);});
