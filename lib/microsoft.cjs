const crypto = require('node:crypto');
const { PublicClientApplication, LogLevel } = require('@azure/msal-node');
const { authResponse } = require('./network.cjs');
const { MICROSOFT_CLIENT_ID, MICROSOFT_REDIRECT_URI } = require('./config.cjs');
const SCOPES = ['XboxLive.signin', 'offline_access'];
function authError(message,code){return Object.assign(new Error(message),{code});}
function createPkce() {
  const verifier = crypto.randomBytes(48).toString('base64url');
  return { verifier, challenge:crypto.createHash('sha256').update(verifier).digest('base64url'), state:crypto.randomBytes(32).toString('base64url') };
}
function parseCallback(value, expectedState) {
  const u = new URL(value), redirect = new URL(MICROSOFT_REDIRECT_URI);
  if (u.origin !== redirect.origin || u.pathname !== redirect.pathname) return null;
  if (u.searchParams.get('state') !== expectedState) throw new Error('Проверка входа не пройдена. Закройте окно и начните вход заново.');
  if (u.searchParams.get('error')) throw new Error(u.searchParams.get('error') === 'access_denied' ? 'Вход Microsoft отменён.' : 'Microsoft отклонил вход. Попробуйте ещё раз.');
  const code = u.searchParams.get('code'); if (!code) throw new Error('Microsoft не вернул код входа.');
  return code;
}
async function msalRequest(url, options = {}) {
  const response = await authResponse(url, { method:options.method || 'GET', headers:options.headers, body:options.body });
  return { status:response.status, headers:Object.fromEntries(response.headers), body:await response.json() };
}
function createClient(clientId) {
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(clientId)) throw new Error('Некорректный Microsoft Client ID.');
  return new PublicClientApplication({ auth:{clientId,authority:'https://login.microsoftonline.com/consumers'}, system:{ loggerOptions:{logLevel:LogLevel.Error,piiLoggingEnabled:false,loggerCallback:()=>{}}, networkClient:{sendGetRequestAsync:(url,o)=>msalRequest(url,o),sendPostRequestAsync:(url,o)=>msalRequest(url,{...o,method:'POST'})} } });
}
async function xboxRequest(url, payload, stage, bearer) {
  const response = await authResponse(url, { method:payload ? 'POST':'GET', headers:{'Content-Type':'application/json',Accept:'application/json',...(bearer ? {Authorization:'Bearer '+bearer}: {})}, ...(payload ? {body:JSON.stringify(payload)} : {}) });
  const body = await response.json().catch(()=>({}));
  if (!response.ok) {
    const xerr = Number(body.XErr);
    if (xerr === 2148916233) throw new Error('Для этого Microsoft-аккаунта нужно сначала создать профиль Xbox.');
    if (xerr === 2148916238) throw new Error('Для детского Xbox-аккаунта требуется настройка семейного доступа взрослым.');
    if (xerr === 2148916235) throw new Error('Xbox недоступен для региона этого аккаунта.');
    if (stage === 'minecraft' && response.status === 403) throw authError('Minecraft Services отклонил OAuth-приложение Stasya Launcher (403). Для нового Client ID может требоваться одобрение Mojang.','APP_NOT_APPROVED');
    if (stage === 'profile' && response.status === 404) throw authError('У аккаунта нет профиля Minecraft Java. Создайте игровой профиль на minecraft.net.','PROFILE_REQUIRED');
    if (response.status === 401) throw new Error('Сеанс Microsoft истёк. Войдите в аккаунт заново.');
    throw new Error(`Не удалось завершить вход (${stage}, HTTP ${response.status}). Попробуйте позже.`);
  }
  return body;
}
class MicrosoftSession {
  constructor(client, result, progress, clientId) { this.client=client;this.result=result;this.progress=progress;this.clientId=clientId; }
  save() { return JSON.stringify({schema:1,clientId:this.clientId,accountId:this.result.account.homeAccountId,cache:this.client.getTokenCache().serialize()}); }
  async getMinecraft() {
    this.progress({phase:'Вход в Xbox Live'});
    const xbox = await xboxRequest('https://user.auth.xboxlive.com/user/authenticate',{Properties:{AuthMethod:'RPS',SiteName:'user.auth.xboxlive.com',RpsTicket:'d='+this.result.accessToken},RelyingParty:'http://auth.xboxlive.com',TokenType:'JWT'},'xbox');
    if (!xbox.Token) throw new Error('Xbox не вернул токен входа.');
    const xsts = await xboxRequest('https://xsts.auth.xboxlive.com/xsts/authorize',{Properties:{SandboxId:'RETAIL',UserTokens:[xbox.Token]},RelyingParty:'rp://api.minecraftservices.com/',TokenType:'JWT'},'xsts');
    const hash=xsts.DisplayClaims?.xui?.[0]?.uhs;
    if (!hash || !xsts.Token) throw new Error('Xbox не вернул данные игрового профиля.');
    this.progress({phase:'Проверка лицензии Minecraft Java'});
    const minecraft=await xboxRequest('https://api.minecraftservices.com/authentication/login_with_xbox',{identityToken:`XBL3.0 x=${hash};${xsts.Token}`},'minecraft');
    if (!minecraft.access_token) throw new Error('Minecraft Services не вернул токен входа.');
    const entitlements=await xboxRequest('https://api.minecraftservices.com/entitlements/mcstore',null,'entitlements',minecraft.access_token);
    if(!Array.isArray(entitlements.items))throw new Error('Не удалось проверить владение Minecraft Java. Попробуйте позже.');
    if(!entitlements.items.some(item=>['game_minecraft','product_minecraft'].includes(item.name)))throw authError('На этом Microsoft-аккаунте не найдена лицензия Minecraft Java. Войдите с другим аккаунтом, на котором есть лицензия.','NO_LICENSE');
    const profile=await xboxRequest('https://api.minecraftservices.com/minecraft/profile',null,'profile',minecraft.access_token);
    if (!/^[a-f0-9]{32}$/i.test(profile.id || '') || !/^[a-z0-9_]{1,16}$/i.test(profile.name || '')) throw new Error('Не удалось получить профиль Minecraft Java.');
    return {isDemo:()=>false,mclc:()=>({uuid:profile.id,name:profile.name,access_token:minecraft.access_token})};
  }
}
class MicrosoftAuth {
  constructor(clientId = MICROSOFT_CLIENT_ID, progress = ()=>{}) { this.clientId=clientId || MICROSOFT_CLIENT_ID;this.progress=progress;this.client=createClient(this.clientId); }
  async launch(_framework, properties = {}) {
    const { BrowserWindow } = require('electron');const pkce=createPkce();
    const url=await this.client.getAuthCodeUrl({scopes:SCOPES,redirectUri:MICROSOFT_REDIRECT_URI,prompt:'select_account',state:pkce.state,codeChallenge:pkce.challenge,codeChallengeMethod:'S256'});
    this.progress({phase:'Завершите вход Microsoft в открывшемся окне'});
    const code=await new Promise((resolve,reject)=>{
      const view=new BrowserWindow({...properties,title:'Вход в Stasya Launcher · Microsoft',autoHideMenuBar:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,partition:'stasya-auth-'+crypto.randomUUID()}});
      let settled=false;
      const timer=setTimeout(()=>finish(new Error('Время ожидания входа истекло. Попробуйте войти ещё раз.')),10*60*1000);
      const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);if(!view.isDestroyed())view.destroy();error?reject(error):resolve(value);};
      const capture=(event,target)=>{try{const value=parseCallback(target,pkce.state);if(value){event.preventDefault();finish(null,value);}}catch(e){event.preventDefault();finish(e);}};
      view.webContents.setWindowOpenHandler(()=>({action:'deny'}));
      view.webContents.session.setPermissionRequestHandler((_,__,cb)=>cb(false));
      view.webContents.on('will-redirect',capture);view.webContents.on('will-navigate',capture);
      view.on('closed',()=>finish(new Error('Вход Microsoft отменён.')));
      view.webContents.on('did-fail-load',(_,code)=>{if(code!==-3)finish(new Error('Не удалось открыть страницу Microsoft. Проверьте подключение к интернету.'));});
      view.loadURL(url).catch(()=>finish(new Error('Не удалось открыть страницу Microsoft.')));
    });
    let result;try{result=await this.client.acquireTokenByCode({code,scopes:SCOPES,redirectUri:MICROSOFT_REDIRECT_URI,codeVerifier:pkce.verifier});}catch{throw new Error('Microsoft не подтвердил вход. Проверьте настройки OAuth-приложения и попробуйте снова.');}
    return new MicrosoftSession(this.client,result,this.progress,this.clientId);
  }
  async refresh(secret) {
    let saved;try{saved=JSON.parse(secret);}catch{throw new Error('Этот аккаунт добавлен в старой версии лаунчера. В разделе «Аккаунты» нажмите «Войти через Microsoft» и войдите заново.');}
    if(saved.schema!==1 || saved.clientId!==this.clientId)throw new Error('OAuth-приложение изменилось. Войдите в Microsoft заново.');
    try{
      this.client.getTokenCache().deserialize(saved.cache);const account=await this.client.getTokenCache().getAccountByHomeId(saved.accountId);
      if(!account)throw new Error('No account');
      const result=await this.client.acquireTokenSilent({account,scopes:SCOPES,forceRefresh:true});return new MicrosoftSession(this.client,result,this.progress,this.clientId);
    }catch{throw new Error('Не удалось обновить сеанс Microsoft. Проверьте интернет или войдите в аккаунт заново.');}
  }
}
module.exports={MicrosoftAuth,MicrosoftSession,createPkce,parseCallback,createClient,xboxRequest,authError};

