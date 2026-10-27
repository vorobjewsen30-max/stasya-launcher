const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { Engine } = require('./lib/engine.cjs');
const { inside, secureUrl } = require('./lib/util.cjs');
const { allowedDownload, installProxyMods } = require('./lib/proxy.cjs');
const PRODUCT_NAME='Stasya Launcher';
app.setName(PRODUCT_NAME);
let win, engine;
const smoke = process.argv.includes('--smoke');
const rootArg = process.argv.find(a => a.startsWith('--data-dir='));
app.setPath('userData',rootArg?path.resolve(rootArg.slice(11)):path.join(app.getPath('appData'),'StasyaLauncher'));
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { win?.show(); win?.focus(); });
function report(e) { if (win && !win.isDestroyed()) win.webContents.send('stasya:event', e); }
function handle(method, fn) { ipcMain.handle('stasya:' + method, async (event, ...args) => {
  try {
    if (event.sender !== win.webContents || !event.senderFrame.url.startsWith('file:')) throw new Error('Доступ запрещён');
    return { ok: true, value: await fn(...args) };
  } catch (e) { return { ok: false, error: e.message || (typeof e === 'string' ? e : 'Операция не выполнена'),code:e.code }; }
}); }
async function proxyWindow(id) {
  const i = id ? engine.instance(id) : null; if (engine.busy || engine.process) throw new Error('Закройте Minecraft и дождитесь установки');
  await fs.mkdir(path.join(engine.root, 'downloads'), { recursive: true });
  const browser = new BrowserWindow({ parent: win, width: 1250, height: 850, title: 'Modrinth Proxy' + (i ? ' → ' + i.name : ''), autoHideMenuBar: true, webPreferences: { partition: 'persist:modrinth-proxy', nodeIntegration: false, contextIsolation: true, sandbox: true } });
  const ses = browser.webContents.session; ses.setPermissionRequestHandler((_, __, cb) => cb(false));
  browser.webContents.setWindowOpenHandler(({ url }) => { try { const u = secureUrl(url); if (u.hostname === 'modrinth.black') browser.loadURL(u.href); } catch {} return { action: 'deny' }; });
  browser.webContents.on('will-navigate', (event, url) => { try { const u = secureUrl(url); if (u.hostname !== 'modrinth.black' && !u.hostname.endsWith('.modrinth.black')) event.preventDefault(); } catch { event.preventDefault(); } });
  let downloading = false, activeDownload;
  const onDownload = (event, item, contents) => {
    if (contents !== browser.webContents) return;
    const filename = item.getFilename(); const ext = path.extname(filename).toLowerCase();
    const urls = item.getURLChain();
    if (downloading || engine.busy || engine.process) { item.cancel(); report({kind:'failure',text:'Сначала завершите текущую установку или закройте Minecraft, затем повторите скачивание.'}); return; }
    if (!['.jar','.mrpack','.zip'].includes(ext) || urls.some(url => !allowedDownload(url))) { item.cancel(); report({kind:'failure',text:'Этот файл не поддерживается. Выберите JAR, ZIP с модами или .mrpack с Modrinth.'});return; }
    if (ext !== '.mrpack' && (!i || i.loader === 'vanilla')) { item.cancel(); dialog.showMessageBox(browser, { message: 'Выберите сборку с Fabric, Forge, NeoForge или Quilt для установки модов.' }); return; }
    downloading = true;activeDownload=item;engine.busy=true;engine.operation='Скачиваем файл из Modrinth Proxy. Дождитесь завершения.';report({kind:'state',state:engine.snapshot()});
    const target = path.join(engine.root, 'downloads', crypto.randomUUID() + ext);
    item.setSavePath(target);
    item.on('updated', () => report({ kind: 'progress', phase: 'Modrinth Proxy · ' + filename, bytes: item.getReceivedBytes(), total: item.getTotalBytes() }));
    item.once('done', async (_, state) => {
      downloading = false;activeDownload=null;engine.busy=false;engine.operation='';
      try {
        if (state !== 'completed') throw new Error('Скачивание прервано');
        if (ext === '.mrpack') await engine.import(target);
        else {
          let metadata={};
          if(ext==='.jar')for(const raw of urls){const u=new URL(raw);const m=u.hostname==='cdn.modrinth.com' && u.pathname.match(/^\/data\/([^/]+)\/versions\/([^/]+)\//);if(m){metadata={project:m[1],version:m[2]};break;}}
          await installProxyMods(engine, id, target, filename,metadata);
        }
        report({ kind: 'notice', text: 'Установлено: ' + filename });
      } catch (e) { report({ kind: 'failure', text: e.message }); }
      finally { report({kind:'state',state:engine.snapshot()}); }
    });
  };
  ses.on('will-download', onDownload); browser.on('closed', () => { activeDownload?.cancel();ses.removeListener('will-download', onDownload); });
  await browser.loadURL('https://modrinth.black/discover/' + (i ? 'mods' : 'modpacks'));
}
app.whenReady().then(async () => {
  require('./lib/network.cjs').setFetch(require('./lib/transport.cjs').createTransport(net));
  engine = new Engine(path.join(app.getPath('userData'), 'data'), report, {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: s => safeStorage.encryptString(s).toString('base64'),
    decrypt: s => safeStorage.decryptString(Buffer.from(s, 'base64')),
  });
  await engine.init();
  win = new BrowserWindow({ width: 1440, height: 930, minWidth: 1080, minHeight: 720, backgroundColor: '#15111f', title: PRODUCT_NAME, icon: path.join(__dirname, 'assets/app-icon.png'), autoHideMenuBar: true, show: !smoke, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_, __, cb) => cb(false));
  handle('state', () => engine.snapshot()); handle('versions', () => engine.versions()); handle('create', data => engine.create(data));
  handle('select', async data => { if (engine.busy || engine.process) throw new Error('Дождитесь завершения игры и установки'); if (data.instanceId) { engine.instance(data.instanceId); engine.state.selectedInstance = data.instanceId; } if (data.accountId) { if (!engine.state.accounts.some(a => a.id === data.accountId)) throw new Error('Аккаунт не найден'); engine.state.selectedAccount = data.accountId; } await engine.save(); return engine.snapshot(); });
  handle('settings', async s => {
    if (engine.busy || engine.process) throw new Error('Настройки доступны после завершения игры и установки');
    const memory = Number(s.memory); if (!Number.isInteger(memory) || memory < 1024 || memory > 65536) throw new Error('Память: от 1024 до 65536 МБ');
    if (!['modrinth','proxy','custom'].includes(s.source)) throw new Error('Неизвестный источник');
    for (const key of ['proxyApi','proxyCdn']) if (s[key]) secureUrl(s[key]);
    if (s.source === 'custom' && !s.proxyApi) throw new Error('Укажите API proxy');
    if (s.clientId && !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(s.clientId)) throw new Error('Microsoft Client ID должен быть UUID приложения, а не секретом или адресом страницы');
    engine.state.settings = { memory, source: s.source, proxyApi: String(s.proxyApi || ''), proxyCdn: String(s.proxyCdn || ''), javaPath: String(s.javaPath || ''), clientId: String(s.clientId || '') }; await engine.save(); return engine.snapshot();
  });
  handle('microsoft', () => engine.exclusive(() => engine.microsoft(), 'Завершите вход Microsoft в отдельном окне. Его можно закрыть, чтобы отменить вход.'));
  handle('removeAccount', async id => { if (engine.busy || engine.process) throw new Error('Аккаунт используется'); engine.state.accounts = engine.state.accounts.filter(a => a.id !== id); if (engine.state.selectedAccount === id) engine.state.selectedAccount = engine.state.accounts[0]?.id || ''; await engine.save(); return engine.snapshot(); });
  handle('import', async () => { const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Modrinth Modpack', extensions: ['mrpack'] }] }); return r.canceled ? null : engine.import(r.filePaths[0]); });
  handle('search', q => engine.search(q)); handle('projectVersions', (project,id,type) => engine.projectVersions(project,id,type)); handle('installProject', data => engine.installProject(data));
  handle('play', id => engine.play(id)); handle('stop', () => engine.stop());handle('repair',id=>engine.repair(id));
  handle('openFolder', async id => { const folder = id ? engine.folder(id) : engine.root; await fs.mkdir(folder, { recursive: true }); return shell.openPath(folder); });
  handle('proxy', id => proxyWindow(id));
  handle('mods', async id => { const folder = path.join(engine.folder(id), 'mods'); await fs.mkdir(folder, { recursive: true }); return (await fs.readdir(folder)).filter(n => /\.jar(\.disabled)?$/i.test(n)).map(file => ({ file, enabled: !file.endsWith('.disabled') })); });
  handle('toggleMod', (id,file) => engine.exclusive(async () => { if (!/\.jar(\.disabled)?$/i.test(file)) throw new Error('Некорректный файл'); const folder = path.join(engine.folder(id), 'mods'); const target = file.endsWith('.disabled') ? file.slice(0, -9) : file + '.disabled'; await fs.rename(inside(folder,file), inside(folder,target)); return true; }));
  handle('pickJava', async () => { const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Java', extensions: ['exe'] }] }); return r.canceled ? null : r.filePaths[0]; });
  win.on('close', e => { if (engine.busy) { e.preventDefault(); dialog.showMessageBox(win, { message: engine.operation?.includes('Microsoft') ? 'Сначала закройте окно входа Microsoft, чтобы отменить вход, затем закройте лаунчер.' : 'Дождитесь завершения установки или скачивания перед закрытием лаунчера.' }); } });
  await win.loadFile(path.join(__dirname,'ui/index.html'));
  if (smoke) {
    const result = await win.webContents.executeJavaScript(`(async () => { const state = await window.stasya.state();return {title:document.title,accountCount:state.accounts.length,root:!!state.root,bridge:typeof window.stasya.play,hasMicrosoft:typeof window.stasya.microsoft==='function',cards:document.querySelectorAll('.nav').length}; })()`);
    result.ui=await require('./lib/ui-smoke.cjs').runUiSmoke(win,app.getPath('userData'));
    console.log('SMOKE_UI', JSON.stringify(result));
    await fs.writeFile(path.join(app.getPath('userData'), 'smoke-result.json'), JSON.stringify(result, null, 2));
    await win.webContents.executeJavaScript('(async()=>{state=await window.stasya.state();render();})()');
    try { const image = await win.webContents.capturePage(); await fs.writeFile(path.join(app.getPath('userData'), 'smoke.png'), image.toPNG()); } catch (e) { console.log('SCREENSHOT', e.message); }
    console.log('SMOKE', JSON.stringify(result));app.exit(result.ui.cases.length>=13?0:1);
  }
}).catch(e => { console.error(e.message); if (!smoke) dialog.showErrorBox('Stasya Launcher', e.message); app.exit(1); });
app.on('window-all-closed', () => app.quit());
