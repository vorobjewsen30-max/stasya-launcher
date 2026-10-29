const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),pkg=require('../package.json');
if(pkg.name!=='stasya-launcher')throw new Error('Only the official application may be packaged for the Store');
const preview=process.argv.includes('--preview');const identityFile=process.argv.find(x=>x.startsWith('--identity='));
const identity=preview?{name:'StasyaLauncher.PackagingPreview',publisher:'CN=StasyaLauncherPackagingPreview',publisherDisplayName:'Stasya Launcher'}:identityFile?JSON.parse(fs.readFileSync(path.resolve(identityFile.slice(11)),'utf8')):{};
if(!/^[a-zA-Z0-9][a-zA-Z0-9.-]{2,49}$/.test(identity.name || '') || !identity.publisher?.startsWith('CN=') || !identity.publisherDisplayName)throw new Error('Supply the exact Partner Center identity with --identity=path/to/identity.json. Do not use the Entra Client ID. Use --preview only for local package validation.');
const source=path.join(root,'release/win-unpacked');if(!fs.existsSync(path.join(source,'Stasya Launcher.exe')))throw new Error('Run npm run build first');
const output=path.join(root,'release/store'),staging=path.join(output,'staging-'+Date.now());fs.mkdirSync(staging,{recursive:true});fs.cpSync(source,staging,{recursive:true});
function run(command,args){const result=spawnSync(command,args,{stdio:'inherit',windowsHide:true});if(result.error)throw result.error;if(result.status!==0)throw new Error(command+' failed ('+result.status+')');}
run('powershell.exe',['-NoProfile','-File',path.join(__dirname,'store-assets.ps1'),'-Source',path.join(root,'assets/app-icon.png'),'-Destination',path.join(staging,'StoreAssets')]);
const xml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');const [major,minor,patch]=pkg.version.split('.').map(Number);const packageVersion=[major+1,minor,patch,0].join('.');
const manifest=`<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10" xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10" xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities" IgnorableNamespaces="uap rescap">
 <Identity Name="${xml(identity.name)}" Publisher="${xml(identity.publisher)}" Version="${packageVersion}" ProcessorArchitecture="x64" />
 <Properties><DisplayName>Stasya Launcher</DisplayName><PublisherDisplayName>${xml(identity.publisherDisplayName)}</PublisherDisplayName><Logo>StoreAssets\\StoreLogo.png</Logo></Properties>
 <Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.19041.0" MaxVersionTested="10.0.26100.0" /></Dependencies>
 <Resources><Resource Language="ru-RU" /></Resources>
 <Applications><Application Id="StasyaLauncher" Executable="Stasya Launcher.exe" EntryPoint="Windows.FullTrustApplication"><uap:VisualElements DisplayName="Stasya Launcher" Description="Minecraft Java launcher with Modrinth and instance management" Square150x150Logo="StoreAssets\\Square150x150Logo.png" Square44x44Logo="StoreAssets\\Square44x44Logo.png" BackgroundColor="#15111f" /></Application></Applications>
 <Capabilities><rescap:Capability Name="runFullTrust" /></Capabilities>
</Package>`;
fs.writeFileSync(path.join(staging,'AppxManifest.xml'),manifest);const sdk='C:/Program Files (x86)/Windows Kits/10/bin';const versions=fs.readdirSync(sdk).filter(v=>/^10\./.test(v)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));const makeappx=versions.map(v=>path.join(sdk,v,'x64/makeappx.exe')).reverse().find(f=>fs.existsSync(f));if(!makeappx)throw new Error('Windows SDK MakeAppx.exe not found');
const filename='Stasya-Launcher-'+pkg.version+(preview?'-MSIX-PREVIEW-UNSIGNED':'-Store-UNSIGNED')+'.msix';run(makeappx,['pack','/d',staging,'/p',path.join(output,filename),'/o']);
fs.writeFileSync(path.join(output,'package-validation.json'),JSON.stringify({version:pkg.version,packageVersion,preview,identity,signed:false,storeCertified:false,makeappxValidated:true,filename},null,2));
console.log('MSIX_CREATED',path.join(output,filename));
