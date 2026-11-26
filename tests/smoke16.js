/* SMOKE R13c — Nextcloud-VJOURNAL-Ablage (theo-kapsel per MKCALENDAR), kein Verschlucken
   von Kapsel-Fehlern, keine falsche „To-dos aktualisiert"-Meldung bei unveränderten VTODOs,
   Multi-Gerät-Übernahme von Projekt-To-dos + Kapsel */
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

/* Realistischer Nextcloud/SabreDAV-Mock:
   - Hauptkalender personal/ erlaubt NUR VEVENT,VTODO (wie Nextcloud Calendar Web-UI)
   - VJOURNAL-PUT auf personal/ liefert HTTP 403 InvalidComponentType
   - MKCALENDAR legt theo-kapsel/ mit <c:comp name="VJOURNAL"/> an */
const NC='https://kai.nl.example';
const CAL='/remote.php/dav/calendars/kai/personal/';
const SUB='/remote.php/dav/calendars/kai/theo-kapsel/';
const collections={
  [NC+CAL]:{comps:['VEVENT','VTODO'],files:{}},
};
let mkCalCalls=0, throttle=false;
global.fetch=async(full,opts)=>{
  opts=opts||{};
  let u=String(full);
  if(u.indexOf('__theo_proxy__')>=0)return {ok:true,status:200,json:async()=>({proxy:true,target:NC}),text:async()=>JSON.stringify({proxy:true,target:NC})};
  if(u.indexOf('__dav_proxy__')>=0){const m=u.match(/[?&]url=([^&]+)/); u=decodeURIComponent(m?m[1]:u)}
  const method=(opts.method||'GET').toUpperCase();
  if(throttle&&method==='PUT')return {ok:false,status:403,text:async()=>'Throttled by brute force protection'};
  if(method==='MKCALENDAR'){
    mkCalCalls++;
    const body=String(opts.body||'');
    const comps=[];
    const re=/<c:comp\s+name="([^"]+)"/gi; let m;
    while((m=re.exec(body)))comps.push(m[1].toUpperCase());
    if(collections[u])return {ok:false,status:405,text:async()=>'Already exists'};
    collections[u]={comps:comps.length?comps:['VEVENT','VTODO','VJOURNAL'],files:{}};
    return {ok:true,status:201,text:async()=>''};
  }
  if(u.slice(-7)==='?export'){
    const colUrl=u.slice(0,-7);
    const col=collections[colUrl];
    if(!col)return {ok:false,status:404,text:async()=>'Not found'};
    const inner=[];
    for(const k of Object.keys(col.files)){
      const lines=col.files[k].split(/\r?\n/).filter(l=>!/^(BEGIN:VCALENDAR|VERSION:|PRODID:|CALSCALE:|END:VCALENDAR)/i.test(l));
      inner.push(lines.join('\r\n'));
    }
    const merged=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//SabreDAV//EN'].concat(inner,['END:VCALENDAR']).join('\r\n');
    return {ok:true,status:200,text:async()=>merged};
  }
  const slash=u.lastIndexOf('/');
  const colUrl=u.slice(0,slash+1), fn=u.slice(slash+1);
  const col=collections[colUrl];
  if(method==='PUT'){
    if(!col)return {ok:false,status:404,text:async()=>'Collection not found'};
    const body=String(opts.body||'');
    const comp=(body.match(/BEGIN:(VEVENT|VTODO|VJOURNAL)/i)||[])[1];
    if(comp&&col.comps.indexOf(comp.toUpperCase())<0){
      return {ok:false,status:403,text:async()=>'<d:error xmlns:d="DAV:" xmlns:s="http://sabredav.org/ns" xmlns:cal="urn:ietf:params:xml:ns:caldav"><s:exception>Sabre\\CalDAV\\Exception\\InvalidComponentType</s:exception><s:message>iCalendar objects must at least have a component of type '+col.comps.join(', ')+'</s:message><cal:supported-calendar-component/></d:error>'};
    }
    col.files[fn]=body;
    return {ok:true,status:201,text:async()=>''};
  }
  if(method==='DELETE'){
    if(col)delete col.files[fn];
    return {ok:true,status:204,text:async()=>''};
  }
  if(!col||col.files[fn]===undefined)return {ok:false,status:404,text:async()=>'Not found'};
  return {ok:true,status:200,text:async()=>col.files[fn]};
};

let src=fs.readFileSync('/tmp/theo.js','utf8');
src+='\nglobalThis.__T={S,ui,ACT,SYNC,seed,syncCycle,pushAll,processTodos,parseCals,capCalHref,CAP_UID,render};';
eval(src);

