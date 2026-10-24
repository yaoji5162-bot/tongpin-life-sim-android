// Exercise the real game/save scripts across separate launches with a durable backend.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('app/src/main/assets/index.html','utf8');
const engine=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const persistence=fs.readFileSync('app/src/main/assets/persistence.js','utf8');
function element(){const classes=new Set();let rawHTML='';const n={value:'',textContent:'',style:{},dataset:{},disabled:false,checked:false,open:false,firstChild:{textContent:''},children:[],listeners:{},classList:{add(x){classes.add(x)},remove(x){classes.delete(x)},toggle(x,force){const on=force===undefined?!classes.has(x):force;on?classes.add(x):classes.delete(x);return on;},contains(x){return classes.has(x)}},setAttribute(k,v){this[k]=v},getAttribute(k){return this[k]??null},removeAttribute(k){delete this[k]},appendChild(child){this.children.push(child)},replaceChildren(...items){this.children=items},addEventListener(k,fn){this.listeners[k]=fn},removeEventListener(){},remove(){},click(){this.onclick?.()},showModal(){this.open=true},close(){this.open=false},querySelector(selector){if(selector==='img')return this.children.find(c=>c.tagName==='IMG')||null;return null;},get options(){return this.children},getBoundingClientRect(){return {top:0,left:0,right:400,bottom:600}}};Object.defineProperty(n,'innerHTML',{get:()=>rawHTML,set:v=>{rawHTML=v;n.children=[]}});return n;}
async function launch(disk, edits=''){
 const els={};for(const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)){const e=element(),value=match[0].match(/\bvalue="([^"]*)"/);if(value)e.value=value[1];els[match[1]]=e;}
 const gender=['男','女','双性','扶她'].map(g=>Object.assign(element(),{dataset:{gender:g}}));
 const collections={};for(const [selector,name,count] of [['[data-panel]','panel',3],['[data-page]','page',3],['[data-setting-panel]','settingPanel',4],['[data-setting]','setting',4],['[data-nurture]','nurture',3]])collections[selector]=Array.from({length:count},(_,i)=>Object.assign(element(),{dataset:{[name]:String(i)}}));collections['[data-gender]']=gender;
 const native={loadSave:()=>disk.main||'',loadBackup:()=>disk.backup||'',saveGame(text){if(disk.fail)return false;if(disk.main){try{const old=JSON.parse(disk.main);if(old.format==='aevum')disk.backup=disk.main;}catch{}}disk.main=text;disk.writes=(disk.writes||0)+1;return true;},exportSave(text){disk.exported=text;}};
 const document={getElementById:id=>els[id]??=element(),querySelectorAll:s=>collections[s]||[],createElement:t=>Object.assign(element(),{tagName:t.toUpperCase()}),createTextNode:text=>({textContent:text}),body:element(),addEventListener(){},visibilityState:'visible'};
 const context={document,console,URL,Blob,Date,Response,Promise,Uint32Array,AbortController,DOMException,TypeError,Math,JSON,AevumNative:native,confirm:()=>true,setTimeout(fn,ms){if(ms===1100)fn();return 1},clearTimeout(){},addEventListener(){},crypto:{getRandomValues(a){a[0]=2100000000;return a}},fetch:async()=>({ok:true,json:async()=>({choices:[{message:{content:'今天也一起看看窗外吧。'}}]})})};context.window=context;
 vm.createContext(context);vm.runInContext(engine+edits,context);vm.runInContext(persistence,context);await context.AevumSave.boot();return {context,els,run:source=>vm.runInContext(source,context)};
}
(async()=>{
 const disk={};let a=await launch(disk);assert(disk.main);assert.equal(JSON.parse(disk.main).schemaVersion,1);
 a.run('chooseGender("女");care(4);care(5);care(0)');await a.context.AevumSave.flush();assert.equal(JSON.parse(disk.main).game.turn,3);
 // A new app launch / upgraded implementation loads the egg without resetting it.
 let b=await launch(disk);assert.equal(b.run('turn'),3);assert.equal(b.run('gender'),'女');b.run('for(let i=0;i<5;i++)care(i);hatch();nurture(0)');b.els.apiPersona.value='有主见，说话简短';b.els.apiKey.value='secret-do-not-export';b.els.imageKey.value='another-private-key';b.els.apiBase.value='https://example.test/v1';
 b.run("chatHistory.push({role:'user',content:'你好呀'},{role:'assistant',content:'我记得你。'});for(let i=0;i<7;i++)advanceBond()");
 const image=element();image.tagName='IMG';image.setAttribute('src','data:image/png;base64,aGVsbG8=');b.els.portrait.replaceChildren(image);await b.context.AevumSave.persist();
 const saved=JSON.parse(disk.main);assert(saved.game.hatched);assert.equal(saved.game.image,'data:image/png;base64,aGVsbG8=');assert(!disk.main.includes('secret-do-not-export'));assert(!disk.main.includes('another-private-key'));assert.equal(saved.settings.persona,'有主见，说话简短');
 const c=await launch(disk);assert.equal(c.run('hatched.kind'),saved.game.hatched.kind);assert.equal(c.run('bond'),saved.game.bond);assert.equal(c.run('stageIndex'),1);assert.equal(c.run('chatHistory.at(-1).content'),'我记得你。');assert.equal(c.els.apiPersona.value,'有主见，说话简短');assert.equal(c.els.portrait.querySelector('img').getAttribute('src'),saved.game.image);assert.equal(c.els.chatDialog.open,false);
 // A future release that keeps the schema and merely changes UI text preserves saves.
 const upgraded=await launch(disk,";document.getElementById('title').textContent='更新后的界面';");assert.equal(upgraded.run('hatched.kind'),saved.game.hatched.kind);assert.equal(upgraded.run('bond'),saved.game.bond);
 const future=JSON.parse(disk.main);future.schemaVersion=99;const futureRaw=JSON.stringify(future),protectedDisk={main:futureRaw,backup:disk.backup};const old=await launch(protectedDisk);old.run('care(0)');await old.context.AevumSave.flush();assert.equal(protectedDisk.main,futureRaw);assert.equal(protectedDisk.writes,undefined);
 const recovered=await launch({main:'{broken',backup:disk.main});assert.equal(recovered.run('hatched.kind'),saved.game.hatched.kind);
 const missing=await launch({backup:disk.main});assert.equal(missing.run('hatched.kind'),saved.game.hatched.kind);
 assert.throws(()=>c.context.AevumSave.validate({format:'other',schemaVersion:1}),/不是/);
 const malicious=JSON.parse(disk.main);malicious.game.image='javascript:alert(1)';assert.equal(c.context.AevumSave.validate(malicious).game.image,'');assert.equal(c.run('hatched.kind'),saved.game.hatched.kind);
 // Import is non-destructive on invalid input; valid import also stores the previous save.
 c.els.saveInput.files=[{size:10,text:async()=>'{bad'}];const before=disk.main;await c.els.saveInput.listeners.change();assert.equal(disk.main,before);
 c.els.saveInput.files=[{size:disk.main.length,text:async()=>disk.main}];await c.els.saveInput.listeners.change();assert.equal(c.run('hatched.kind'),saved.game.hatched.kind);assert(disk.backup);
 await c.els.exportGame.onclick();assert(disk.exported);assert.equal(JSON.parse(disk.exported).game.chatHistory.at(-1).content,'我记得你。');assert(!disk.exported.includes('secret-do-not-export'));
 const noWrite=await launch({fail:true});noWrite.run('care(0)');assert(noWrite.els.saveStatus.textContent.includes('失败'));
 // Existing gameplay guards and API selectors remain in place.
 assert.equal(c.run('turn'),8);assert.equal(c.run('modelState.chat.ids.length'),0);assert.equal(c.run('hatched.basePersonality.short'),saved.game.hatched.baseScores?c.run('describeBehavior(hatched.baseScores).short'):'');
 console.log('PASS: cross-launch egg/role/image/chat/personality/settings persistence; schema-preserving upgrade; higher-version protection; backup recovery; import/export; secret exclusion; storage-failure notice.');
})().catch(error=>{console.error(error);process.exit(1)});
