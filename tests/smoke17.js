/* SMOKE R13d — 1) Nextcloud-Web-UI-Termine löschen (Nextcloud-XXXX.ics ≠ <UID>.ics per CalDAV-REPORT + Grabstein),
   2) Mehrtägige Termine (All-Day exklusives DTEND, UTC-Z, DURATION, Agenda-Bündelung, lokales Anlegen),
   3) Überlappung & 6×1h-Termine (echter Zeit-Slot statt Verschiebung in Abend, kompakte Liste, Block+Termin-Koexistenz, Teilen/Aufteilen),
   4) Wochen-Drag-&-Drop (Blöcke verschieben/tauschen, Termine ziehen, Text-Node-Targets, kein slotOccupied-Crash) */
'use strict';
const fs=require('fs');
const els={}; const __h={};
function mkEl(id,extra){
  return Object.assign({
    id:id,value:'',innerHTML:'',textContent:'',style:{},dataset:{},children:[],
    classList:{_s:new Set(),add(c){this._s.add(c)},remove(c){this._s.delete(c)},toggle(c){this._s.has(c)?this._s.delete(c):this._s.add(c)},contains(c){return this._s.has(c)}},
    appendChild(c){this.children.push(c)},remove(){},setAttribute(){},addEventListener(){},focus(){},click(){},
    contains(){return false},
    closest(sel){
      if(sel==='[data-drag]'&&this.dataset&&this.dataset.drag)return this;
      if(sel==='[data-drop]'&&this.dataset&&this.dataset.drop)return this;
      if(sel==='[data-act]'&&this.dataset&&this.dataset.act)return this;
      return this._parent&&this._parent.closest?this._parent.closest(sel):null;
    },
    querySelector(){return null},querySelectorAll(){return[]}
  },extra||{});
}
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

