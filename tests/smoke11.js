/* SMOKE R10b — Adoption (keine Quelle-Labels), Termin/Phase/Block/To-do-Löschen mit Server-DELETE,
   Lösch-Abgleich (Registry): Push räumt Stale-UIDs ab, Pull löscht lokal was der Server nicht mehr hat */
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
Object.defineProperty(global,'navigator',{value:{clipboard:{writeText:async()=>{}}},configurable:true,writable:true});
const calls=[]; const davFiles={}; /* Mini-DAV: PUT legt ab, DELETE löscht, GET export liefert alles */
global.fetch=async(url,opt)=>{
  opt=opt||{}; const u=String(url); calls.push({url:u,method:opt.method||'GET'});
  if(u.indexOf('export')>=0){
    const ics=Object.keys(davFiles).map(k=>davFiles[k]).join('\r\n')||'BEGIN:VCALENDAR\r\nEND:VCALENDAR';
    return {ok:true,status:200,text:async()=>ics};
  }
  const mKey=u.replace(/^https?:\/\/[^/]+\/.+\/([^/]+)$/,'$1');
  if(opt.method==='PUT'){davFiles[mKey]=opt.body; return {ok:true,status:201,text:async()=>''}}
  if(opt.method==='DELETE'){delete davFiles[mKey]; return {ok:true,status:204,text:async()=>''}}
  return {ok:true,status:200,text:async()=>davFiles[mKey]||'BEGIN:VCALENDAR\r\nEND:VCALENDAR'};
};

let src=fs.readFileSync('/tmp/theo.js','utf8');
src+='\nglobalThis.__T={S,ui,ACT,syncCycle,buildEvents,buildTodos,processRemote,takeRemote,autoAssign,stackAppt,apsFor,blocksFor,wk,parseICSAll,reconcileDeleted,pruneSynced,registerSynced,render,icsUid,parseISO,addDays,iso,mondayOf,dayIdx};';
eval(src);

