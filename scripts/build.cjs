process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL ||= '1';
const {build,Platform,Arch}=require('electron-builder');
build({targets:Platform.WINDOWS.createTarget(['portable'],Arch.x64)}).catch(e=>{console.error(e);process.exitCode=1;});
