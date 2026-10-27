const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const { Version, launch } = require('@xmcl/core');
const installer = require('@xmcl/installer');
const AdmZip = require('adm-zip');
const { json, download } = require('./network.cjs');
const { inside, atomicJson } = require('./util.cjs');
const { importPack } = require('./packs.cjs');
const { MICROSOFT_CLIENT_ID } = require('./config.cjs');
const { commitMods } = require('./mod-files.cjs');
const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
class Engine {
  constructor(root, report, vault) { this.root = root; this.report = report; this.vault = vault; this.busy = false; this.process = null; }
  async init() {
    await fs.mkdir(this.root, { recursive: true });
    try { this.state = JSON.parse(await fs.readFile(path.join(this.root, 'state.json'), 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw new Error('Не удалось прочитать state.json. Сохраните резервную копию и проверьте файл.'); this.state = { settings: { memory: 4096, source: 'modrinth', proxyApi: '', proxyCdn: '', javaPath: '', clientId: '' }, instances: [], accounts: [], selectedInstance: '', selectedAccount: '' }; }
    if(!Array.isArray(this.state.instances) || !Array.isArray(this.state.accounts) || !this.state.settings)throw new Error('Повреждена структура state.json. Файл сохранён: восстановите его из резервной копии.');
    for(const i of this.state.instances){if(!/^[a-z0-9_-]{1,80}$/i.test(i.id || '') || !i.name)throw new Error('В state.json повреждены данные сборки.');if(!Array.isArray(i.mods))i.mods=[];}
    for(const a of this.state.accounts)if(!a.id || !a.name || a.type!=='microsoft')throw new Error('В state.json повреждены данные аккаунта.');
    if(!this.state.instances.some(i=>i.id===this.state.selectedInstance))this.state.selectedInstance=this.state.instances[0]?.id || '';
    if(!this.state.accounts.some(a=>a.id===this.state.selectedAccount))this.state.selectedAccount=this.state.accounts[0]?.id || '';
    return this.snapshot();
  }
  snapshot() { return { ...this.state, accounts: this.state.accounts.map(({ secret, ...a }) => a), root: this.root, busy: this.busy, running: !!this.process, stopping:!!this.stopping, operation:this.operation || '', oauthDefaultClientId:MICROSOFT_CLIENT_ID }; }
  async save() {
    const write = (this.saveQueue || Promise.resolve()).catch(() => {}).then(() => atomicJson(path.join(this.root, 'state.json'), this.state));
    this.saveQueue = write; await write; this.report({ kind: 'state', state: this.snapshot() });
  }
  async exclusive(fn, operation = 'Выполняется установка. Дождитесь её завершения.') {
    if (this.busy || this.process) throw new Error('Дождитесь завершения операции или закройте Minecraft');
    this.busy = true; this.operation=operation; this.report({ kind: 'state', state: this.snapshot() });
    try { return await fn(); } finally { this.busy = false; this.operation=''; this.report({ kind: 'state', state: this.snapshot() }); }
  }
  progress(p) { this.report({ kind: 'progress', ...p }); }
  instance(id) { const i = this.state.instances.find(i => i.id === id); if (!i) throw new Error('Выберите сборку'); return i; }
  folder(id) { this.instance(id); return inside(this.root, 'instances/' + id); }
  async versions() {
    if(this.manifestPromise)return this.manifestPromise;
    this.manifestPromise=this.loadVersions();
    try{return await this.manifestPromise;}finally{this.manifestPromise=null;}
  }
  async loadVersions() {
    const file = path.join(this.root, 'manifest.json');
    let cached; try { cached = JSON.parse(await fs.readFile(file, 'utf8')); } catch {}
    try { const m = await json(MANIFEST, {}, cached ? { attempts:1, timeout:5000 } : {}); await atomicJson(file, m); return m; }
    catch (e) { if (cached) return cached; throw e; }
  }
  async create(data) {
    return this.exclusive(async () => {
      if (!data.name?.trim() || data.name.length > 100) throw new Error('Введите название сборки (до 100 символов)');
      const manifest = await this.versions(); if (!manifest.versions.some(v => v.id === data.minecraft)) throw new Error('Неизвестная версия Minecraft');
      if (!['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'].includes(data.loader)) throw new Error('Неизвестный загрузчик');
      if (data.loader === 'neoforge' && !data.loaderVersion?.trim()) throw new Error('Укажите версию NeoForge перед созданием сборки');
      if (data.loader !== 'vanilla' && data.loaderVersion && !/^[a-zA-Z0-9.+_-]{1,80}$/.test(data.loaderVersion)) throw new Error('Некорректная версия загрузчика');
      const i = { id: crypto.randomUUID(), name: data.name.trim(), minecraft: data.minecraft, loader: data.loader, loaderVersion: data.loaderVersion?.trim() || '', created: Date.now(), mods: [] };
      await fs.mkdir(inside(this.root,'instances/'+i.id), { recursive:true });
      const previous=this.state.selectedInstance;this.state.instances.push(i);this.state.selectedInstance=i.id;
      try{await this.save();}catch(e){this.state.instances=this.state.instances.filter(x=>x.id!==i.id);this.state.selectedInstance=previous;throw e;}return i;
    });
  }
  async java(major) {
    if (this.state.settings.javaPath) {
      const binary = this.state.settings.javaPath;
      const { stderr, stdout } = await exec(binary, ['-version'], { windowsHide: true });
      const match = (stderr + stdout).match(/version "(?:1\.)?(\d+)/); if (!match || Number(match[1]) < major) throw new Error(`Для сборки нужна Java ${major} или новее`);
      return binary;
    }
    if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Автоустановка Java рассчитана на Windows x64; укажите java вручную');
    const destination = path.join(this.root, 'java', String(major)); const marker = path.join(destination, 'runtime.json');
    try { const m = JSON.parse(await fs.readFile(marker, 'utf8')); const exe = inside(destination, m.executable); await fs.access(exe); return exe; } catch {}
    this.progress({ phase: `Скачивание Java ${major}`, detail: 'Eclipse Temurin · проверка SHA-256' });
    const releases = await json(`https://api.adoptium.net/v3/assets/latest/${major}/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse`);
    const pkg = releases[0]?.binary?.package; if (!pkg || !/^[a-f0-9]{64}$/i.test(pkg.checksum)) throw new Error('Не найдена Java ' + major);
    const archive = path.join(this.root, 'downloads', `java-${major}.zip`);
    await download(pkg.link, archive, { sha256: pkg.checksum }, {}, p => this.progress({ phase: `Java ${major}`, ...p }));
    const zip = new AdmZip(archive); const entries = zip.getEntries();
    for (const e of entries) if (!e.isDirectory) inside(destination, e.entryName);
    for (const e of entries) if (!e.isDirectory) { const out = inside(destination, e.entryName); await fs.mkdir(path.dirname(out), { recursive: true }); await fs.writeFile(out, e.getData()); }
    const javaEntry = entries.find(e => /\/bin\/java\.exe$/.test(e.entryName)); if (!javaEntry) throw new Error('В архиве Java нет java.exe');
    const executable = javaEntry.entryName; await exec(inside(destination, executable), ['-version'], { windowsHide: true });
    await atomicJson(marker, { executable, release: releases[0].release_name }); return inside(destination, executable);
  }
  async install(i) {
    const resource = path.join(this.root, 'minecraft');
    if (i.installedVersion) {
      try { const v = await Version.parse(resource, i.installedVersion); await fs.access(path.join(resource, 'versions', v.minecraftVersion, v.minecraftVersion + '.jar')); return { version: v, javaPath: await this.java(v.javaVersion?.majorVersion || i.javaMajor || 8), resource }; } catch (e) { if (!['ENOENT'].includes(e.code) && e.error !== 'MissingVersion') throw e; }
    }
    const manifest = await this.versions(); const meta = manifest.versions.find(v => v.id === i.minecraft); if (!meta) throw new Error('Версия Minecraft не найдена');
    const versionFile = inside(resource, `versions/${i.minecraft}/${i.minecraft}.json`);
    await download(meta.url, versionFile, meta.sha1 ? { sha1: meta.sha1 } : {});
    const descriptor = JSON.parse(await fs.readFile(versionFile, 'utf8')); const major = descriptor.javaVersion?.majorVersion || 8;
    const javaPath = await this.java(major);
    this.progress({ phase: 'Установка Minecraft ' + i.minecraft, detail: 'Клиент, библиотеки, звуки и ресурсы' });
    await this.installResources(await Version.parse(resource, i.minecraft), resource);
    let id = i.minecraft;
    this.progress({ phase: 'Установка ' + i.loader, detail: i.loaderVersion });
    if (i.loader === 'fabric') {
      const loaders = i.loaderVersion ? null : await json('https://meta.fabricmc.net/v2/versions/loader/' + encodeURIComponent(i.minecraft));
      const ver = i.loaderVersion || loaders.find(l => l.loader.stable)?.loader.version || loaders[0]?.loader.version;
      if (!ver) throw new Error('Fabric недоступен для этой версии');
      const artifact = await json(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(i.minecraft)}/${encodeURIComponent(ver)}/profile/json`);
      id = artifact.id; await atomicJson(inside(resource, `versions/${id}/${id}.json`), artifact); i.loaderVersion = ver;
    } else if (i.loader === 'quilt') {
      const loaders = i.loaderVersion ? null : await json('https://meta.quiltmc.org/v3/versions/loader/' + encodeURIComponent(i.minecraft));
      const ver = i.loaderVersion || loaders[0]?.loader.version; if (!ver) throw new Error('Quilt недоступен для этой версии');
      const artifact = await json(`https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(i.minecraft)}/${encodeURIComponent(ver)}/profile/json`);
      id = artifact.id; await atomicJson(inside(resource, `versions/${id}/${id}.json`), artifact); i.loaderVersion = ver;
    } else if (i.loader === 'forge') {
      let ver = i.loaderVersion;
      if (!ver) { const p = await json('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'); ver = p.promos[i.minecraft + '-recommended'] || p.promos[i.minecraft + '-latest']; }
      if (!ver) throw new Error('Укажите версию Forge');
      id = await installer.installForge({ mcversion: i.minecraft, version: ver }, resource, { java: javaPath, mavenHost: 'https://maven.minecraftforge.net' }); i.loaderVersion = ver;
    } else if (i.loader === 'neoforge') {
      if (!i.loaderVersion) throw new Error('Укажите версию NeoForge при создании сборки');
      id = await installer.installNeoForged('neoforge', i.loaderVersion, resource, { java: javaPath });
    }
    const version = await Version.parse(resource, id); if (i.loader !== 'vanilla') await this.installResources(version, resource);
    i.installedVersion = id; i.javaMajor = major; await this.save(); return { version, javaPath, resource };
  }
  async installResources(version, resource) {
    const jobs = new Map();
    const add = (relative, url, sha1) => { if (!url) throw new Error('Не указан адрес ресурса: ' + relative); jobs.set(relative, { file: inside(resource, relative), url: url.replace(/^http:/, 'https:'), hashes: sha1 ? { sha1 } : {} }); };
    const client = version.downloads.client;
    add(`versions/${version.minecraftVersion}/${version.minecraftVersion}.jar`, client.url, client.sha1);
    for (const lib of version.libraries) add('libraries/' + lib.download.path, lib.download.url || 'https://libraries.minecraft.net/' + lib.download.path, lib.download.sha1);
    const index = version.assetIndex;
    if (index) {
      const indexPath = inside(resource, 'assets/indexes/' + index.id + '.json');
      await download(index.url, indexPath, { sha1: index.sha1 });
      const assets = JSON.parse(await fs.readFile(indexPath, 'utf8'));
      for (const asset of Object.values(assets.objects)) { const h = asset.hash; if (!/^[a-f0-9]{40}$/.test(h)) throw new Error('Некорректный хеш ресурса'); add(`assets/objects/${h.slice(0,2)}/${h}`, `https://resources.download.minecraft.net/${h.slice(0,2)}/${h}`, h); }
    }
    const logging = version.logging?.client?.file;
    if (logging) add('assets/log_configs/' + logging.id, logging.url, logging.sha1);
    const queue = [...jobs.entries()]; const total = queue.length; let done = 0, failure;
    const results = await Promise.allSettled(Array.from({ length: Math.min(10,total) }, async () => {
      while(queue.length && !failure) {
        const [relative, job] = queue.shift();
        try { await download(job.url, job.file, job.hashes, {}, () => this.progress({ phase:'Ресурсы Minecraft', detail: relative, current:done, total })); this.progress({ phase:'Ресурсы Minecraft', detail:relative, current:++done, total }); }
        catch(e) { failure=e; throw e; }
      }
    }));
    const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
  }
  async import(file) {
    return this.exclusive(async () => {
      const id = crypto.randomUUID(); const folder = inside(this.root, 'instances/' + id);
      // A failed import stays unlisted and can be removed without touching user saves.
      const previous=this.state.selectedInstance;
      try {
        const index = await importPack(file, folder, this.state.settings, p => this.progress(p));
        const deps = index.dependencies; const loaderKey = Object.keys(deps).find(k => k !== 'minecraft');
        const loader = { 'fabric-loader': 'fabric', 'quilt-loader': 'quilt', forge: 'forge', neoforge: 'neoforge' }[loaderKey] || 'vanilla';
        const mods = index.files.filter(f=>f.env?.client!=='unsupported' && /^mods\/[^/]+\.jar$/i.test(f.path)).map(f=>{
          let source;for(const raw of f.downloads){const u=new URL(raw);const m=u.hostname==='cdn.modrinth.com' && u.pathname.match(/^\/data\/([^/]+)\/versions\/([^/]+)\//);if(m){source=m;break;}}
          return {file:path.posix.basename(f.path),name:path.posix.basename(f.path),...(source?{project:source[1],version:source[2]}:{})};
        });
        const i = { id, name: index.name || 'Импорт .mrpack', minecraft: deps.minecraft, loader, loaderVersion: deps[loaderKey] || '', created: Date.now(), mods };
        this.state.instances.push(i); this.state.selectedInstance = id; await this.save(); return i;
      } catch (e) { this.state.instances=this.state.instances.filter(i=>i.id!==id);this.state.selectedInstance=previous;await fs.rm(folder, { recursive: true, force: true, maxRetries:5, retryDelay:100 }).catch(()=>this.report({kind:'log',text:'Незавершённые файлы импорта остались в '+folder}));throw e; }
    });
  }
  async search({ query = '', type = 'mod', offset = 0, instanceId }) {
    const facets = [['project_type:' + (type === 'modpack' ? 'modpack' : 'mod')]];
    if (instanceId && type !== 'modpack') { const i = this.instance(instanceId); facets.push(['versions:' + i.minecraft]); if (i.loader !== 'vanilla') facets.push(['categories:' + i.loader]); }
    const p = new URLSearchParams({ query: String(query).slice(0,200), facets: JSON.stringify(facets), limit: '18', offset: String(Math.max(0, Math.min(10000, Number(offset) || 0))) });
    return json('https://api.modrinth.com/v2/search?' + p, this.state.settings.source === 'custom' ? { ...this.state.settings, source: 'proxy' } : {});
  }
  async projectVersions(project, instanceId, type) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(project)) throw new Error('Некорректный проект');
    const p = new URLSearchParams();
    if (instanceId && type !== 'modpack') { const i = this.instance(instanceId); if (i.loader === 'vanilla') throw new Error('Для модов создайте сборку Fabric, Forge, NeoForge или Quilt'); p.set('game_versions', JSON.stringify([i.minecraft])); p.set('loaders', JSON.stringify([i.loader])); }
    return json(`https://api.modrinth.com/v2/project/${project}/version?${p}`, this.apiSettings());
  }
  apiSettings() { return this.state.settings.source === 'custom' ? { ...this.state.settings, source: 'proxy' } : {}; }
  async installProject({ project, versionId, instanceId, type }) {
    if (type === 'modpack') {
      const versions = await this.projectVersions(project, null, type); const v = versions.find(v => v.id === versionId); if (!v) throw new Error('Версия не найдена');
      const f = v.files.find(f => f.primary && f.filename.endsWith('.mrpack')) || v.files.find(f => f.filename.endsWith('.mrpack')); if (!f) throw new Error('В версии нет .mrpack');
      // Serialize downloading separately, then import using the same mutation guard.
      const file = path.join(this.root, 'downloads', crypto.randomUUID() + '.mrpack');
      await this.exclusive(() => download(f.url, file, f.hashes, this.apiSettings(), p => this.progress({ phase: 'Скачивание сборки', ...p })));
      return this.import(file);
    }
    return this.exclusive(async () => {
      const i = this.instance(instanceId); const versions = await this.projectVersions(project, instanceId, type); const v = versions.find(v => v.id === versionId); if (!v) throw new Error('Версия не подходит для сборки');
      const visited = new Set(); const plan = new Map();
      const resolve = async (version, depth = 0) => {
        if (depth > 40) throw new Error('Слишком глубокое дерево зависимостей');
        if (visited.has(version.id)) return; visited.add(version.id);
        if (!version.game_versions.includes(i.minecraft) || !version.loaders.includes(i.loader)) throw new Error('Несовместимая зависимость: ' + version.name);
        if (plan.has(version.project_id) && plan.get(version.project_id).id !== version.id) throw new Error('Конфликт версий зависимостей');
        plan.set(version.project_id, version);
        for (const dep of version.dependencies || []) if (dep.dependency_type === 'required') {
          let child;
          if (dep.version_id) child = await json('https://api.modrinth.com/v2/version/' + encodeURIComponent(dep.version_id), this.apiSettings());
          else if (dep.project_id) child = (await this.projectVersions(dep.project_id, instanceId, 'mod'))[0];
          if (!child) throw new Error('Не найдена обязательная зависимость'); await resolve(child, depth + 1);
        }
      };
      await resolve(v);
      const staging = path.join(this.root, 'downloads', crypto.randomUUID()); await fs.mkdir(staging, { recursive: true });
      try {
        for (const version of plan.values()) {
          const f = version.files.find(f => f.primary) || version.files[0]; if (!f || !f.filename.endsWith('.jar')) throw new Error('В версии нет .jar');
          await download(f.url, inside(staging, f.filename), f.hashes, this.apiSettings(), p => this.progress({ phase: 'Установка модов', detail: f.filename, ...p }));
        }
        const files=[],records=[];
        for (const version of plan.values()) {
          const f = version.files.find(f => f.primary) || version.files[0];
          files.push({name:f.filename,source:inside(staging,f.filename)});records.push({ project: version.project_id, version: version.id, name: version.name, file: f.filename });
        }
        await commitMods(this,i.id,files,records);return { count: plan.size };
      } finally { await fs.rm(staging, { recursive: true, force: true, maxRetries:5, retryDelay:100 }).catch(()=>this.report({kind:'log',text:'Временные загрузки остались в '+staging})); }
    });
  }
  authManager() { const {MicrosoftAuth}=require('./microsoft.cjs');return new MicrosoftAuth(this.state.settings.clientId || MICROSOFT_CLIENT_ID,p=>this.progress(p)); }
  async microsoft() {
    if (!this.vault.available()) throw new Error('Шифрование учётных данных недоступно');
    const xbox = await this.authManager().launch('electron', { width: 520, height: 720, webPreferences: { nodeIntegration: false, contextIsolation: true } });
    const mc = await xbox.getMinecraft(); const token = mc.mclc();
    if (!token.uuid || !token.name || mc.isDemo()) throw new Error('У аккаунта нет лицензии Minecraft Java');
    const a = { id: token.uuid, name: token.name, type: 'microsoft', licenseVerified:true,licenseVerifiedAt:Date.now(),secret: this.vault.encrypt(xbox.save()) };
    this.state.accounts = this.state.accounts.filter(x => x.id !== a.id); this.state.accounts.push(a);
    this.state.selectedAccount = a.id; await this.save(); return this.snapshot();
  }
  async play(id) {
    return this.exclusive(async () => {
      const i = this.instance(id); const a = this.state.accounts.find(a => a.id === this.state.selectedAccount); if (!a) throw new Error('Добавьте аккаунт');
      let accessToken,profile;
      {
        const owner=a.type==='microsoft'?a:null;
        if(!owner || !owner.licenseVerified)throw Object.assign(new Error('Для запуска нужна проверенная лицензия Minecraft Java. Войдите через Microsoft с лицензированным аккаунтом.'),{code:'LICENSE_REQUIRED'});
        this.progress({ phase: 'Проверка аккаунта Microsoft' });
        let stored;try{stored=this.vault.decrypt(owner.secret);}catch{throw new Error('Не удалось расшифровать аккаунт Microsoft. Войдите заново в разделе «Аккаунты». Это может произойти после переноса данных в другую Windows.');}
        const xbox = await this.authManager().refresh(stored);
        owner.secret=this.vault.encrypt(xbox.save());await this.save();
        let mc;try{mc=await xbox.getMinecraft();}catch(e){if(e.code==='NO_LICENSE'){owner.licenseVerified=false;delete owner.licenseVerifiedAt;await this.save();}throw e;}const token = mc.mclc();
        owner.licenseVerified=true;owner.licenseVerifiedAt=Date.now();
        accessToken = token.access_token; profile = { id: token.uuid, name: token.name };
      }
      const { version, javaPath, resource } = await this.install(i);
      this.progress({ phase: 'Запуск Minecraft', detail: i.name });
      const proc = await launch({ gamePath: this.folder(i.id), resourcePath: resource, javaPath, version, gameProfile: profile, accessToken, minMemory: 512, maxMemory: this.state.settings.memory, launcherName: 'Stasya Launcher', launcherBrand: require('../package.json').version, resolution: { width: 1280, height: 720 }, extraExecOption: { windowsHide: true }, extraJVMArgs: ['-XX:+UseG1GC'] });
      this.process = proc; const secrets = [accessToken];
      const log = b => { let message = b.toString(); for (const secret of secrets) if (secret.length > 4) message = message.split(secret).join('[REDACTED]'); this.report({ kind: 'log', text: message }); };
      proc.stdout?.on('data', log); proc.stderr?.on('data', log);
      let ended=false;
      const finish=(code,error)=>{if(ended)return;ended=true;if(error)log(Buffer.from(error.message));const stopped=!!this.stopping;this.process=null;this.stopping=false;this.report({kind:'exit',code,stopped});this.report({kind:'state',state:this.snapshot()});};
      proc.once('error', e => finish(-1,e));proc.once('exit', code=>finish(code));
      i.lastPlayed = Date.now(); await this.save(); return { pid: proc.pid };
    }, 'Подготавливаем Minecraft к запуску. Это может занять несколько минут.');
  }
  stop() {
    if(!this.process || this.stopping)return;
    this.stopping=true;this.report({kind:'state',state:this.snapshot()});
    if(!this.process.kill()){this.stopping=false;this.report({kind:'state',state:this.snapshot()});throw new Error('Не удалось остановить Minecraft. Закройте окно игры.');}
  }
  async repair(id) {
    return this.exclusive(async()=>{const i=this.instance(id);const previous=i.installedVersion;delete i.installedVersion;try{await this.install(i);}catch(e){i.installedVersion=previous;throw e;}},'Проверяем и восстанавливаем файлы сборки. Миры и моды сохранятся.');
  }
}
module.exports = { Engine };

