/* SMOKE R13b — Kapsel-Neugeräte-Schutz: erst lesen, dann schreiben */
'use strict';
const fs=require('fs');
const els={}; const __h={};
function mkEl(id){return {id:id,value:'',innerHTML:'',textContent:'',style:{},dataset:{},children:[],
  classList:{add(){},remove(){},toggle(){},contains(){return false}},
  appendChild(c){this.children.push(c)},remove(){},setAttribute(){},addEventListener(){},focus(){},click(){},
  querySelector(){return null},querySelectorAll(){return[]}}}
global.document={
  getElementById:id=>els[id]||(els[id]=mkEl(id)),
  querySelector:s=>els['q:'+s]||(els['q:'+s]=mkEl('q:'+s)),
  querySelectorAll:()=>[],
  createElement:t=>mkEl('tmp-'+t+'-'+Math.random()),
  body:mkEl('body'),
  addEventListener(n,f){__h[n]=f}
};
global.localStorage={_m:{},getItem(k){return this._m[k]||null},setItem(k,v){this._m[k]=String(v)},removeItem(k){delete this._m[k]}};
global.navigator={clipboard:{writeText:async()=>{}}};

/* Mini-DAV: PUT legt ab, GET liefert, DELETE löscht; Proxy-URLs dekodiert */
const NC='https://nc.example';
const CAL=NC+'/remote.php/dav/calendars/u/theo/';
const CAP_URL=CAL+encodeURIComponent('theo-state@theo-app')+'.ics';
const davFiles={};
let capPuts=0;
global.fetch=async(full,opts)=>{opts=opts||{};
  let u=String(full);
  if(u.indexOf('/__theo_proxy__')>=0)return {ok:true,status:200,text:async()=>JSON.stringify({proxy:true,target:NC})};
  if(u.indexOf('/__dav_proxy__')>=0){const m=u.match(/[?&]url=([^&]+)/); u=decodeURIComponent(m?m[1]:u)}
  const method=(opts.method||'GET').toUpperCase();
  if(method==='PUT'){if(u===CAP_URL)capPuts++; davFiles[u]=opts.body||''; return {ok:true,status:201,text:async()=>''}}
  if(method==='DELETE'){delete davFiles[u]; return {ok:true,status:204,text:async()=>''}}
  const hit=davFiles[u];
  return {ok:true,status:200,text:async()=>hit!==undefined?hit:''};
};

let src=fs.readFileSync('/tmp/theo.js','utf8');
src+='\nglobalThis.__T={S,ui,ACT,SYNC,render,syncCycle,pushAll,adoptCapsule,capsuleICS,capsuleJson};';
eval(src);

(async()=>{
const T=globalThis.__T, S=T.S;
let fails=0; const ok=(c,m)=>{console.log((c?'PASS':'FAIL')+' — '+m); if(!c)fails++};

/* Server-Kapsel: VOLL (vom Laptop gepusht, ts=1000) */
const payload={ts:1000,motto:{y:'Ruhe vor Tempo'},inbox:[{id:'i1',text:'Steuer abgeben'}],
  areas:[{id:'a1',name:'Erholung',emoji:'🌿',color:'#7CA982'}],types:[{id:'tx',name:'Ritual',emoji:'🕯️',ampel:'gelb'}],
  projects:[],settings:{},mapped:{},ignored:{},tomb:{}};
davFiles[CAL+'?export']=T.capsuleICS(payload);

/* Frisches Gerät: Seed leer, Verbindung gespeichert (save()-Semantik: dirty + ts-Stempel) */
ok(S.meta.pulled===false,'Seed: pulled=false (Neugerät darf noch nicht schreiben)');
S.settings.webdav={url:NC,user:'u',pass:'p',cal:CAL};
S.meta.dirty=true; S.capsuleTs=Date.now();        /* exakt save()-Verhalten beim Verbinden */

/* ---------- T1: erster Zyklus pullt zuerst, plättet die Server-Kapsel NICHT ---------- */
await T.syncCycle();
ok(S.motto&&S.motto.y==='Ruhe vor Tempo','Kapsel übernommen: Jahresmotto da');
ok(S.inbox.length===1&&S.inbox[0].text==='Steuer abgeben','Kapsel übernommen: Eingangskiste da');
ok(S.areas.length===1&&S.areas[0].name==='Erholung','Kapsel übernommen: Bereiche da');
ok(S.types.some(x=>x.id==='tx'),'Kapsel übernommen: Typen da');
ok(S.meta.pulled===true,'Gerät hat jetzt gelesen → Schreiben freigeschaltet');
ok(davFiles[CAP_URL].indexOf('Ruhe vor Tempo')>=0,'Server-Kapsel unangetastet (nicht plattgemacht)');
ok(davFiles[CAP_URL].indexOf('Steuer abgeben')>=0,'Follow-up-Push im selben Zyklus schreibt den ÜBERNOMMENEN Stand (nie die leere Kapsel)');

/* ---------- T2: zweiter Zyklus (dirty) → pusht jetzt die ÜBERNOMMENE Kapsel ---------- */
await T.syncCycle();
ok(capPuts===1&&davFiles[CAP_URL].indexOf('Ruhe vor Tempo')>=0,'Konvergenz: zweiter Zyklus ohne neue Edits → kein weiterer Kapsel-Push');

/* ---------- T3: Legacy-Gerät (pulled undefiniert) verhält sich wie bisher (Push zuerst) ---------- */
S.meta.pulled=undefined; S.meta.dirty=true; S.capsuleTs=Date.now(); T.SYNC.capJson=null;
await T.syncCycle();
ok(/geschrieben/.test(T.SYNC.msg||''),'Legacy-Gerät: Push-zuerst bleibt erhalten');
ok(capPuts===2,'Legacy-Gerät: Kapsel wird normal mitgeschrieben');

/* ---------- T4: LWW bleibt ---------- */
const adopted=T.adoptCapsule({ts:1,motto:{y:'x'}});
ok(adopted===false,'LWW: ältere Kapsel wird weiter abgelehnt');

/* ---------- T5: pushAll auf Neugerät ohne Lesen → kein Kapsel-PUT ---------- */
/* frisches Devices simulieren: alles leeren */
for(const k of Object.keys(davFiles))delete davFiles[k];
davFiles[CAL+'?export']=T.capsuleICS(payload); capPuts=0;
S.meta.pulled=false; S.meta.dirty=true; T.SYNC.capJson=null;
await T.pushAll();
ok(capPuts===0,'pushAll auf Neugerät: Kapsel-PUT übersprungen');

console.log(fails===0?'\n✔ SMOKE R13b GRÜN — alle Tests bestanden':'\n✖ '+fails+' FEHLER');
process.exit(fails===0?0:1);
})().catch(e=>{console.error('DRIVER-FEHLER',e);process.exit(2)});