(async()=>{
const T=globalThis.__T, S=T.S, ACT=T.ACT, ui=T.ui;
let fails=0; const ok=(c,m)=>{console.log((c?'PASS':'FAIL')+' — '+m); if(!c)fails++};
const W=T.wk();
S.settings.webdav={url:'https://kai.example',user:'u',pass:'p',cal:'https://kai.example/c1/',cal2:'https://kai.example/c2/'};
S.settings.liveSync={on:false,interval:60};

/* ---------- T1 Adoption: keine Quell-Labels ---------- */
const txtF='BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:fremd-1\nDTSTART:20261126T093000\nDTEND:20261126T103000\nSUMMARY:Übernommener Termin\nEND:VEVENT\nEND:VCALENDAR';
const r1=T.processRemote(txtF);
const m1=S.mapped['fremd-1']||{};
const ap1=T.apsFor(m1.w||W)[m1.day+'|'+m1.slot]||null;
const apAdopted=ap1&&ap1.remoteUid?ap1:(ap1&&ap1.stack?ap1.stack[0]:null);
ok(r1.placed===1&&!!apAdopted&&apAdopted.remoteUid==='fremd-1','Fremd-Termin übernommen');
ok(apAdopted.src===''||apAdopted.src===undefined,'Adoption: kein „Quelle: Kalender (Nextcloud)“-Label mehr');
const card=(apAdopted=>{let h=''; try{h=require('util')&&''}catch(e){} return h})();
/* apptCard ist nicht exportiert — prüfe über render: */
T.render();
const wkHtml=els['q:#view']?els['q:#view'].innerHTML:'';
ok(true,'render mit adoptiertem Termin ohne Crash');

/* ---------- T2 Termin löschen (adoptiert) → Server-DELETE + mapped frei ---------- */
const apId=apAdopted.id;
davFiles['fremd-1.ics']='BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:fremd-1\r\nDTSTART:20261126T093000\r\nEND:VEVENT\r\nEND:VCALENDAR';
await ACT.apptDel({id:apId});
await new Promise(r=>setTimeout(r,60));
ok(!S.mapped['fremd-1'],'apptDel: Merklisteintrag entfernt');
ok(calls.some(c=>c.method==='DELETE'&&c.url.indexOf('fremd-1')>=0),'apptDel: DELETE auf das fremde Event (gleiche UID)');
ok(!davFiles['fremd-1.ics'],'apptDel: Event auf dem Mini-DAV wirklich gelöscht');
/* Pull nach DELETE: (Reconcile-Verhalten in T3/T4 verifiziert) */
const pullTxt='BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:bleibt-1\nDTSTART:20261127T100000\nDTEND:20261127T110000\nSUMMARY:Bleibt\nEND:VEVENT\nEND:VCALENDAR';


/* ---------- T3 eigenes VTODO/Phase löschen → DELETE, Pull belebt nicht wieder ---------- */
S.phases.push({id:'phx',start:'2026-12-21',end:'2026-12-27',title:'Weihnachten',desc:'',color:'#CBB389'});
await T.syncCycle(); /* push schreibt Phase+Termin; Registry gefüllt */
ok(calls.some(c=>c.method==='PUT'&&c.url.indexOf('theo-phase-phx')>=0),'Push: Phase als VEVENT geschrieben');
ok(!!S.synced['theo-phase-phx'],'Registry: Phase registriert');
await ACT.phaseDel({id:'phx'});
await new Promise(r=>setTimeout(r,60));
ok(calls.some(c=>c.method==='DELETE'&&c.url.indexOf('theo-phase-phx')>=0),'phaseDel: DELETE auf Phasen-Kalender (c2)');
ok(!davFiles['theo-phase-phx@theo-app.ics']&&!davFiles['theo-phase-phx.ics'],'phaseDel: VEVENT vom Server gelöscht');
ok(!S.phases.some(p=>p.id==='phx'),'phaseDel: lokal gelöscht');
const expTxt=Object.keys(davFiles).map(k=>davFiles[k]).join('\n');
T.reconcileDeleted([expTxt]);
ok(!S.phases.some(p=>p.id==='phx'),'Pull nach Löschung: Phase kommt nicht wieder');

/* ---------- T4 Pull löscht lokal, was Server nicht mehr hat (Phasen-Sync-Lösch-Bug) ---------- */
S.phases.push({id:'phy',start:'2027-01-01',end:'2027-01-07',title:'Neujahr',desc:'',color:'#8FAECB'});
S.synced['theo-phase-phy']=1; /* so, als wäre sie gestern sync'd worden — jetzt löscht sie jemand auf dem Server */
S.mit['2026-11-30']={text:'Altes MIT',done:false};
S.synced['theo-mit-2026-11-30']=1;
T.reconcileDeleted([Object.keys(davFiles).map(k=>davFiles[k]).join('\n')]);
ok(!S.phases.some(p=>p.id==='phy'),'Server-Löschung → Phase lokal mitgelöscht (Registry, nicht im Export)');
ok(!S.mit['2026-11-30'],'Server-Löschung → MIT lokal mitgelöscht');
ok(!S.synced['theo-phase-phy']&&!S.synced['theo-mit-2026-11-30'],'Registry aufgeräumt');
/* Sicherheit: Objekt ohne Registry-Eintrag bleibt (nie synchronisiertes bleibt unangetastet) */
S.phases.push({id:'phz',start:'2027-02-01',end:'2027-02-03',title:'Nie synchronisiert',desc:'',color:'#CBB389'});
T.reconcileDeleted([Object.keys(davFiles).map(k=>davFiles[k]).join('\n')]);
ok(S.phases.some(p=>p.id==='phz'),'nie synchronisierte Phase bleibt beim Pull erhalten');

/* ---------- T5 pruneSynced: Stale-UID wird beim Push auf dem Server gelöscht ---------- */
S.synced['theo-appt-2020-01-06-0-0']=1; /* alter Platz, existiert nicht mehr */
davFiles['theo-appt-2020-01-06-0-0.ics']='OLD';
await T.pruneSynced(T.buildEvents('main').concat(T.buildEvents('phases')).map(e=>e.uid));
await new Promise(r=>setTimeout(r,60));
ok(calls.some(c=>c.method==='DELETE'&&c.url.indexOf('theo-appt-2020-01-06')>=0),'pruneSynced: veraltete UID auf Server gelöscht');
ok(!davFiles['theo-appt-2020-01-06-0-0.ics'],'pruneSynced: Mini-DAV ohne den Leichen-Event');
ok(!S.synced['theo-appt-2020-01-06-0-0'],'pruneSynced: Registry bereinigt');
/* verschobener Block: alter Platz wird nicht mehr erzeugt → Server aufräumen */
T.blocksFor(W)['0|0']={id:'bm',kind:'typ',typeId:null,title:'Wanderblock',ampel:'gelb',note:'',done:false};
S.synced['theo-block-'+W+'-0-2']=1; /* ehemaliger Platz 0|2 */
davFiles['theo-block-'+W+'-0-2.ics']='OLD-BLOCK';
await T.syncCycle();
await new Promise(r=>setTimeout(r,60));
ok(!davFiles['theo-block-'+W+'-0-2.ics'],'verschobener Block: alter Platz-VEVENT auf Server gelöscht (keine Auferstehung)');
ok(!T.blocksFor(W)['0|2'],'lokal weiterhin nur am neuen Platz');

/* ---------- T6 To-do löschen → VTODO-DELETE + kein Wiederbeleben ---------- */
S.projects.push({id:'pt',name:'P',areaId:'',views:{list:true},todos:[{id:'td1',title:'Aufräumen',done:false}]});
S.meta.dirty=true;
await T.syncCycle(); /* VTODO geschrieben */
ok(Object.keys(davFiles).some(k=>k.indexOf('theo-todo-td1')===0),'VTODO für To-do auf Server');
await ACT.delTodo({id:'td1'});
await new Promise(r=>setTimeout(r,60));
ok(calls.some(c=>c.method==='DELETE'&&c.url.indexOf('theo-todo-td1')>=0),'delTodo: DELETE der VTODO');
ok(!Object.keys(davFiles).some(k=>k.indexOf('theo-todo-td1')===0),'delTodo: VTODO vom Server weg');
const expTxt2=Object.keys(davFiles).map(k=>davFiles[k]).join('\n');
T.reconcileDeleted([expTxt2]);
ok(!S.projects.find(p=>p.id==='pt').todos.some(x=>x.id==='td1'),'Pull: To-do nicht wiederbelebt');

/* ---------- T7 Blocktyp für Aufgaben-Blöcke ---------- */
S.tasks.push({id:'tk1',title:'Zahnarzttermin ausmachen',done:false,planned:null});
ui.pickCtx={type:'task',id:'tk1'};
ACT.pickSlot({week:W,day:2,slot:1});
const bl=T.blocksFor(W)['2|1'];
ok(bl&&bl.kind==='task'&&bl.taskId==='tk1','Aufgaben-Block: kind task + taskId verknüpft');
ok(bl.typeId===undefined||bl.typeId===null,'Aufgaben-Block: Typ initially frei — aber jetzt wählbar');
els['b-type']={value:'ty7'};
els['b-title']={value:'Zahnarzttermin ausmachen'};
els['b-note']={value:''};
els['b-fbnote']={value:''};
/* blockSave erwartet aktuelle Woche via getBlocks() */
ACT.blockSave({day:2,slot:1});
const bl2=T.blocksFor(W)['2|1'];
ok(bl2.typeId==='ty7','blockSave: Blocktyp aus Select übernommen (vorher: keine Änderungsmöglichkeit)');
ok(bl2.ampel==='gelb','blockSave: Ampel-Vorschlag aus Typ Fokusarbeit (gelb)');
/* toggleTaskBox-Kopplung funktioniert weiter */
els['checkbox']=null;
const tsk=S.tasks.find(x=>x.id==='tk1');
ok(!!tsk&&tsk.planned&&tsk.planned.day===2,'task.planned zeigt auf Block (Kopplung intakt)');

console.log('\n'+(fails? '✖ '+fails+' FEHLER':'✔ SMOKE R10b GRÜN — alle Tests bestanden'));
process.exit(fails?1:0);
})().catch(e=>{console.error('DRIVER-CRASH:',e&&e.stack||e); process.exit(2)});
