const api = window.stasya;
const $ = id => document.getElementById(id);
let state, manifest, offset = 0, totalResults = 0, catalogRequest = 0, catalogKey = '', toastTimer, progressTimer, pendingInstall, currentModsId, renderingPicker=false, catalogType = 'mod';
const names = {home:'Главная',library:'Мои сборки',catalog:'Каталог модов',accounts:'Аккаунты',settings:'Настройки',logs:'Журнал запуска'};
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function button(text, cls, fn) { const b = el('button', cls, text); b.type = 'button'; b.onclick = () => act(fn, b); return b; }
function toast(text, error = false) { $('toast').textContent = text; $('toast').className = error ? 'error' : ''; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').className = 'hidden', error ? 12000 : 5000); }
function log(text) { const p = $('log-output'); p.textContent = (p.textContent + text + '\n').slice(-180000); p.scrollTop = p.scrollHeight; }
async function act(fn, b) { if (b) b.disabled = true; try { return await fn(); } catch (e) { toast(e.message, true); log('[Ошибка] ' + e.message);if(['NO_LICENSE','LICENSE_REQUIRED'].includes(e.code))page('accounts'); } finally { if (b) b.disabled = false; updatePlay(); } }
function page(id) { InstancePicker.close(); document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === id)); document.querySelectorAll('.nav').forEach(n => n.classList.toggle('active', n.dataset.page === id)); $('page-name').textContent = names[id]; if (id === 'catalog') refreshCatalog(); if (id === 'settings') settings(); }
function selected() { return state.instances.find(i => i.id === state.selectedInstance); }
function updatePlay() {
  if (!state) return;const s=getLaunchState(state);
  $('play').disabled=s.disabled;$('play').textContent=s.label;$('play').title=s.hint;$('ready').textContent=s.hint;
  $('launch-login').classList.toggle('hidden',!['account','license'].includes(s.action));$('launch-login').textContent=s.action==='license'?'Подключить лицензию →':'Войти через Microsoft →';$('launch-create').classList.toggle('hidden',s.action!=='instance');$('launch-import').classList.toggle('hidden',s.action!=='instance');
  for(const id of ['instance-select','create-instance','import-pack','microsoft','upload-jar','mods-import-jar'])if($(id))$(id).disabled=!!(state.busy||state.running);
  if($('microsoft'))$('microsoft').textContent=state.busy && state.operation?.includes('Microsoft')?'Ожидаем вход Microsoft…':'▦  Войти через Microsoft';
  if(!state.busy)$('status-text').textContent=s.hint;InstancePicker.refresh();
}
function render() {
  $('instance-count').textContent = state.instances.length;
  const a = state.accounts.find(a => a.id === state.selectedAccount);
  const owner=a?.type==='microsoft'?a:null;
  $('profile-name').textContent = a?.name || 'Добавить аккаунт';$('profile-type').textContent=a?(owner?.licenseVerified?'Microsoft · лицензия подтверждена':'Нужно подключить лицензию'):'Начни свою историю';
  const select = $('instance-select'); select.replaceChildren();
  if (!state.instances.length) select.add(new Option('Создай первую сборку',''));
  else if(!state.instances.some(i=>i.id===state.selectedInstance))select.add(new Option('Выберите сборку',''));
  for (const i of state.instances){const option=new Option(i.name,i.id);option.dataset.detail='Minecraft '+i.minecraft+' · '+i.loader;select.add(option);}select.value=state.instances.some(i=>i.id===state.selectedInstance)?state.selectedInstance:'';
  drawInstances($('home-instances'), state.instances.slice(0, 2), true); drawInstances($('library-instances'), state.instances, true);
  drawAccounts(); updatePlay(); fillCatalogTarget();InstancePicker.refresh();
}
function drawInstances(container, list, add) {
  container.replaceChildren();
  for (const i of list) {
    const card = el('article', 'instance-card' + (state.selectedInstance === i.id ? ' selected' : ''));
    card.append(el('span','badge', i.loader + (i.loaderVersion ? ' ' + i.loaderVersion : '')),el('h2','',i.name),el('p','', 'Minecraft ' + i.minecraft + (i.lastPlayed ? ' · Играл ' + new Date(i.lastPlayed).toLocaleDateString('ru-RU') : ' · Новое приключение')));
    const actions = el('div','instance-actions');
    const select=button(state.selectedInstance===i.id?'✓ Выбрана':'Выбрать','secondary',async()=>{state=await api.select({instanceId:i.id});render();});select.disabled=!!(state.busy||state.running);
    const repair=button('Проверить файлы','subtle',async()=>{await api.repair(i.id);toast('Файлы сборки проверены и восстановлены.');});repair.disabled=!!(state.busy||state.running);
    actions.append(select,button('Моды','secondary',()=>showMods(i.id)),button('Папка ↗','subtle',()=>api.openFolder(i.id)),repair);
    card.append(actions); container.append(card);
  }
  if (add && list.length < (container.id === 'home-instances' ? 2 : Infinity)) {
    const card = button('', 'empty-card', newInstance); card.append(el('span','plus','+'),el('b','','Создать свой мир'),el('p','','Vanilla, Fabric, Forge, NeoForge или Quilt')); container.append(card);
  }
}
function drawAccounts() {
  const list = $('account-list'); list.replaceChildren();
  if (!state.accounts.length) { list.append(el('p','muted','Пока здесь тихо. Добавь свой первый аккаунт.')); return; }
  for (const a of state.accounts) {
    const row = el('div','account-row' + (state.selectedAccount === a.id ? ' selected' : ''));const info=el('div');info.append(el('b','',a.name),el('small','muted',a.licenseVerified?'Microsoft · лицензия подтверждена':'Требуется лицензия Minecraft Java'));
    const select=button(state.selectedAccount===a.id?'✓ Выбран':'Выбрать','secondary',async()=>{state=await api.select({accountId:a.id});render();});
    const remove=button('Удалить','subtle',async()=>{if(!window.confirm(`Удалить профиль «${a.name}» из лаунчера? Миры и сборки сохранятся. Для Microsoft потребуется повторный вход.`))return;state=await api.removeAccount(a.id);render();});
    select.disabled=remove.disabled=!!(state.busy||state.running);row.append(el('span','avatar',a.name[0].toUpperCase()),info,select,remove);list.append(row);
  }
}
function settings() { const s = state.settings; $('memory').value=s.memory; $('java-path').value=s.javaPath; if($('client-id'))$('client-id').value=s.clientId; $('data-path').textContent=state.root; }
function versionOptions() {
  const showAll = $('snapshots').checked; const versions = (manifest?.versions || []).filter(v => showAll || v.type === 'release'); $('new-version').replaceChildren(); for (const v of versions) $('new-version').add(new Option(v.id + (v.type !== 'release' ? ' · ' + v.type : ''),v.id));
}
async function newInstance() {
  $('new-dialog').showModal(); $('new-name').focus();
  if (!manifest) { $('new-version').replaceChildren(new Option('Получаем версии…','')); try { manifest = await api.versions(); } catch (e) { $('new-dialog').close(); throw e; } }
  versionOptions();
}
async function showMods(id) { currentModsId=id;
  const list = $('mod-list'); list.replaceChildren(el('p','muted','Читаем файлы сборки…')); $('mods-dialog').showModal();
  let mods;try{mods=await api.mods(id);}catch(e){list.replaceChildren(el('p','muted','Не удалось прочитать моды: '+e.message));throw e;}list.replaceChildren();
  if (!mods.length) list.append(el('p','muted','Модов пока нет. Установи их через каталог.'));
  for (const m of mods) { const row = el('div','mod-row'); const info = el('div'); info.append(el('b','',m.file),el('small','muted',m.enabled?'Включён':'Отключён')); row.append(info,button(m.enabled?'Отключить':'Включить','secondary',async () => { await api.toggleMod(id,m.file); $('mods-dialog').close(); await showMods(id); })); list.append(row); }
}
function targetOptions(select,preferred,type=catalogType) {
  select.replaceChildren(new Option('Выберите сборку…',''));
  for(const i of state.instances){const option=new Option(i.name,i.id);option.dataset.detail='Minecraft '+i.minecraft+' · '+i.loader;option.disabled=['mod','jar'].includes(type) && i.loader==='vanilla';select.add(option);}
  select.value=state.instances.some(i=>i.id===preferred && (!['mod','jar'].includes(type) || i.loader!=='vanilla'))?preferred:'';InstancePicker.refresh();
}
function fillCatalogTarget(){const select=$('catalog-instance');targetOptions(select,select.value || state.selectedInstance);select.disabled=!!(state.busy||state.running) || catalogType==='modpack';InstancePicker.refresh();}
function refreshCatalog(){catalogRequest++;fillCatalogTarget();act(searchCatalog);}
async function searchCatalog() {
  const request = ++catalogRequest; const type = catalogType; const i = state.instances.find(i=>i.id===$('catalog-instance').value);
  const key=JSON.stringify([$('search').value,type,$('catalog-instance').value]);if(key!==catalogKey){offset=0;catalogKey=key;}
  $('prev').disabled=$('next').disabled=true;
  $('catalog-context').textContent = type !== 'modpack' ? i ? `Для сборки «${i.name}» · ${i.minecraft} · ${i.loader}` : 'Выбери сборку выше — совместимые версии подберутся автоматически.' : 'Готовые миры — каждая сборка устанавливается отдельно.';
  const list = $('catalog-results'); list.replaceChildren(el('p','muted','Ищем новые приключения…'));
  let result; try { result = await api.search({query:$('search').value,type,offset,instanceId:$('catalog-instance').value}); } catch (e) { if(request!==catalogRequest)return;list.replaceChildren(el('p','muted','Каталог Modrinth недоступен. Проверь подключение и повтори поиск.')); throw e; }
  if (request !== catalogRequest) return; list.replaceChildren(); totalResults = result.total_hits;
  if (!result.hits.length) list.append(el('p','muted','Ничего не найдено. Попробуй другой запрос.'));
  for (const p of result.hits) {
    const card = el('article','mod-card');
    if (p.icon_url?.startsWith('https://')) { const img=el('img'); img.src=p.icon_url; img.alt=''; img.referrerPolicy='no-referrer'; card.append(img); }
    card.append(el('h2','',p.title),el('p','',p.description));
    const bottom=el('div','bottom'); bottom.append(el('span','',new Intl.NumberFormat('ru',{notation:'compact'}).format(p.downloads)+' скачиваний'),button('Установить ↓','secondary',()=> chooseInstall(p,type))); card.append(bottom); list.append(card);
  }
  $('result-count').textContent = `${offset + (result.hits.length ? 1 : 0)}–${offset + result.hits.length} из ${totalResults}`; $('prev').disabled=offset===0; $('next').disabled=offset+18>=totalResults;
}
function updateInstallTarget(){
  const i=state.instances.find(i=>i.id===$('install-target').value),pack=pendingInstall?.type==='modpack';
  $('install-note').textContent=pack?'Будет скачан новейший модпак и создана новая сборка.':i?'Сборка «'+i.name+'» · Minecraft '+i.minecraft+' · '+i.loader:'Выбери сборку. Для модов нужен загрузчик Fabric, Forge, NeoForge или Quilt.';
  $('install-confirm').disabled=!!(state.busy||state.running) || (!pack && (!i || (['mod','jar'].includes(pendingInstall?.type) && i.loader==='vanilla')));
}
function chooseInstall(project,type){
  if(state.busy || state.running)throw new Error('Закрой Minecraft и дождись завершения установки');
  pendingInstall={project:project.project_id,type};$('install-title').textContent=project.title;
  targetOptions($('install-target'),$('catalog-instance').value || state.selectedInstance,type);
  const pack=type==='modpack';$('install-target-row').classList.toggle('hidden',pack);$('install-target').disabled=pack;$('install-target').required=!pack;
  $('install-confirm').textContent=type==='jar'?'Выбрать JAR…':'Установить';
  $('install-auto-note').textContent=type==='jar'?'Можно выбрать несколько JAR. Проверь версию Minecraft и зависимости своих модов; автоматически они подбираются только при установке из Modrinth.':type==='shader'?'Скачиваем ZIP в shaderpacks. Для включения нужен Iris или другой совместимый загрузчик шейдеров; после установки выбери шейдер в настройках Minecraft.':type==='resourcepack'?'Скачиваем ZIP в resourcepacks. После установки включи ресурспак в настройках Minecraft.':'Новейшая совместимая версия и обязательные зависимости будут выбраны автоматически.';
  updateInstallTarget();$('install-dialog').showModal();InstancePicker.refresh();
}

