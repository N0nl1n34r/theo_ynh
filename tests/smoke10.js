/* SMOKE R10 — syncCycle-Regression: cal2-Scoping-Bug, Push+Pull mit Phasen-Kalender, Kapsel */
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

const calls=[];
global.fetch=async(url,opt)=>{
  opt=opt||{}; const u=String(url); calls.push({url:u,method:opt.method||'GET'});
  if(u.indexOf('export')>=0){
    const ics=['BEGIN:VCALENDAR','BEGIN:VEVENT','UID:fremd-x','DTSTART:20261126T093000','DTEND:20261126T103000','SUMMARY:Fremder Termin','END:VEVENT','END:VCALENDAR'].join('\r\n');
    return {ok:true,status:200,text:async()=>ics};
  }
  return {ok:true,status:201,text:async()=>''};
};

let src=fs.readFileSync('/tmp/theo.js','utf8');
src+='\nglobalThis.__T={S,ui,ACT,SYNC,syncCycle,wdCfg,blocksFor,apsFor,wk,buildEvents,CAP_UID,capsuleICS,capsuleJson};';
eval(src);

(async()=>{
const T=globalThis.__T, S=T.S;
let fails=0; const ok=(c,m)=>{console.log((c?'PASS':'FAIL')+' — '+m); if(!c)fails++};

S.settings.webdav={url:'https://kai.example',user:'u',pass:'p',cal:'https://kai.example/c1/',cal2:'https://kai.example/c2/'};
S.settings.liveSync={on:false,interval:60}; /* kein Interval-Timer im Test */
const W=T.wk();
T.blocksFor(W)['0|0']={id:'b9',kind:'typ',typeId:null,title:'Testblock',ampel:'gelb',note:'',done:false};
S.mit['2026-11-26']={text:'MIT-Test',done:false};
S.phases=[{id:'phx',start:'2026-12-21',end:'2026-12-27',title:'Erholung',desc:'',color:'#7CA982'}];
S.meta.dirty=true;

await T.syncCycle();
const msg=String(T.SYNC.msg||'');
ok(msg.indexOf('cal2')<0&&msg.indexOf('Fehler')<0,'syncCycle: keine Fehlermeldung mehr («'+msg+'»)');
ok(msg.indexOf('gelesen')>=0,'syncCycle: Pull abgeschlossen ('+msg+')');
ok(S.meta.dirty===false,'syncCycle: Dirty-Flag nach erfolgreichem Push zurückgesetzt');
const puts=calls.filter(c=>c.method==='PUT');
ok(puts.some(c=>c.url.indexOf('kai.example/c1/')>=0),'Push: VEVENTs/VTODO/Kapsel gehen an Hauptkalender c1');
ok(puts.some(c=>c.url.indexOf('kai.example/c2/')>=0),'Push: Phasen-VEVENT geht an Phasen-Kalender c2');
ok(puts.some(c=>c.url.indexOf('theo-state')>=0),'Push: Theo-Kapsel (VJOURNAL) geschrieben');
ok(calls.filter(c=>c.method==='GET'&&c.url.indexOf('fremd-x')>=0).length>0,'Zuordnungs-Writeback: fremdes Event wurde GET→PUT markiert');
const gets=calls.filter(c=>c.method==='GET'&&c.url.indexOf('export')>=0);
ok(gets.some(c=>c.url.indexOf('c1/')>=0)&&gets.some(c=>c.url.indexOf('c2/')>=0),'Pull: Hauptkalender UND Phasen-Kalender gelesen');
ok(T.S.mapped['fremd-x']!==undefined,'Pull: fremder Termin automatisch eingeordnet');
/* zweiter Zyklus: kein Dirty, Kapsel unverändert → keine PUTs außerhalb Zuordnung */
const putCount1=calls.filter(c=>c.method==='PUT').length;
await new Promise(r=>setTimeout(r,30)); await new Promise(r=>setTimeout(r,30)); calls.length=0;
await T.syncCycle();
const puts2=calls.filter(c=>c.method==='PUT'&&c.url.indexOf('fremd-x')<0);
ok(puts2.length<=1&&puts2.every(c=>c.url.indexOf('theo-state')>=0),'Zyklus 2: höchstens ein Kapsel-Nachschub (Konvergenz) — gefunden: '+puts2.length);
await new Promise(r=>setTimeout(r,30)); await new Promise(r=>setTimeout(r,30)); calls.length=0;
await T.syncCycle();
const puts3=calls.filter(c=>c.method==='PUT'&&c.url.indexOf('fremd-x')<0);
ok(puts3.length===0,'Zyklus 3: Ruhe — kein Schreiben mehr (Wiederhol-Schutz Dirty+Kapsel greift)');

console.log('\n'+(fails? '✖ '+fails+' FEHLER':'✔ SMOKE R10 GRÜN — alle Tests bestanden'));
process.exit(fails?1:0);
})().catch(e=>{console.error('DRIVER-CRASH:',e&&e.stack||e); process.exit(2)});