/* Realistischer Nextcloud/SabreDAV-Mock inkl. Nextcloud-XXXX.ics Dateinamen & CalDAV REPORT calendar-query */
const NC='https://kai.nl.example';
const CAL='/remote.php/dav/calendars/kai/personal/';
const SUB='/remote.php/dav/calendars/kai/theo-kapsel/';
const collections={
  [NC+CAL]:{comps:['VEVENT','VTODO'],files:{}},
  [NC+SUB]:{comps:['VJOURNAL'],files:{}}
};
let failDeletes=false, reportCalls=0, deleteLog=[];
global.fetch=async(full,opts)=>{
  opts=opts||{};
  let u=String(full);
  if(u.indexOf('__theo_proxy__')>=0)return {ok:true,status:200,json:async()=>({proxy:true,target:NC}),text:async()=>JSON.stringify({proxy:true,target:NC})};
  if(u.indexOf('__dav_proxy__')>=0){const m=u.match(/[?&]url=([^&]+)/); u=decodeURIComponent(m?m[1]:u)}
  const method=(opts.method||'GET').toUpperCase();
  if(u.slice(-7)==='?export'){
    const base=u.slice(0,-7);
    const col=collections[base];
    if(!col)return {ok:false,status:404,text:async()=>'Not found'};
    const vevs=[];
    for(const fn of Object.keys(col.files)){
      const body=col.files[fn];
      const m=body.match(/BEGIN:(?:VEVENT|VTODO)[\s\S]*?END:(?:VEVENT|VTODO)/g);
      if(m)m.forEach(x=>vevs.push(x));
    }
    return {ok:true,status:200,text:async()=>['BEGIN:VCALENDAR','VERSION:2.0',...vevs,'END:VCALENDAR'].join('\r\n')};
  }
  if(method==='REPORT'){
    reportCalls++;
    const col=collections[u];
    if(!col)return {ok:false,status:404,text:async()=>'Not found'};
    const body=String(opts.body||'');
    const tm=body.match(/<c:text-match[^>]*>([\s\S]*?)<\/c:text-match>/i);
    const wantUid=tm?tm[1].trim():'';
    const resps=[];
    const pathOnly=u.replace(NC,'');
    for(const fn of Object.keys(col.files)){
      const ics=col.files[fn];
      if(!wantUid||ics.indexOf('UID:'+wantUid)>=0){
        resps.push('<d:response><d:href>'+pathOnly+fn+'</d:href><d:propstat><d:prop><d:getetag>"e1"</d:getetag></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>');
      }
    }
    return {ok:true,status:207,text:async()=>'<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">'+resps.join('')+'</d:multistatus>'};
  }
  const slash=u.lastIndexOf('/');
  const colUrl=u.slice(0,slash+1);
  const fn=decodeURIComponent(u.slice(slash+1));
  const col=collections[colUrl];
  if(!col)return {ok:false,status:404,text:async()=>'Collection not found'};
  if(method==='GET'){
    if(!(fn in col.files))return {ok:false,status:404,text:async()=>'Not found'};
    return {ok:true,status:200,text:async()=>col.files[fn]};
  }
  if(method==='PUT'){
    const body=String(opts.body||'');
    /* SabreDAV-Regel: existiert dieselbe UID schon unter anderem Dateinamen, schlägt PUT auf <uid>.ics mit 400 fehl */
    const um=body.match(/\bUID:([^\r\n]+)/);
    if(um){
      const uid=um[1].trim();
      for(const k of Object.keys(col.files)){
        if(k!==fn&&col.files[k].indexOf('UID:'+uid)>=0){
          return {ok:false,status:400,text:async()=>'Calendar object with uid already exists in this calendar collection.'};
        }
      }
    }
    col.files[fn]=body;
    return {ok:true,status:204,text:async()=>''};
  }
  if(method==='DELETE'){
    deleteLog.push(fn);
    if(failDeletes)return {ok:false,status:503,text:async()=>'Temporarily unavailable'};
    if(!(fn in col.files))return {ok:false,status:404,text:async()=>'Not found'};
    delete col.files[fn];
    return {ok:true,status:204,text:async()=>''};
  }
  return {ok:false,status:405,text:async()=>''};
};

const html=fs.readFileSync('conf/lebensrhythmus-prototyp.html','utf8');
let src=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).sort((a,b)=>b.length-a.length)[0];
src+='\nglobalThis.__T={S,ui,ACT,SYNC,syncCycle,pushAll,processRemote,classifyRemote,importICS,reconcileDeleted,buildEvents,findAppt,apptsInSlot,hasTimeOverlap,blockOccW,blockSpanRoomW,slotCell,renderAgenda,renderWeek,render,apsFor,blocksFor,wk,parseISO,addDays,iso,mondayOf,dayIdx,tombDead};';
eval(src);

let fails=0;
function ok(cond,msg){if(cond)console.log('PASS — '+msg); else{fails++; console.log('FAIL — '+msg)}}