document.querySelectorAll('.nav').forEach(b => b.onclick=()=>page(b.dataset.page));
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('profile-button').onclick=()=>page('accounts'); $('all-instances').onclick=()=>page('library'); $('create-instance').onclick=()=>act(newInstance); $('snapshots').onchange=versionOptions;
$('new-loader').onchange=()=>{const loader=$('new-loader').value;const field=$('new-loader-version');field.required=loader==='neoforge';field.disabled=loader==='vanilla';field.value='';field.placeholder=loader==='neoforge'?'Обязательно: например 21.1.200':'Автоматически · можно указать свою версию';};$('new-loader').onchange();
$('launch-login').onclick=()=>page('accounts');$('launch-create').onclick=()=>act(newInstance);$('launch-import').onclick=()=>$('import-pack').click();
$('instance-select').onchange=()=>act(async()=>{ state=await api.select({instanceId:$('instance-select').value}); render(); });
$('play').onclick=()=>act(async()=>{ if(state.running) await api.stop(); else { await api.play(state.selectedInstance); toast('Minecraft запускается. Хорошей игры!'); } });
$('new-form').onsubmit=e=>{e.preventDefault();act(async()=>{ await api.create({name:$('new-name').value,minecraft:$('new-version').value,loader:$('new-loader').value,loaderVersion:$('new-loader-version').value}); $('new-dialog').close(); page('library'); toast('Сборка создана. Java и Minecraft установятся при первом запуске.'); }, e.submitter);};
if($('microsoft'))$('microsoft').onclick=()=>act(async()=>{state=await api.microsoft();render();toast('Вход выполнен, лицензия Minecraft Java подтверждена');},$('microsoft'));
$('import-pack').onclick=()=>act(async()=>{const r=await api.import();if(r)toast('Сборка импортирована: '+r.name);},$('import-pack'));
$('settings-form').onsubmit=e=>{e.preventDefault();act(async()=>{state=await api.settings({memory:Number($('memory').value),javaPath:$('java-path').value.trim(),clientId:$('client-id')?.value.trim() || ''});render();toast('Настройки сохранены');},e.submitter);};
$('pick-java').onclick=()=>act(async()=>{const file=await api.pickJava();if(file)$('java-path').value=file;});$('data-folder').onclick=()=>act(()=>api.openFolder());
$('search-button').onclick=()=>{offset=0;act(searchCatalog,$('search-button'));};$('search').onkeydown=e=>{if(e.key==='Enter')$('search-button').click();};document.querySelectorAll('[data-content]').forEach((tab,index,tabs)=>{
 tab.onclick=()=>{catalogType=tab.dataset.content;offset=0;for(const t of tabs){const active=t===tab;t.classList.toggle('active',active);t.setAttribute('aria-selected',String(active));t.tabIndex=active?0:-1;}fillCatalogTarget();act(searchCatalog);};
 tab.tabIndex=index===0?0:-1;tab.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[next].focus();tabs[next].click();};
});
$('catalog-instance').onchange=()=>{offset=0;act(searchCatalog);};
$('install-target').onchange=()=>{updateInstallTarget();InstancePicker.refresh();};
$('upload-jar').onclick=()=>act(()=>chooseInstall({title:'Свой JAR-мод'},'jar'));
$('mods-import-jar').onclick=()=>{const id=currentModsId;$('mods-dialog').close();chooseInstall({title:'Свой JAR-мод'},'jar');$('install-target').value=id;updateInstallTarget();InstancePicker.refresh();};
$('install-form').onsubmit=e=>{e.preventDefault();const data={...pendingInstall,instanceId:$('install-target').value};act(async()=>{const result=data.type==='jar'?await api.importJars(data.instanceId):await api.installProject(data);if(!result)return;$('install-dialog').close();toast(data.type==='jar'?'Добавлено JAR-модов: '+result.count:data.type==='modpack'?'Сборка добавлена в библиотеку':'Установлено: '+result.count+' · обязательных зависимостей: '+result.dependencyCount);},e.submitter);};
$('prev').onclick=()=>{offset=Math.max(0,offset-18);act(searchCatalog);};$('next').onclick=()=>{offset+=18;act(searchCatalog);};$('clear-logs').onclick=()=>$('log-output').textContent='';
api.onEvent(e=>{
  if(e.kind==='state'){state=e.state;render();if(!state.busy) { clearTimeout(progressTimer); progressTimer=setTimeout(()=>$('progress-box').classList.add('hidden'),1800); }}
  else if(e.kind==='progress'){clearTimeout(progressTimer);$('progress-box').classList.remove('hidden');$('progress-title').textContent=e.phase||'Подготовка';$('progress-detail').textContent=e.detail|| (e.bytes?`${(e.bytes/1048576).toFixed(1)} МБ`:'');$('status-text').textContent=e.phase;const p=$('progress');if(e.total>0){p.max=e.total;p.value=e.bytes??e.current??0;}else p.removeAttribute('value');}
  else if(e.kind==='log')log(e.text);
  else if(e.kind==='exit'){log('Minecraft завершён с кодом '+e.code);$('status-text').textContent='Minecraft завершён';toast(e.stopped?'Игра остановлена.':e.code===0?'До следующего приключения!':'Minecraft завершился с ошибкой. Открой журнал запуска.',!e.stopped && e.code!==0);}
  else if(e.kind==='notice')toast(e.text);else if(e.kind==='failure'){toast(e.text,true);log(e.text);}
});
['instance-select','catalog-instance','install-target'].forEach(id=>InstancePicker.enhance($(id)));
act(async()=>{state=await api.state();render();settings();});
