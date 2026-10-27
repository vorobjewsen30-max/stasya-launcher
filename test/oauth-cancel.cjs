const {app,net}=require('electron');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');
const {Engine}=require('../lib/engine.cjs');
app.whenReady().then(async()=>{
  require('../lib/network.cjs').setFetch(require('../lib/transport.cjs').createTransport(net));
  const dir=path.resolve(__dirname,'../../../work/stasya-oauth-cancel');await fs.mkdir(dir,{recursive:true});
  const engine=new Engine(dir,()=>{},{available:()=>true,encrypt:()=>{throw new Error('Unexpected token storage');}});await engine.init();
  const timer=setTimeout(()=>{console.error('OAUTH_CANCEL_TIMEOUT');app.exit(1);},45000);
  let loaded=false;
  app.on('browser-window-created',(_,win)=>{win.hide();win.webContents.on('did-finish-load',()=>{if(win.webContents.getURL().startsWith('https://login.')){loaded=true;win.close();}});});
  await assert.rejects(engine.exclusive(()=>engine.microsoft(),'Вход Microsoft'),/отменён/);
  assert.equal(loaded,true);assert.equal(engine.busy,false);assert.equal(engine.state.accounts.length,0);clearTimeout(timer);console.log('OAUTH_CANCEL_OK: registered client page loaded; close released operation; no account or token saved');app.exit(0);
}).catch(e=>{console.error(e.stack||e);app.exit(1);});

