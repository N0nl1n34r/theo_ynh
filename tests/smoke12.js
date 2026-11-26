/* SMOKE R11 — „Löschen"-Label, direkter Push (entprellt), Race-Guard (Pull übersprungen),
   UID-verankerte Phasen-Übernahme, Ampel formularbasiert, Termin-Titel editierbar,
   orientBar kontextabhängig, „wie Termin"-Blöcke bei Termine, Wochen-Threadung */
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
const calls=[]; const davFiles={};
let slowFetch=0; /* ms Verzögerung für Race-Test */
global.fetch=async(url,opt)=>{
  opt=opt||{}; const u=String(url); calls.push({url:u,method:opt.method||'GET'});
  if(slowFetch)await new Promise(r=>setTimeout(r,slowFetch));
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
src+='\nglobalThis.__T={S,ui,ACT,syncCycle,pushAll,schedulePush,orientBar,allApptItems,blocksFor,apsFor,wk,parseISO,addDays,iso,mondayOf,dayIdx,typeOf,render,SYNC,getAppts};';
eval(src);

(async()=>{
const T=globalThis.__T, S=T.S, ACT=T.ACT, ui=T.ui;
const E=id=>document.getElementById(id);
let fails=0; const ok=(c,m)=>{console.log((c?'PASS':'FAIL')+' — '+m); if(!c)fails++};
const W=T.wk();
S.settings.webdav={url:'https://kai.example',user:'u',pass:'p',cal:'https://kai.example/c1/',cal2:'https://kai.example/c2/'};
S.settings.liveSync={on:false,interval:60};
S.meta.pulled=true; /* etabliertes Gerät: Pull-zuerst gilt nur für die Erstverbindung */

/* ---------- T1 Block-Button heißt „Löschen“ ---------- */
const html1=(()=>{let cap=''; T.render(); cap=els['q:#main'].innerHTML; return cap})();
ok(true,'render ohne Crash');
T.blocksFor(W)['1|1']={id:'bl1',kind:'typ',typeId:null,title:'Testblock',ampel:'gelb',note:'',done:false};
ACT.openBlock({day:1,slot:1});
ok(els['q:#overlay'].innerHTML.indexOf('🗑 Löschen')>=0&&els['q:#overlay'].innerHTML.indexOf('Block freigeben')<0,'Button heißt jetzt „🗑 Löschen“ (nicht „Block freigeben“)');

/* ---------- T2 orientBar repräsentiert den angezeigten Tag ---------- */
T.ui.route={view:'woche'}; T.ui.anchor=T.mondayOf(new Date());
const ob1=T.orientBar();
ok(ob1.indexOf('MIT (heute)')>=0,'Woche mit heute → MIT (heute)');
const dispMonday=T.addDays(T.mondayOf(new Date()),14); /* übernächster Montag — Woche ohne heute */
T.ui.anchor=dispMonday;
const ob2=T.orientBar();
ok(ob2.indexOf('MIT (')>=0&&ob2.indexOf('heute')<0,'Woche ohne heute → MIT-Chip ohne „heute“');
const mitDate=ob2.match(/data-date="([^"]+)"/);
ok(!!mitDate&&mitDate[1]===T.iso(dispMonday),'MIT-Chip trägt das Datum der angezeigten Woche ('+T.iso(dispMonday)+')');

/* ---------- T3 Ampel formularbasiert ---------- */
ui.ampSel=null; ui.ampSelK=null;
ACT.openBlock({day:1,slot:1});
ACT.ampPick({k:'block',v:'rot'},null,null);
ok(T.blocksFor(W)['1|1'].ampel==='gelb','ampPick ändert NICHT sofort (blockSave entscheidet)');
ok(ui.ampSel==='rot'&&ui.ampSelK==='block','Auswahl gemerkt und im Sheet markiert');
E('b-title').value='Testblock'; E('b-note').value=''; E('b-type').value=''; E('b-fbnote').value='';
ACT.blockSave({day:1,slot:1,w:W});
ok(T.blocksFor(W)['1|1'].ampel==='rot','blockSave übernimmt die gewählte Ampel');

/* ---------- T4 Termin-Titel editierbar, keine Quell-Zeile ---------- */
T.ui.anchor=T.mondayOf(new Date()); /* zurück zur realen Woche */
T.apsFor(W)['2|0']={id:'apt',day:2,slot:0,title:'Alter Titel',time:'14:00–15:30',ampel:null,src:'',span:1};
ACT.openAppt({id:'apt'});
ok(els['q:#overlay'].innerHTML.indexOf('a-title')>=0,'Termin-Editor hat Titel-Feld');
ok(els['q:#overlay'].innerHTML.indexOf('Aus deinem Kalender übernommen')<0&&els['q:#overlay'].innerHTML.indexOf('Quelle:')<0,'Keine Herkunfts-Anzeige mehr');
E('a-title').value='Neuer Titel';
E('a-t0').value='14:00'; E('a-t1').value='15:30'; E('a-type').value=''; E('a-fbnote').value='';
ACT.apptSave({id:'apt'});
ok(T.apsFor(W)['2|0'].title==='Neuer Titel','apptSave übernimmt den neuen Titel');
/* Ampel formularbasiert beim Termin */
ACT.openAppt({id:'apt'});
ACT.ampPick({k:'appt',v:'gelb'},null,null);
E('a-title').value='Neuer Titel'; E('a-t0').value='14:00'; E('a-t1').value='15:30'; E('a-type').value=''; E('a-fbnote').value='';
ACT.apptSave({id:'apt'});
ok(T.apsFor(W)['2|0'].ampel==='gelb','apptSave übernimmt Ampel-Auswahl');

/* ---------- T5 „wie Termin“-Blocktypen erscheinen bei Termine ---------- */
const ty11={id:'zz11',name:'1:1',emoji:'🤝',ampel:'rot',asAppt:true};
S.types.push(ty11);
T.blocksFor(W)['3|0']={id:'blk11',kind:'task',taskId:null,typeId:'zz11',title:'1:1 mit L.',ampel:'rot',note:'',done:false};
T.blocksFor(W)['4|0']={id:'blkNo',kind:'typ',typeId:'ty3',title:'Normaler Block',ampel:'none',note:'',done:false};
const items=T.allApptItems();
ok(items.some(i=>i.bl&&i.bl.id==='blk11'),'„wie Termin“-Block in der Termine-Liste');
ok(!items.some(i=>i.bl&&i.bl.id==='blkNo'),'normaler Block NICHT in der Termine-Liste');
ACT.openBlockW({w:W,day:3,slot:0});
ok(els['q:#overlay'].innerHTML.indexOf('1:1 mit L.')>=0,'openBlockW öffnet den Block-Editor');
ok(ty11.asAppt&&T.typeOf('ty6').asAppt,'Seed: 1:1-Termin ist vorkonfiguriert als „wie Termin“');

/* ---------- T6 Wochen-Threadung: Block in anderer Woche editieren/löschen ---------- */
const W2=T.iso(T.addDays(T.parseISO(W),7));
T.blocksFor(W2)['1|2']={id:'blW2',kind:'typ',typeId:null,title:'Übermorgenwoche',ampel:'none',note:'',done:false};
ACT.openBlockW({w:W2,day:1,slot:2});
E('b-title').value='Umbenannt in ferner Woche'; E('b-note').value=''; E('b-type').value=''; E('b-fbnote').value='';
ACT.blockSave({day:1,slot:2,w:W2});
ok(T.blocksFor(W2)['1|2'].title==='Umbenannt in ferner Woche','blockSave respektiert die Woche (data-w)');
ACT.freeSlot({day:1,slot:2,w:W2});
ok(!T.blocksFor(W2)['1|2'],'freeSlot löscht in der richtigen Woche');

/* ---------- T7 Direkter Push nach save() (entprellt) ---------- */
calls.length=0;
S.capsuleTs=Date.now(); /* simuliere eine Änderung ohne syncCycle */
const before=Object.keys(davFiles).length;
S.meta.dirty=true;
global.fetch; /* noop */
/* save() triggert schedulePush — hier direkt aufrufen ( save() selbst braucht S.meta) */
T.schedulePush();
await new Promise(r=>setTimeout(r,2900));
ok(calls.filter(c=>c.method==='PUT').length>0,'save() → direkter Push (PUTs nach Entprellung)');
ok(String(T.SYNC.msg).indexOf('direkt gepusht')>=0,'Statuszeile: «'+T.SYNC.msg+'»');
ok(T.S.meta.dirty===false,'Dirty-Flag nach Direkt-Push zurückgesetzt');

/* ---------- T8 Race-Guard: Editieren während des Zyklus → Pull übersprungen ---------- */
calls.length=0; slowFetch=60;
const revBefore=S.capsuleTs||0;
S.meta.dirty=true;
T.blocksFor(W)['1|1'].title='Während-Zyklus-Edit';
const editDuring=setTimeout(()=>{T.blocksFor(W)['1|1'].note='schnell geändert'; T.S.meta.dirty=true; T.S.capsuleTs=(revBefore||0)+5},40);
await T.syncCycle();
clearTimeout(editDuring); slowFetch=0;
ok(String(T.SYNC.msg).indexOf('Pull übersprungen')>=0,'Race-Guard: «'+T.SYNC.msg+'»');
ok(T.S.meta.dirty===true,'Dirty bleibt — nächste Runde pusht zuerst');
/* zweiter Zyklus ohne Edits: push + pull */
calls.length=0;
await T.syncCycle();
ok(String(T.SYNC.msg).indexOf('gelesen')>=0,'folgender Zyklus: Push + Pull normal');
ok(calls.some(c=>c.method==='PUT'&&c.url.indexOf('theo-block')>=0),'folgender Zyklus hat den Während-Zyklus-Edit gepusht');

/* ---------- T9 UID-verankerte Phasen-Übernahme ---------- */
S.phases.push({id:'phu1',start:'2027-03-01',end:'2027-03-05',title:'Alter Titel',desc:'',color:'#CBB389'});
const phaseIcs=['BEGIN:VCALENDAR','BEGIN:VEVENT','UID:theo-phase-phu1@theo-app','DTSTART;VALUE=DATE:20270301','DTEND;VALUE=DATE:20270306','SUMMARY:Neuer Titel vom Server','DESCRIPTION:Neue Beschreibung','X-LR-KIND:phase','X-LR-START:2027-03-01','X-LR-END:2027-03-05','X-LR-COLOR:#8FAECB','CATEGORIES:LR-PHASE','TRANSP:TRANSPARENT','END:VEVENT','END:VCALENDAR'].join('\r\n');
const evs9=T.parseICSAll?null:null;
/* importICS ist nicht exportiert — über syncCycle-Pull: */
davFiles['theo-phase-phu1@theo-app.ics']=phaseIcs;
calls.length=0;
await T.syncCycle();
const phU=S.phases.find(p=>p.id==='phu1');
ok(phU&&phU.title==='Neuer Titel vom Server'&&phU.color==='#8FAECB','Phase per UID aktualisiert (kein Duplikat)');
ok(S.phases.filter(p=>p.id==='phu1'||(p.title==='Neuer Titel vom Server')).length===1,'keine Kopie angelegt');

/* ---------- T10 Regressionen ---------- */
T.render(); ok(true,'render nach R11 ohne Crash');

console.log('\n'+(fails? '✖ '+fails+' FEHLER':'✔ SMOKE R11 GRÜN — alle Tests bestanden'));
process.exit(fails?1:0);
})().catch(e=>{console.error('DRIVER-CRASH:',e&&e.stack||e); process.exit(2)});
