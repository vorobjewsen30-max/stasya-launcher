const { contextBridge, ipcRenderer } = require('electron');
const methods = ['state','versions','create','select','settings','microsoft','removeAccount','import','search','projectVersions','installProject','play','stop','repair','openFolder','mods','toggleMod','pickJava'];
contextBridge.exposeInMainWorld('stasya', Object.fromEntries([
  ...methods.map(method => [method, async (...args) => { const r = await ipcRenderer.invoke('stasya:' + method, ...args); if (!r.ok) throw Object.assign(new Error(r.error),{code:r.code}); return r.value; }]),
  ['onEvent', listener => { const cb = (_, e) => listener(e); ipcRenderer.on('stasya:event', cb); return () => ipcRenderer.removeListener('stasya:event', cb); }],
]));
