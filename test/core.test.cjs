const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const { inside, rewriteUrl } = require('../lib/util.cjs');
const { download } = require('../lib/network.cjs');
const { validateIndex, importPack } = require('../lib/packs.cjs');
const { Engine:BaseEngine } = require('../lib/engine.cjs');
const Engine=BaseEngine;
const { allowedDownload, installProxyMods } = require('../lib/proxy.cjs');
const digest = (b, a = 'sha512') => crypto.createHash(a).update(b).digest('hex');
const base = files => ({ formatVersion: 1, game: 'minecraft', name: 'Test', versionId: '1', dependencies: { minecraft: '1.21.1', 'fabric-loader': '0.16.0' }, files });
test('Windows paths cannot escape instance root or use device names', () => {
  for (const p of ['../outside','/absolute','mods/../../escape','mods\\evil','C:/evil','mods/a:stream','mods/CON.jar','mods/trailing.','mods/./a']) assert.throws(() => inside('C:/test', p));
  assert.ok(inside('C:/test','mods/example.jar').endsWith(path.join('mods','example.jar')));
});
test('proxy rewrites API and CDN, never Microsoft authentication', () => {
  const s = { source:'proxy', proxyApi:'https://proxy.example/v2', proxyCdn:'https://cdn.example' };
  assert.equal(rewriteUrl('https://api.modrinth.com/v2/search?q=a',s),'https://proxy.example/v2/search?q=a');
  assert.equal(rewriteUrl('https://cdn.modrinth.com/data/a.jar',s),'https://cdn.example/data/a.jar');
  assert.equal(rewriteUrl('https://login.live.com/oauth',s),'https://login.live.com/oauth');
  assert.throws(()=>rewriteUrl('http://unsafe.example',s));
});
test('mrpack validates hashes, dependencies and case-insensitive duplicate paths', () => {
  const file = {path:'mods/a.jar', hashes:{sha512:'a'.repeat(128)}, downloads:['https://cdn.modrinth.com/a'],fileSize:12};
  assert.equal(validateIndex(base([file])).files.length,1);
  assert.throws(()=>validateIndex(base([{...file,path:'../x'}])));
  assert.throws(()=>validateIndex(base([{...file,hashes:{}}])));
  assert.throws(()=>validateIndex(base([file,{...file,path:'mods/A.jar'}])));
  assert.throws(()=>validateIndex({...base([]), dependencies:{minecraft:'1.21.1','unknown-loader':'1'}}));
});
test('downloads try fallback, verify hash and reuse valid cache', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stasya-download-')); const previous=global.fetch;let calls=0;
  try {
    global.fetch=async url=>{calls++;return new Response(url.includes('bad')?'wrong':'correct',{status:200});};
    const file=path.join(dir,'mod.jar'); await download(['https://example.org/bad','https://example.org/good'],file,{sha512:digest('correct')});
    assert.equal(await fs.readFile(file,'utf8'),'correct');const count=calls;await download('https://example.org/good',file,{sha512:digest('correct')});assert.equal(calls,count);
    await assert.rejects(download('https://example.org/bad',path.join(dir,'bad.jar'),{sha512:digest('correct')}),/сумма/);
    await assert.rejects(fs.access(path.join(dir,'bad.jar')));
  } finally {global.fetch=previous;await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
test('mrpack imports client overrides, skips server files, checks downloaded bytes', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stasya-pack-'));const previous=global.fetch;
  try {
    const zip=new AdmZip();zip.addFile('modrinth.index.json',Buffer.from(JSON.stringify(base([
      {path:'mods/client.jar',hashes:{sha512:digest('mod')},downloads:['https://example.org/mod'],fileSize:3},
      {path:'mods/server.jar',hashes:{sha512:digest('server')},downloads:['https://example.org/server'],fileSize:6,env:{client:'unsupported',server:'required'}},
    ]))));zip.addFile('overrides/config/example.txt',Buffer.from('shared'));zip.addFile('client-overrides/config/example.txt',Buffer.from('client'));zip.addFile('server-overrides/ignored.txt',Buffer.from('ignored'));
    const file=path.join(dir,'test.mrpack');zip.writeZip(file);global.fetch=async()=>new Response('mod');const out=path.join(dir,'instance');
    await importPack(file,out,{},()=>{});assert.equal(await fs.readFile(path.join(out,'mods/client.jar'),'utf8'),'mod');assert.equal(await fs.readFile(path.join(out,'config/example.txt'),'utf8'),'client');await assert.rejects(fs.access(path.join(out,'mods/server.jar')));await assert.rejects(fs.access(path.join(out,'ignored.txt')));
  }finally{global.fetch=previous;await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
test('proxy download origins allow site blobs and reject external or local content',()=>{
  assert.equal(allowedDownload('blob:https://modrinth.black/123'),true);
  assert.equal(allowedDownload('https://cdn.modrinth.com/data/file.jar'),true);
  for(const url of ['file:///C:/secret','https://evil.example/a.jar','blob:https://evil.example/123','http://modrinth.black/a'])assert.equal(allowedDownload(url),false);
});
test('proxy installs ZIP dependency bundles as JARs and rejects corrupted downloads',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stasya-proxy-'));
  try{
    const engine=new Engine(dir,()=>{},{});await engine.init();engine.state.instances.push({id:'test',name:'Test',loader:'fabric',minecraft:'1.21.1',mods:[]});
    const jar=new AdmZip();jar.addFile('fabric.mod.json',Buffer.from('{"id":"test","version":"1"}'));
    const bundle=new AdmZip();bundle.addFile('first.jar',jar.toBuffer());bundle.addFile('mods/second.jar',jar.toBuffer());
    const file=path.join(dir,'bundle.zip');bundle.writeZip(file);
    assert.equal(await installProxyMods(engine,'test',file,'bundle.zip'),2);assert.equal((await fs.readdir(path.join(dir,'instances/test/mods'))).length,2);
    const bad=path.join(dir,'bad.jar');await fs.writeFile(bad,'not a JAR');await assert.rejects(installProxyMods(engine,'test',bad,'bad.jar'));assert.equal(engine.state.instances[0].mods.length,2);
  }finally{await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
test('concurrent state writes are serialized without losing changes',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stasya-writes-'));
  try{const engine=new Engine(dir,()=>{},{});await engine.init();await Promise.all(Array.from({length:10},(_,n)=>{engine.state.accounts.push({id:'id'+n,name:'Player'+n,type:'microsoft',secret:'encrypted'});engine.state.selectedAccount='id'+n;return engine.save();}));const saved=JSON.parse(await fs.readFile(path.join(dir,'state.json'),'utf8'));assert.equal(saved.accounts.length,10);assert.equal(saved.selectedAccount,'id9');const loaded=new Engine(dir,()=>{},{});await loaded.init();assert.equal(loaded.snapshot().accounts[0].secret,undefined);assert.equal(loaded.state.accounts.length,10);}
  finally{await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});