(async()=>{
const T=globalThis.__T, S=T.S, ACT=T.ACT;
const calFiles=collections[NC+CAL].files;
S.settings.webdav={url:NC,user:'kai',pass:'app-pw',cal:CAL,cal2:''};
S.meta.pulled=true; S.meta.dirty=false;

/* ========== T1: Nextcloud-Web-UI-Termine löschen (Nextcloud-XXXX.ics ≠ <UID>.ics) ========== */
const ncUid='8a7f1c2e-1111-4222-8333-444455556666';
calFiles['Nextcloud-A9F2C1.ics']=[
  'BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT',
  'UID:'+ncUid,
  'DTSTART:20261125T100000',
  'DTEND:20261125T110000',
  'SUMMARY:Zahnarzt aus Nextcloud-Web-UI',
  'END:VEVENT','END:VCALENDAR'
].join('\r\n');

await T.syncCycle();
await new Promise(r=>setTimeout(r,40));
const wNov23='2026-11-23';
const importedAp=T.apptsInSlot(wNov23,2,0).find(a=>a.remoteUid===ncUid);
ok(!!importedAp,'T1: Nextcloud-Termin (Nextcloud-A9F2C1.ics) beim Sync übernommen');
ok(/CATEGORIES:LR-ASSIGNED/.test(calFiles['Nextcloud-A9F2C1.ics']),'T1: Auto-Writeback hat echte Datei Nextcloud-A9F2C1.ics per REPORT gefunden und markiert');

/* Kaltstart simulieren (Href-Cache leer wie nach Seiten-Reload) und Termin in Theo löschen */
T.SYNC.hrefs={};
deleteLog=[]; reportCalls=0;
await ACT.apptDel({id:importedAp.id});
ok(!T.findAppt(importedAp.id),'T1: Termin lokal aus Theo entfernt');
ok(reportCalls>=1&&deleteLog.includes('Nextcloud-A9F2C1.ics'),'T1: DELETE ging nach 404 auf <uid>.ics per CalDAV-REPORT an Nextcloud-A9F2C1.ics');
ok(!('Nextcloud-A9F2C1.ics' in calFiles),'T1: Nextcloud-Datei wirklich auf dem Server gelöscht');

await T.syncCycle();
const afterSyncAp=T.apptsInSlot(wNov23,2,0).find(a=>a.remoteUid===ncUid);
ok(!afterSyncAp,'T1: Gelöschter Nextcloud-Termin kehrt beim nächsten Sync NICHT zurück');
ok(!T.tombDead(ncUid),'T1: Grabstein nach bestätigter Server-Abwesenheit sauber aufgeräumt');

/* T1b: Offline-/503-Fehler beim Löschen → Grabstein verhindert Auferstehung & räumt später ab */
const ncUid2='9b8e2d3f-2222-4333-8444-555566667777';
calFiles['Nextcloud-OFFLINE.ics']=[
  'BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT',
  'UID:'+ncUid2,'DTSTART:20261126T140000','DTEND:20261126T150000','SUMMARY:Offline-Löschtest',
  'END:VEVENT','END:VCALENDAR'
].join('\r\n');
await T.syncCycle();
const offAp=T.apptsInSlot(wNov23,3,1).find(a=>a.remoteUid===ncUid2);
ok(!!offAp,'T1b: Zweiter Nextcloud-Termin übernommen');
failDeletes=true; T.SYNC.hrefs={};
await ACT.apptDel({id:offAp.id});
ok('Nextcloud-OFFLINE.ics' in calFiles&&T.tombDead(ncUid2),'T1b: Server-DELETE schlug fehl (503), Grabstein ist gesetzt');
await T.syncCycle();
ok(!T.apptsInSlot(wNov23,3,1).some(a=>a.remoteUid===ncUid2),'T1b: Trotz noch vorhandener Server-Datei KEINE Auferstehung beim Sync');
failDeletes=false;
await T.syncCycle();
await new Promise(r=>setTimeout(r,40));
ok(!('Nextcloud-OFFLINE.ics' in calFiles),'T1b: Beim nächsten erreichbaren Sync wurde Nextcloud-OFFLINE.ics automatisch nachgelöscht');

/* T1c: Gegenrichtung — Termin in Nextcloud gelöscht → verschwindet auch in Theo */
const ncUid3='7c6d5e4f-3333-4444-8555-666677778888';
calFiles['Nextcloud-REMOTEDEL.ics']=[
  'BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT',
  'UID:'+ncUid3,'DTSTART:20261127T090000','DTEND:20261127T100000','SUMMARY:In Nextcloud gelöscht',
  'END:VEVENT','END:VCALENDAR'
].join('\r\n');
await T.syncCycle();
ok(T.apptsInSlot(wNov23,4,0).some(a=>a.remoteUid===ncUid3),'T1c: Termin zunächst in Theo sichtbar');
delete calFiles['Nextcloud-REMOTEDEL.ics'];
await T.syncCycle();
ok(!T.apptsInSlot(wNov23,4,0).some(a=>a.remoteUid===ncUid3)&&!S.mapped[ncUid3],'T1c: Nach Löschung in Nextcloud auch lokal aus Theo entfernt');

/* ========== T2: Mehrtägige Termine (All-Day exklusives DTEND, UTC-Z, Agenda-Bündelung) ========== */
const multiUid='multi-konferenz-2026';
calFiles['Nextcloud-MULTI.ics']=[
  'BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT',
  'UID:'+multiUid,
  'DTSTART;VALUE=DATE:20261125',
  'DTEND;VALUE=DATE:20261128', /* RFC 5545 exklusiv -> Mi 25., Do 26., Fr 27.11. (3 Tage, NICHT Sa 28.11.) */
  'SUMMARY:Klausurtagung',
  'END:VEVENT','END:VCALENDAR'
].join('\r\n');
calFiles['Nextcloud-UTC.ics']=[
  'BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT',
  'UID:utc-reise-2026',
  'DTSTART:20261128T130000Z',
  'DURATION:P2D', /* Sa 28.11. + So 29.11. */
  'SUMMARY:Wochenendseminar',
  'END:VEVENT','END:VCALENDAR'
].join('\r\n');

T.ui.anchor=T.parseISO(wNov23);
await T.syncCycle();
await new Promise(r=>setTimeout(r,40));
const d25=T.apptsInSlot(wNov23,2,0).find(a=>a.remoteUid===multiUid);
const d26=T.apptsInSlot(wNov23,3,0).find(a=>a.remoteUid===multiUid);
const d27=T.apptsInSlot(wNov23,4,0).find(a=>a.remoteUid===multiUid);
const d28=T.apptsInSlot(wNov23,5,0).find(a=>a.remoteUid===multiUid);
ok(!!d25&&!!d26&&!!d27&&!d28,'T2: 3-tägiger All-Day-Termin erscheint exakt an Mi 25., Do 26., Fr 27. (exklusives DTEND 28.11. beachtet)');
ok(d25.multiIdx===1&&d26.multiIdx===2&&d27.multiIdx===3&&d27.multiTotal===3,'T2: Tageszähler Tag 1/3 .. Tag 3/3 korrekt gesetzt');
const utc28=[0,1,2].map(s=>T.apptsInSlot(wNov23,5,s)).flat().find(a=>a.remoteUid==='utc-reise-2026');
const utc29=[0,1,2].map(s=>T.apptsInSlot(wNov23,6,s)).flat().find(a=>a.remoteUid==='utc-reise-2026');
ok(!!utc28&&!!utc29,'T2: UTC-Z + DURATION:P2D wird ebenfalls sauber als 2-Tages-Termin erkannt');

/* Zweiter Sync darf keine Duplikate erzeugen */
await T.syncCycle();
ok(T.apptsInSlot(wNov23,2,0).filter(a=>a.remoteUid===multiUid).length===1,'T2: Zweiter Sync erzeugt keine Duplikate für mehrtägige Termine');

/* Agenda bündelt mehrtägigen Termin zu 1 Zeile, Chip-Zähler stimmt */
T.ui.agRange='woche';
const agHtml=T.renderAgenda();
const chipM=agHtml.match(/data-r="woche">[^<]*\((\d+)\)/);
const agRows=(agHtml.match(/class="agRow"/g)||[]).length;
ok(!!chipM&&+chipM[1]===agRows,'T2: Agenda-Zähler Woche ('+(chipM?chipM[1]:'?')+') == angezeigte Zeilen ('+agRows+')');
ok((agHtml.match(/Klausurtagung/g)||[]).length===1&&/3 Tage/.test(agHtml),'T2: Mehrtägiger Termin erscheint in der Terminliste gebündelt als 1 Eintrag mit „3 Tage"');

/* Löschen eines Tages löscht alle 3 Tage + Server-Datei */
await ACT.apptDel({id:d26.id});
ok(!T.findAppt(d25.id)&&!T.findAppt(d26.id)&&!T.findAppt(d27.id)&&!('Nextcloud-MULTI.ics' in calFiles),'T2: Löschen entfernt alle Tage des mehrtägigen Termins + Nextcloud-Datei');

/* Lokaler mehrtägiger Termin über + Termin (na-date + na-end) */
els['na-title']=mkEl('na-title',{value:'Workshop lokal'});
els['na-date']=mkEl('na-date',{value:'2026-12-01'});
els['na-end']=mkEl('na-end',{value:'2026-12-03'});
els['na-t0']=mkEl('na-t0',{value:'09:00'});
els['na-t1']=mkEl('na-t1',{value:'17:00'});
els['na-ampel']=mkEl('na-ampel',{value:'gelb'});
els['na-type']=mkEl('na-type',{value:''});
els['na-span']=mkEl('na-span',{value:'1'});
ACT.newApptSave();
const wNov30='2026-11-30';
ok(T.apptsInSlot(wNov30,1,0).some(a=>a.title==='Workshop lokal'&&a.multiTotal===3)&&T.apptsInSlot(wNov30,3,1).some(a=>a.title==='Workshop lokal'&&a.multiIdx===3),'T2: Lokaler mehrtägiger Termin über alle 3 Tage angelegt');

/* ========== T3: 6×1h-Termine in Folge, Überlappung, Block+Termin-Koexistenz & Teilen ========== */
const wDec07='2026-12-07';
T.ui.anchor=T.parseISO(wDec07);
const sixIcs=['BEGIN:VCALENDAR','VERSION:2.0'];
const hours=[['0800','0900'],['0900','1000'],['1000','1100'],['1100','1200'],['1200','1300'],['1300','1400'],['0930','1030']];
hours.forEach((h,i)=>{
  sixIcs.push('BEGIN:VEVENT','UID:kette-'+i,'DTSTART:20261207T'+h[0]+'00','DTEND:20261207T'+h[1]+'00','SUMMARY:Termin '+(i+1),'END:VEVENT');
});
sixIcs.push('END:VCALENDAR');
T.processRemote(sixIcs.join('\r\n'));

const monMorning=T.apptsInSlot(wDec07,0,0);
const monMid=T.apptsInSlot(wDec07,0,1);
const monEve=T.apptsInSlot(wDec07,0,2);
ok(monMorning.length===5&&monMid.length===2&&monEve.length===0,'T3: 6×1h + 1 Überlappung landen in ihren echten Zeit-Slots (5 Vormittag, 2 Mittag, 0 falsch im Abend!)');
ok(T.hasTimeOverlap(monMorning)&&!T.hasTimeOverlap(monMid),'T3: Echte Zeit-Überschneidung (09:30–10:30 vs. 09:00–10:00/10:00–11:00) präzise erkannt');

const cellCollapsed=T.slotCell(0,0,true,-1,false);
ok(/class="apList"/.test(cellCollapsed)&&/weitere Termine/.test(cellCollapsed)&&/Überschneidung/.test(cellCollapsed)&&/Aufteilen/.test(cellCollapsed)&&/Block dazu/.test(cellCollapsed),'T3: Kompakte Termin-Liste mit Ausklapp-Schalter, Überschneidungs-Hinweis, Aufteilen & „＋ Block dazu"');
ACT.toggleApptExp({k:wDec07+'|0|0'});
const cellExpanded=T.slotCell(0,0,true,-1,false);
ok((cellExpanded.match(/class="apRow"/g)||[]).length===5&&/kompakt zeigen/.test(cellExpanded),'T3: Aufklappen zeigt alle 5 Termine im Slot sauber sortiert');

/* Block parallel zu den Terminen im selben Slot anlegen (Koexistenz!) */
els['f-span']=mkEl('f-span',{value:'1'});
ACT.fillType({day:'0',slot:'0',tid:S.types[0].id});
const coexBlock=T.blocksFor(wDec07)['0|0'];
ok(!!coexBlock&&T.apptsInSlot(wDec07,0,0).length===5,'T3: Block + 5 Termine koexistieren im selben Slot ohne Verdrängung');
const cellBoth=T.slotCell(0,0,true,-1,false);
ok(/data-act="openBlock"/.test(cellBoth)&&/class="apList/.test(cellBoth),'T3: Wochenzelle rendert sowohl den Block als auch die Termin-Liste');

/* Einzelnen 2h-Termin in zwei Teile teilen (ACT.splitAppt) */
const splitSrcId='ap-2h-split';
T.apsFor(wDec07)['1|0']={id:splitSrcId,day:1,slot:0,title:'Intensiv-Session',time:'11:00–13:00',t0:'11:00',t1:'13:00',ampel:'gelb',src:'Manuell',span:1};
ACT.splitAppt({id:splitSrcId});
const tue0=T.apptsInSlot(wDec07,1,0), tue1=T.apptsInSlot(wDec07,1,1);
ok(tue0.length===1&&/1\/2/.test(tue0[0].title)&&tue0[0].t0==='11:00'&&tue0[0].t1==='12:00','T3: splitAppt Teil 1/2 (11:00–12:00) im Vormittag');
ok(tue1.length===1&&/2\/2/.test(tue1[0].title)&&tue1[0].t0==='12:00'&&tue1[0].t1==='13:00','T3: splitAppt Teil 2/2 (12:00–13:00) automatisch in den Mittagsblock gelegt');

/* 6 Vormittags-Termine per autoSplitDay gleichmäßig auf Vormittag / Mittag / Abend verteilen */
for(let i=0;i<6;i++){
  const ap={id:'six-m-'+i,day:2,slot:0,title:'Kurztermin '+(i+1),time:'08:'+String(i*10).padStart(2,'0'),t0:'08:'+String(i*10).padStart(2,'0'),t1:'08:'+String(i*10+10).padStart(2,'0'),span:1,src:'Manuell'};
  if(i===0)T.apsFor(wDec07)['2|0']=ap;
  else{T.apsFor(wDec07)['2|0'].stack=T.apsFor(wDec07)['2|0'].stack||[]; T.apsFor(wDec07)['2|0'].stack.push(ap)}
}
ACT.autoSplitDay({w:wDec07,day:'2'});
ok(T.apptsInSlot(wDec07,2,0).length===2&&T.apptsInSlot(wDec07,2,1).length===2&&T.apptsInSlot(wDec07,2,2).length===2,'T3: autoSplitDay verteilt 6 geballte Termine gleichmäßig 2–2–2 auf Vormittag/Mittag/Abend');

/* Block teilen (ACT.splitBlock) */
T.blocksFor(wDec07)['3|0']={id:'bl-split-1',kind:'typ',typeId:S.types[0].id,title:'Konzeptarbeit',ampel:'gelb',note:'',done:false,span:1};
ACT.splitBlock({w:wDec07,day:'3',slot:'0'});
ok(!!T.blocksFor(wDec07)['3|1']&&/Teil 2/.test(T.blocksFor(wDec07)['3|1'].title),'T3: splitBlock legt „(Teil 2)" im nächsten freien Slot an');

/* ========== T4: Wochen-Drag-&-Drop (Blöcke, Block-Tausch, Termine, Text-Node-Targets) ========== */
function simDrop(dragStr,dropCode,useTextNode){
  const srcEl=mkEl('drag-src',{dataset:{drag:dragStr}});
  const dstEl=mkEl('drop-dst',{dataset:{drop:dropCode}});
  const dragTarget=useTextNode?{nodeType:3,parentElement:srcEl}:srcEl;
  const dropTarget=useTextNode?{nodeType:3,parentElement:dstEl}:dstEl;
  let store='';
  const dt={setData(k,v){store=v},getData(){return store},effectAllowed:'',dropEffect:''};
  __h.dragstart({target:dragTarget,dataTransfer:dt});
  __h.dragover({target:dropTarget,dataTransfer:dt,preventDefault(){}});
  __h.drop({target:dropTarget,dataTransfer:dt,preventDefault(){}});
  if(__h.dragend)__h.dragend({});
}

/* 4a: Block per Drag & Drop in leeren Slot ziehen (vorher ReferenceError: slotOccupied is not defined!) */
S.projects=[{id:'p-dnd',name:'DnD-Projekt',areaId:null,todos:[{id:'td-dnd',title:'DnD-Todo',done:false,kanban:'offen',planned:{wk:wDec07,day:3,slot:0}}]}];
T.blocksFor(wDec07)['3|0'].todoId='td-dnd';
simDrop('block:3|0','w4s1',true); /* inkl. Text-Node-Target ohne eigenes .closest() */
ok(!T.blocksFor(wDec07)['3|0']&&!!T.blocksFor(wDec07)['4|1'],'T4a: Block per Drag & Drop verschoben (auch bei Text-Node-Event-Target, kein slotOccupied-Crash)');
ok(S.projects[0].todos[0].planned.day===4&&S.projects[0].todos[0].planned.slot===1,'T4a: Verknüpftes To-do aktualisiert seinen geplanten Slot mit');

/* 4b: Block in einen Slot ziehen, in dem schon ein Termin liegt (Koexistenz) */
T.apsFor(wDec07)['5|0']={id:'ap-sat-0',day:5,slot:0,title:'Samstags-Call',time:'10:00–10:30',t0:'10:00',t1:'10:30',span:1,src:'Manuell'};
simDrop('block:4|1','w5s0',false);
ok(!!T.blocksFor(wDec07)['5|0']&&T.apptsInSlot(wDec07,5,0).length===1,'T4b: Block lässt sich per Drag & Drop auch in einen Slot mit kurzem Termin ziehen');

/* 4c: Zwei 1-Slot-Blöcke per Drag & Drop tauschen */
const idA=T.blocksFor(wDec07)['5|0'].id, idB=T.blocksFor(wDec07)['3|1'].id;
simDrop('block:5|0','w3s1',false);
ok(T.blocksFor(wDec07)['3|1'].id===idA&&T.blocksFor(wDec07)['5|0'].id===idB,'T4c: Zwei Blöcke tauschen per Drag & Drop sauber die Plätze');

/* 4d: Gestapelten Termin per Drag & Drop in anderen Tag/Slot ziehen */
const stackedAp=T.apptsInSlot(wDec07,0,0)[2];
simDrop('appt:'+stackedAp.id,'w6s2',true);
ok(T.apptsInSlot(wDec07,6,2).some(a=>a.id===stackedAp.id)&&!T.apptsInSlot(wDec07,0,0).some(a=>a.id===stackedAp.id),'T4d: Einzelner Termin aus einem 5er-Stapel per Drag & Drop in So Abend gezogen');
ok(S.mapped[stackedAp.remoteUid]&&S.mapped[stackedAp.remoteUid].day===6&&S.mapped[stackedAp.remoteUid].slot===2,'T4d: S.mapped des gezogenen Fremdtermins auf neuen Tag/Slot aktualisiert');

T.render();
ok(true,'T5: Vollständiges Render mit allen R13d-Strukturen ohne Crash');

console.log('\n'+(fails?'✖ '+fails+' FEHLER':'✔ SMOKE R13d GRÜN — alle Tests bestanden'));
process.exit(fails?1:0);
})().catch(e=>{console.error('DRIVER-CRASH:',e); process.exit(2)});
