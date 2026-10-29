const fs=require('node:fs/promises');const path=require('node:path');
async function runUiSmoke(win,root){
  const cases=await win.webContents.executeJavaScript(`(async()=>{
    const actual=await window.stasya.state();
    const base={accounts:[],instances:[],selectedAccount:'',selectedInstance:'',settings:actual.settings,busy:false,running:false};
    const checks=[];const check=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
    state=structuredClone(base);render();check($('play').disabled,'empty: launch disabled');check($('ready').textContent.includes('Microsoft'),'empty: account explanation');check(!$('launch-login').classList.contains('hidden'),'empty: account action');
    check(!!$('microsoft') && !!$('client-id') && typeof api.microsoft==='function','Microsoft authentication controls available');
    $('launch-login').click();check($('accounts').classList.contains('active'),'account action opens account page');page('home');
    state.accounts=[{id:'a',name:'Demo',type:'microsoft',licenseVerified:true}];state.selectedAccount='a';render();check($('ready').textContent.includes('.mrpack'),'account-only: explain missing instance');check(!$('launch-create').classList.contains('hidden'),'account-only: create action visible');
    manifest={versions:[{id:'1.21.1',type:'release'}]};await newInstance();$('new-loader').value='neoforge';$('new-loader').dispatchEvent(new Event('change'));check($('new-loader-version').required,'NeoForge version required');$('new-dialog').close();$('new-loader').value='vanilla';$('new-loader').dispatchEvent(new Event('change'));
    state.instances=[{id:'i',name:'Demo world',loader:'vanilla',minecraft:'1.21.1',mods:[]}];state.selectedInstance='i';render();check(!$('play').disabled,'ready: launch enabled');check($('ready').textContent.includes('Demo'),'ready: show selected account');
    state.busy=true;state.operation='Завершите вход Microsoft';render();check($('play').disabled && $('ready').textContent.includes(state.operation),'busy: operation explanation');
    state.busy=false;state.running=true;render();check(!$('play').disabled && $('play').textContent.includes('Остановить'),'running: stop available');state.stopping=true;render();check($('play').disabled && $('play').textContent.includes('Останавливаем'),'stopping: no repeated stop');
    state=structuredClone(base);state.selectedAccount='missing';state.selectedInstance='missing';render();check($('play').disabled && !$('launch-login').classList.contains('hidden'),'stale selections: explain login');
    const oldSearch=searchCatalog;searchCatalog=async()=>{};
    state=structuredClone(base);state.instances=[{id:'v',name:'Vanilla World',loader:'vanilla',minecraft:'1.21.1',mods:[]},{id:'f',name:'Fabric World',loader:'fabric',minecraft:'1.21.1',mods:[]}];state.selectedInstance='v';render();page('catalog');
    check(document.querySelectorAll('[data-content]').length===4,'catalog: four content tabs');check(!$('catalog-source') && !$('open-proxy'),'catalog: direct Modrinth');check(!$('versions-dialog'),'catalog: no manual mod version picker');
    chooseInstall({project_id:'demo',title:'Demo mod'},'mod');check($('install-target').value==='','install: Vanilla cannot receive mods');check($('install-confirm').disabled,'install: target is required');
    $('install-target').value='f';$('install-target').dispatchEvent(new Event('change'));check(!$('install-confirm').disabled && $('install-note').textContent.includes('Fabric World'),'install: explicit build selection');check(state.selectedInstance==='v','install: target does not change selected game build');$('install-dialog').close();
    document.querySelector('[data-content="resourcepack"]').click();check(catalogType==='resourcepack' && document.querySelector('[data-content="resourcepack"]').getAttribute('aria-selected')==='true','catalog: resource pack tab selected');
    chooseInstall({project_id:'pack',title:'Demo resources'},'resourcepack');$('install-target').value='v';updateInstallTarget();check(!$('install-confirm').disabled && $('install-auto-note').textContent.includes('resourcepacks'),'resource pack: Vanilla destination');$('install-dialog').close();
    document.querySelector('[data-content="shader"]').click();chooseInstall({project_id:'shader',title:'Demo shader'},'shader');check($('install-auto-note').textContent.includes('Iris'),'shader: renderer instructions');$('install-dialog').close();
    document.querySelector('[data-content="modpack"]').click();chooseInstall({project_id:'pack',title:'Demo modpack'},'modpack');check($('install-target').disabled && !$('install-confirm').disabled,'modpack: creates its own instance');$('install-dialog').close();
    catalogType='mod';for(const tab of document.querySelectorAll('[data-content]')){const active=tab.dataset.content==='mod';tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}searchCatalog=oldSearch;state=structuredClone(base);render();page('home');
    return checks;
  })()`);
  win.setSize(1080,800);
  const visible=await win.webContents.executeJavaScript(`(()=>{const rect=$('ready').getBoundingClientRect();return {visible:getComputedStyle($('ready')).display!=='none' && rect.width>0 && rect.height>0,buttonColor:getComputedStyle($('play')).color,hint:$('ready').textContent,actions:$('launch-login').getBoundingClientRect().height>0};})()`);
  if(!visible.visible || !visible.actions)throw new Error('Login hint hidden at minimum width');
  const image=await win.webContents.capturePage();await fs.writeFile(path.join(root,'smoke-empty-1080.png'),image.toPNG());
  win.showInactive();await win.webContents.executeJavaScript("page('catalog');new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");await new Promise(resolve=>setTimeout(resolve,250));const catalogImage=await win.webContents.capturePage();await fs.writeFile(path.join(root,'smoke-catalog.png'),catalogImage.toPNG());await win.webContents.executeJavaScript("page('home')");
  win.setSize(1440,930);await win.webContents.executeJavaScript('(async()=>{state=await window.stasya.state();render();page("home");})()');
  return {cases,minimumWidth:visible};
}
module.exports={runUiSmoke};

