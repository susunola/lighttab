#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),{execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..');process.chdir(root);
const version=JSON.parse(fs.readFileSync('manifest.json')).version;
execFileSync(process.execPath,['scripts/smoke.cjs'],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/build-singlefile.cjs'],{stdio:'inherit'});
const stage=fs.mkdtempSync(path.join(os.tmpdir(),'lighttab-package-'));
try {
 for(const name of ['manifest.json','newtab.html','privacy.html','LICENSE','js','css','icons'])fs.cpSync(name,path.join(stage,name),{recursive:true});
 for(const name of ['assets/wallpaper-dusk.jpg','assets/wallpaper-blue-hour-plum.jpg','assets/engines/workbuddy.png','assets/fonts/inter-var-latin.woff2','assets/fonts/OFL.txt']){fs.mkdirSync(path.dirname(path.join(stage,name)),{recursive:true});fs.copyFileSync(name,path.join(stage,name));}
 fs.mkdirSync('dist',{recursive:true});const out=path.join(root,'dist',`lighttab-${version}-chrome.zip`);
 if(fs.existsSync(out))fs.unlinkSync(out);
 execFileSync('zip',['-qr',out,'.'],{cwd:stage});execFileSync('unzip',['-t',out],{stdio:'inherit'});console.log(out);
} finally {fs.rmSync(stage,{recursive:true,force:true});}
