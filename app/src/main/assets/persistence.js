/* v1 save contract. Keep file names, database name, package and asset origin stable. */
(() => {
  'use strict';
  const FORMAT='aevum', VERSION=1, DB_NAME='aevum-saves', STORE='snapshots';
  let ready=false, readOnly=false, db=null, queue=Promise.resolve(), lastRaw='', cacheTask=null;
  const app={reset,care,nurture,sendChat,generateArt,chooseGender,advanceBond,refreshModels,refreshArtPrompt};
  const gate=document.createElement('div');gate.className='storage-gate';gate.textContent='正在读取存档…';document.body.appendChild(gate);
  const number=(v,f,min,max)=>Number.isFinite(v)?Math.min(max,Math.max(min,v)):f;
  const strings=v=>Array.isArray(v)&&v.every(x=>typeof x==='string')?v.slice():[];
  const scores=v=>Object.fromEntries(Object.keys(behaviorLabels).map(k=>[k,number(v?.[k],10,0,1000)]));
  function status(text){$('saveStatus').textContent=text;}
  function warn(text){let box=$('saveWarning');if(!box){box=document.createElement('div');box.id='saveWarning';box.className='save-warning';document.body.appendChild(box);}box.replaceChildren();const span=document.createElement('span');span.textContent=text;box.appendChild(span);const button=document.createElement('button');button.textContent='知道了';button.onclick=()=>box.remove();box.appendChild(button);}
  function imageSource(){return $('portrait').querySelector('img')?.getAttribute('src')||'';}
  function safeImage(src){if(typeof src!=='string')return '';if(/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/.test(src))return src;try{const u=new URL(src);if(u.protocol==='https:'&&!u.username&&!u.password)return u.href;}catch{}return '';}
  function snapshot(){return {format:FORMAT,schemaVersion:VERSION,savedAt:new Date().toISOString(),game:{weights:[...weights],turn,gender,eggHistory:[...history],hatched:hatched?{kind:hatched.kind,gender:hatched.gender,care:[...hatched.care],baseScores:{...hatched.baseScores}}:null,needs:{...needs},bond,behaviorScores:{...behaviorScores},moments:[...moments],recentCare:[...recentCare],chatHistory:chatHistory.map(m=>({role:m.role,content:m.content})),image:safeImage(imageSource()),feedback:$('feedback').textContent},settings:{apiBase:$('apiBase').value,imageBase:$('imageBase').value,apiModel:$('apiModel').value||pendingModels.chat,imageModel:$('imageModel').value||pendingModels.image,persona:$('apiPersona').value,artStyle:$('artStyle').value,imagePrompt:$('imagePrompt').value}};}
  function validate(raw){
    const data=typeof raw==='string'?JSON.parse(raw):raw;
    if(!data||data.format!==FORMAT)throw new Error('这不是 Aevum 存档，原存档未更改。');
    if(data.schemaVersion>VERSION)throw new Error('存档版本高于当前应用，请升级应用；不会覆盖这份存档。');
    if(data.schemaVersion!==VERSION||!data.game||typeof data.game!=='object')throw new Error('存档版本或内容不完整。');
    const g=data.game;if(!Array.isArray(g.weights)||g.weights.length!==species.length||!g.weights.every(x=>Number.isFinite(x)&&x>0))throw new Error('存档的孵化数据损坏。');
    if(!Number.isInteger(g.turn)||g.turn<0||g.turn>8||!['男','女','双性','扶她'].includes(g.gender))throw new Error('存档的角色数据损坏。');
    let pet=null;
    if(g.hatched){const template=species.find(p=>p.kind===g.hatched.kind);if(!template||!['男','女','双性','扶她'].includes(g.hatched.gender))throw new Error('存档包含未知的角色种族或性别。');const base=scores(g.hatched.baseScores);pet={...template,gender:g.hatched.gender,care:strings(g.hatched.care),baseScores:base,basePersonality:describeBehavior(base)};}
    if(!Array.isArray(g.chatHistory)||!g.chatHistory.every(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string'))throw new Error('聊天存档格式不完整。');
    return {format:FORMAT,schemaVersion:VERSION,savedAt:data.savedAt,game:{weights:[...g.weights],turn:pet?8:g.turn,gender:g.gender,eggHistory:strings(g.eggHistory),hatched:pet,needs:{mood:number(g.needs?.mood,70,0,100),full:number(g.needs?.full,60,0,100),clean:number(g.needs?.clean,70,0,100)},bond:number(g.bond,0,0,1000000),behaviorScores:scores(g.behaviorScores),moments:strings(g.moments).slice(0,30),recentCare:strings(g.recentCare).slice(-6),chatHistory:g.chatHistory.map(m=>({role:m.role,content:m.content})),image:safeImage(g.image),feedback:typeof g.feedback==='string'?g.feedback:''},settings:data.settings&&typeof data.settings==='object'?data.settings:{}};
  }
  function openDatabase(){return new Promise((resolve,reject)=>{if(!window.indexedDB){reject(new Error('当前浏览器不支持自动存档'));return;}const request=indexedDB.open(DB_NAME,1);request.onupgradeneeded=()=>request.result.createObjectStore(STORE);request.onsuccess=()=>{db=request.result;db.onversionchange=()=>db.close();resolve();};request.onerror=()=>reject(new Error('浏览器拒绝了本地存储'));request.onblocked=()=>reject(new Error('请关闭其他 Aevum 页面后重试'));});}
  async function readStored(key){if(window.AevumNative)return key==='main'?AevumNative.loadSave():AevumNative.loadBackup();if(!db)return '';return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),r=tx.objectStore(STORE).get(key);r.onsuccess=()=>resolve(r.result||'');r.onerror=()=>reject(r.error);});}
  async function writeStored(text){
    if(window.AevumNative){if(!AevumNative.saveGame(text))throw new Error('设备未能写入存档');return;}
    if(!db)throw new Error('自动存档暂不可用');
    return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),r=store.get('main');r.onsuccess=()=>{if(r.result){try{const old=JSON.parse(r.result);if(old.format===FORMAT&&old.schemaVersion>=1)store.put(r.result,'backup');}catch{}}store.put(text,'main');};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
  }
  function persist(){if(!ready||readOnly)return Promise.resolve(false);const text=JSON.stringify(snapshot());if(window.AevumNative){try{if(!AevumNative.saveGame(text))throw new Error();lastRaw=text;status('已自动保存 · '+new Date().toLocaleTimeString());return Promise.resolve(true);}catch{status('自动保存失败，请立即导出存档');warn('自动存档失败，进度仍在当前页面。请先导出，暂时不要关闭应用。');return Promise.resolve(false);}}queue=queue.catch(()=>{}).then(async()=>{try{await writeStored(text);lastRaw=text;status('已自动保存 · '+new Date().toLocaleTimeString());return true;}catch{status('自动保存失败，请立即导出存档');warn('自动存档失败，进度仍在当前页面。请到设置 → 角色导出存档，暂时不要关闭应用。');return false;}});return queue;}
  function restore(data){
    const g=data.game;app.reset();weights=[...g.weights];turn=g.turn;gender=g.gender;history=[...g.eggHistory];needs={...g.needs};bond=g.bond;stageIndex=bond>=18?2:bond>=6?1:0;behaviorScores={...g.behaviorScores};moments=[...g.moments];recentCare=[...g.recentCare];hatched=g.hatched;done=!!hatched;busy=false;
    if(hatched){$('egg').classList.add('hidden');$('portrait').classList.remove('hidden');$('roomInfo').classList.remove('hidden');$('careStrip').classList.remove('hidden');$('companionPage').classList.add('hatched');$('chatPanel').classList.remove('hidden');$('artPanel').classList.remove('hidden');$('artEmpty').classList.add('hidden');$('genderToggle').classList.add('hidden');$('title').textContent='原来，等到的是你。';artPlaceholder();updateGrowth();renderAgeActions();$('chatTitle').textContent='和'+hatched.who.split(' · ').pop()+'聊一聊';chatHistory=g.chatHistory.map(m=>({...m}));$('chatMessages').replaceChildren();for(const message of chatHistory)bubble(message.role,message.content);if(g.image){const image=document.createElement('img');image.alt=hatched.who+' · '+stages[stageIndex].name+'的立绘';image.referrerPolicy='no-referrer';image.onerror=()=>setImageStatus('存档已恢复，但图片加载失败；原图片数据仍保留在存档中。',true);image.src=g.image;$('portrait').replaceChildren(image);}app.refreshArtPrompt();setImageStatus(g.image?'立绘与成长进度已恢复。':'进度已恢复，可继续配置或生成立绘。');chatStatus('对话已恢复。API Key 不保存在存档中，请在需要时重新填写。');}
    else{$('egg').className='egg'+(turn>=6?' cracked':'');chatHistory=[];}
    const settings=data.settings;
    for(const [key,id]of Object.entries({apiBase:'apiBase',imageBase:'imageBase',persona:'apiPersona',artStyle:'artStyle',imagePrompt:'imagePrompt'}))if(typeof settings[key]==='string')$(id).value=settings[key];
    if(hatched&&typeof settings.imagePrompt!=='string')app.refreshArtPrompt();
    for(const kind of ['chat','image'])invalidateModels(kind);
    pendingModels.chat=typeof settings.apiModel==='string'?settings.apiModel:'';pendingModels.image=typeof settings.imageModel==='string'?settings.imageModel:'';
    render();renderNeeds();$('feedback').textContent=g.feedback||'上次的陪伴，仍然留在这里。';
  }
  const pendingModels={chat:'',image:''};
  async function cacheArtwork(){if(cacheTask)return cacheTask;const src=imageSource(),pet=hatched,stage=stageIndex;if(!src||src.startsWith('data:'))return;
    cacheTask=(async()=>{try{let result;if(window.cacheAevumImage)result=await cacheAevumImage(src);else{const response=await fetch(src,{credentials:'omit',referrerPolicy:'no-referrer'});if(!response.ok)throw new Error();const blob=await response.blob();if(!/^image\/(png|jpeg|webp|gif)$/.test(blob.type))throw new Error();result=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});}if(hatched===pet&&stageIndex===stage&&imageSource()===src&&safeImage(result)){const img=$('portrait').querySelector('img');img.setAttribute('src',result);await persist();}}catch{if(hatched===pet&&imageSource()===src){status('进度已保存；立绘暂为在线链接，建议稍后重新生成或导出');warn('当前立绘是在线链接，下载备份未成功，链接可能过期。其他进度已保存。');}}finally{cacheTask=null;}})();return cacheTask;
  }
  // Preserve original UI/game behavior and save only after its existing actions finish.
  for(const name of ['care','nurture','chooseGender','advanceBond','refreshArtPrompt']){
    const original=app[name];const wrapped=function(...args){if(!ready)return;const result=original(...args);persist();return result;};
    if(name==='care')care=wrapped;if(name==='nurture')nurture=wrapped;if(name==='chooseGender')chooseGender=wrapped;if(name==='advanceBond')advanceBond=wrapped;if(name==='refreshArtPrompt')refreshArtPrompt=wrapped;
  }
  // Hatching completes asynchronously, so observe its existing completion hook.
  const originalStartChat=startChat;startChat=function(...args){const result=originalStartChat(...args);persist();return result;};
  sendChat=async function(...args){if(!ready)return;try{return await app.sendChat(...args);}finally{persist();}};
  generateArt=async function(...args){if(!ready)return;try{return await app.generateArt(...args);}finally{await persist();await cacheArtwork();}};
  refreshModels=async function(kind){await app.refreshModels(kind);const id=pendingModels[kind];if(id&&modelState[kind].ids.includes(id)){if(!Array.from(modelField(kind).options).some(o=>o.value===id)){$(kind+'All').checked=true;renderModels(kind);}modelField(kind).value=id;pendingModels[kind]='';}persist();};
  $('chatForm').onsubmit=null;
  // The original event listener resolves sendChat dynamically; its submit listener
  // captured the original function, so intercept at capture phase without doubling it.
  $('chatForm').addEventListener('submit',event=>{event.preventDefault();event.stopImmediatePropagation();sendChat();},true);
  $('generateArt').onclick=()=>generateArt();
  $('restart').onclick=()=>{if(!ready||readOnly)return;if(!confirm('换一颗蛋会替换当前角色和对话。建议先导出存档。确定继续吗？'))return;app.reset();persist();};
  $('clearChat').onclick=()=>{if(!ready||!hatched)return;if(!confirm('确定清空当前对话吗？角色与成长进度会保留。'))return;startChat();persist();};
  for(const id of ['apiBase','imageBase','apiPersona','artStyle','imagePrompt','apiModel','imageModel'])$(id).addEventListener('change',()=>persist());
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')persist();});
  window.addEventListener('pagehide',()=>persist());
  window.__aevumBack=()=>{if($('chatDialog').open){closeChat();return 'handled';}if(activePage!==0){switchPage(0);return 'handled';}persist();return 'exit';};
  window.__aevumExportResult=ok=>status(ok?'存档已导出，请妥善保存。':'导出失败，原存档未更改。');
  $('exportGame').onclick=async()=>{if(!ready)return;await cacheArtwork();const text=readOnly&&lastRaw?lastRaw:JSON.stringify(snapshot(),null,2);if(window.AevumNative){AevumNative.exportSave(text);return;}const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='aevum-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
  $('importGame').onclick=()=>{if(!ready)return;$('saveInput').value='';$('saveInput').click();};
  $('saveInput').addEventListener('change',async()=>{const file=$('saveInput').files?.[0];if(!file)return;try{if(file.size>40*1024*1024)throw new Error('存档超过40MB，请检查文件。');const data=validate(await file.text());if(!confirm('导入会替换当前进度，上一份自动存档会保留为备份。确定导入吗？'))return;readOnly=false;restore(data);await persist();status('存档已导入并自动保存。');}catch(error){warn(error.message);}});
  async function boot(){
    let raw='';try{if(!window.AevumNative)await openDatabase();raw=await readStored('main');let recovered=false;if(!raw){raw=await readStored('backup');recovered=!!raw;}lastRaw=raw;if(raw){const data=validate(raw);restore(data);status(recovered?'主存档缺失，已恢复上一份备份。':'存档已恢复，继续上次的陪伴。');}}
    catch(error){
      let future=false;try{future=JSON.parse(raw).schemaVersion>VERSION;}catch{}
      if(future){readOnly=true;warn('这份存档来自更高版本，已停止自动保存保护原数据。请升级应用，或先导出备份。');status('版本较旧，已保护原存档');}
      else{try{const backupRaw=await readStored('backup');if(!backupRaw)throw error;restore(validate(backupRaw));warn('主存档读取失败，已恢复上一份备份。');status('已从上一份备份恢复');}catch{readOnly=!!raw;warn(raw?'存档读取失败，已保护原文件。请先导出备份，不要重新开始。':'自动存档暂不可用，可继续体验，但离开前请导出存档。');status('请先导出存档备份');}}
    }
    finally{ready=true;gate.remove();if(!raw&&!readOnly)persist();}
  }
  // Exposed for schema/upgrade regression checks, not used by the product UI.
  window.AevumSave={snapshot,validate,persist,flush:()=>queue,boot:()=>bootPromise};
  const bootPromise=boot();
})();