(async()=>{
const T=globalThis.__T;
let S=T.S;
let fails=0; const ok=(c,m)=>{console.log((c?'PASS':'FAIL')+' — '+m); if(!c)fails++};

/* ---------- T1 Quellgerät (dirty bereits false durch alten Bug) legt theo-kapsel an & schreibt VJOURNAL ---------- */
S.settings.webdav={url:NC,user:'kai',pass:'apw',cal:CAL};
S.settings.liveSync={on:false,interval:60};
S.meta.pulled=true;
S.meta.dirty=false; /* exakt der Zustand nach dem alten verschluckten Kapsel-Fehler */
S.capsuleTs=5000;
S.motto={'2026':'Ruhe bewahren'};
S.inbox=[{id:'in1',kind:'gedanke',text:'Kapsel-Gedanke',ts:'Mi'}];
S.areas=[{id:'ar1',name:'Alltag',emoji:'🌿',color:'#7CA982'}];
S.projects=[{id:'pr1',areaId:'ar1',name:'Steuer',emoji:'🧾',views:{list:true,kanban:true},todos:[
  {id:'td1',title:'Belege sammeln',done:false,due:'2026-12-10',firstStep:'Ordner holen',est:{mode:'simple',simple:2}}
]}];
S.tasks=[{id:'tk1',title:'Einzelaufgabe',done:false}];
/* die beiden VTODOs liegen wie beim Nutzer bereits im Hauptkalender */
collections[NC+CAL].files[encodeURIComponent('theo-todo-td1@theo-app')+'.ics']=[
  'BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VTODO','UID:theo-todo-td1@theo-app','SUMMARY:Belege sammeln',
  'STATUS:NEEDS-ACTION','DUE;VALUE=DATE:20261210','DESCRIPTION:Erster Schritt: Ordner holen',
  'X-LR-KAN:offen','X-LR-EST:SIMPLE,2','X-LR-PROJECT:pr1','CATEGORIES:LR-TODO','END:VTODO','END:VCALENDAR'
].join('\r\n');
collections[NC+CAL].files[encodeURIComponent('theo-todo-tk1@theo-app')+'.ics']=[
  'BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VTODO','UID:theo-todo-tk1@theo-app','SUMMARY:Einzelaufgabe',
  'STATUS:NEEDS-ACTION','X-LR-KAN:offen','CATEGORIES:LR-TODO','END:VTODO','END:VCALENDAR'
].join('\r\n');

await T.syncCycle();
const capFn=encodeURIComponent(T.CAP_UID)+'.ics';
ok(mkCalCalls===1&&!!collections[NC+SUB],'MKCALENDAR hat theo-kapsel automatisch angelegt');
ok(collections[NC+SUB].comps.length===1&&collections[NC+SUB].comps[0]==='VJOURNAL','theo-kapsel ist reine VJOURNAL-Sammlung (in Nextcloud Kalender/Tasks unsichtbar)');
ok(!!collections[NC+SUB].files[capFn]&&/BEGIN:VJOURNAL/.test(collections[NC+SUB].files[capFn]),'Kapsel als VJOURNAL in theo-kapsel abgelegt');
ok(T.SYNC.capMode==='sub'&&S.meta.dirty===false,'Kapsel-Modus sub gemerkt, Dirty sauber zurückgesetzt');
ok(T.SYNC.msg.indexOf('To-dos aktualisiert')<0,'Zyklus 1: unveränderte To-dos erzeugen KEINE „To-dos aktualisiert"-Meldung («'+T.SYNC.msg+'»)');

/* ---------- T2 Ruhe-Zyklen + Fremd-VTODO + echtes Update ---------- */
collections[NC+CAL].files['ext-todo-1.ics']=['BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VTODO','UID:ext-todo-1@nc','SUMMARY:Aus Nextcloud Tasks','STATUS:NEEDS-ACTION','END:VTODO','END:VCALENDAR'].join('\r\n');
await T.syncCycle();
ok(T.SYNC.msg.indexOf('1 Aufgaben aus Kalender')>=0&&T.SYNC.msg.indexOf('To-dos aktualisiert')<0,'Fremd-VTODO einmalig importiert, keine falsche Update-Meldung');
await T.syncCycle();
ok(T.SYNC.msg==='gelesen','Folgezyklus ohne Änderungen: nur „gelesen" — keine falsche To-do-Meldung («'+T.SYNC.msg+'»)');
/* Jetzt echte Änderung auf dem Server an td1 */
collections[NC+CAL].files[encodeURIComponent('theo-todo-td1@theo-app')+'.ics']=[
  'BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VTODO','UID:theo-todo-td1@theo-app','SUMMARY:Belege 2026 sammeln',
  'STATUS:IN-PROCESS','DUE;VALUE=DATE:20261215','DESCRIPTION:Erster Schritt: Ordner holen',
  'X-LR-KAN:arbeit','X-LR-EST:SIMPLE,2','X-LR-PROJECT:pr1','CATEGORIES:LR-TODO','END:VTODO','END:VCALENDAR'
].join('\r\n');
await T.syncCycle();
ok(T.SYNC.msg.indexOf('1 To-dos aktualisiert')>=0,'Echte Server-Änderung meldet präzise „1 To-dos aktualisiert" («'+T.SYNC.msg+'»)');
ok(S.projects[0].todos[0].title==='Belege 2026 sammeln'&&S.projects[0].todos[0].kanban==='arbeit','Geänderte Felder übernommen');
await T.syncCycle();
ok(T.SYNC.msg==='gelesen','Nach Übernahme wieder Ruhe: „gelesen" ohne Endlos-Meldung');

/* ---------- T3 Frisches Zweitgerät (pulled=false) liest Kapsel aus theo-kapsel + Projekt-To-dos ---------- */
const fresh=T.seed();
for(const k of Object.keys(S))delete S[k];
Object.assign(S,fresh);
S.settings.webdav={url:NC,user:'kai',pass:'apw',cal:CAL};
S.settings.liveSync={on:false,interval:60};
S.meta.dirty=true; S.capsuleTs=Date.now();
T.SYNC.capJson=null; T.SYNC.capMode=null; T.SYNC.capFor=null;

await T.syncCycle();
ok(S.motto['2026']==='Ruhe bewahren'&&S.inbox.length===1&&S.areas.length===1,'Neugerät hat Kapsel aus theo-kapsel übernommen (obwohl personal/?export kein VJOURNAL enthält)');
ok(S.projects.length===1&&S.projects[0].id==='pr1'&&S.projects[0].todos.length===1&&S.projects[0].todos[0].title==='Belege 2026 sammeln','Projekt-To-do vom anderen Gerät direkt ins richtige Projekt einsortiert');
ok(S.tasks.some(x=>x.id==='tk1')&&S.tasks.some(x=>x.remoteUid==='ext-todo-1@nc'),'Einzelaufgabe + Fremd-Aufgabe ebenfalls da');

/* ---------- T4 Bereits verbundenes, aber noch leeres Zweitgerät (pulled=true, neuerer Verbindungs-TS) ---------- */
const emptyEst=T.seed();
for(const k of Object.keys(S))delete S[k];
Object.assign(S,emptyEst);
S.settings.webdav={url:NC,user:'kai',pass:'apw',cal:CAL};
S.settings.liveSync={on:false,interval:60};
S.meta.pulled=true; S.meta.dirty=false; S.capsuleTs=Date.now()+999999;
T.SYNC.capJson=null; T.SYNC.capMode=null; T.SYNC.capFor=null;

await T.syncCycle();
ok(S.motto['2026']==='Ruhe bewahren'&&S.projects.length===1,'Leeres Zweitgerät mit pulled=true übernimmt ebenfalls die gefüllte Server-Kapsel');

/* ---------- T5 parseCals blendet theo-kapsel aus ---------- */
const xml='<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">'+
  '<d:response><d:href>/remote.php/dav/calendars/kai/personal/</d:href><d:propstat><d:prop><d:displayname>Persönlich</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype></d:prop></d:propstat></d:response>'+
  '<d:response><d:href>/remote.php/dav/calendars/kai/theo-kapsel/</d:href><d:propstat><d:prop><d:displayname>Theo Kapsel</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype></d:prop></d:propstat></d:response>'+
  '<d:response><d:href>/remote.php/dav/calendars/kai/theo-phasen/</d:href><d:propstat><d:prop><d:displayname>Phasen</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype></d:prop></d:propstat></d:response>'+
  '</d:multistatus>';
const cals=T.parseCals(xml);
ok(cals.length===2&&cals.every(c=>c.href.indexOf('theo-kapsel')<0),'parseCals blendet interne Sammlung theo-kapsel aus der Kalenderwahl aus');

/* ---------- T6 Kapsel-Schreibfehler wird in pushAll gezählt (Dirty bleibt erhalten) ---------- */
throttle=true;
S.capsuleTs=Date.now()+2000000; S.meta.dirty=true; T.SYNC.capJson=null;
const prFail=await T.pushAll();
throttle=false;
ok(prFail.fail>=1&&S.meta.dirty===true,'pushAll verschluckt Kapsel-PUT-Fehler nicht mehr (fail>0, dirty bleibt true)');

T.render(); ok(true,'render ohne Crash');

console.log('\n'+(fails?'✖ '+fails+' FEHLER':'✔ SMOKE R13c GRÜN — alle Tests bestanden'));
process.exit(fails?1:0);
})().catch(e=>{console.error('DRIVER-CRASH:',e&&e.stack||e); process.exit(2)});
