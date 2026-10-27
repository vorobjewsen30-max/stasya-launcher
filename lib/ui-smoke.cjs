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
    return checks;
  })()`);
  win.setSize(1080,800);
  const visible=await win.webContents.executeJavaScript(`(()=>{const rect=$('ready').getBoundingClientRect();return {visible:getComputedStyle($('ready')).display!=='none' && rect.width>0 && rect.height>0,buttonColor:getComputedStyle($('play')).color,hint:$('ready').textContent,actions:$('launch-login').getBoundingClientRect().height>0};})()`);
  if(!visible.visible || !visible.actions)throw new Error('Login hint hidden at minimum width');
  const image=await win.webContents.capturePage();await fs.writeFile(path.join(root,'smoke-empty-1080.png'),image.toPNG());
  win.setSize(1440,930);await win.webContents.executeJavaScript('(async()=>{state=await window.stasya.state();render();page("home");})()');
  return {cases,minimumWidth:visible};
}
module.exports={runUiSmoke};

