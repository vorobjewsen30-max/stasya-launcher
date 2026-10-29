process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL ||= '1';
const {build,Platform,Arch}=require('electron-builder');
build({targets:Platform.WINDOWS.createTarget(['portable','nsis'],Arch.x64),config:{win:{signExecutable:!!(process.env.CSC_LINK || process.env.WIN_CSC_LINK)},nsis:{oneClick:false,perMachine:false,allowToChangeInstallationDirectory:true,deleteAppDataOnUninstall:false,createDesktopShortcut:true,createStartMenuShortcut:true,artifactName:'Stasya-Launcher-Setup-${version}-Windows-x64.exe'}}}).catch(e=>{console.error(e);process.exitCode=1;});
