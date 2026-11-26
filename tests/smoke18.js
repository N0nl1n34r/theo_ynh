/* SMOKE R13e — 1) „wie Termin“-Blöcke (asAppt) konsistent als Termin-Karte + Koexistenz mit regulären Blöcken,
   2) Sync-Stabilität (kein Verdoppeln von Terminen beim Drag & Drop + Live-Edit-Schutz für Bereichs-Texte),
   3) Drag & Drop aus „Anstehend — mit Deadline, ohne Block“ (Projekt-To-do & Einzelaufgabe),
   4) 15-Minuten-Time-Picker (:00/:15/:30/:45, niemals aktuelle Uhrzeit, Erhalt fremder Import-Minuten),
   5) & 6) Blocktyp-Vorlagen (Standard: Editor öffnet direkt nach Auswahl; konfigurierbar: Dauer, direkt fertig, Notiz, Start-/Endzeit, Kapsel-Sync),
   7) & 8) Dezentes „＋ Block dazu“ (Hover am PC / kompakter Eck-Button + Sheet-Button mobil) & Karten-Layout ohne Überlauf */
'use strict';
const fs=require('fs');
const els={}; const __h={};
function mkEl(id,extra){
  return Object.assign({
    id:id,value:'',checked:false,innerHTML:'',textContent:'',style:{},dataset:{},children:[],selectionStart:0,tagName:'DIV',
    classList:{_s:new Set(),add(c){this._s.add(c)},remove(c){this._s.delete(c)},toggle(c,f){const on=f!==undefined?!!f:!this._s.has(c); on?this._s.add(c):this._s.delete(c)},contains(c){return this._s.has(c)}},
    appendChild(c){this.children.push(c)},remove(){},setAttribute(){},addEventListener(){},focus(){global.document.activeElement=this},select(){},setSelectionRange(){},click(){},
    contains(other){return this===other||!!(other&&other._insideMain&&this.id==='main')},
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
  activeElement:null,
  getElementById:id=>els[id]||(els[id]=mkEl(id)),
  querySelector:s=>{
    if(s&&s[0]==='#'&&!/[\s.\[]/.test(s.slice(1)))return global.document.getElementById(s.slice(1));
    return els['q:'+s]||(els['q:'+s]=mkEl('q:'+s));
  },
  querySelectorAll:()=>[],
  createElement:t=>mkEl('tmp-'+t+'-'+Math.random(),{tagName:String(t||'div').toUpperCase()}),
  body:mkEl('body'),
  addEventListener(n,f){__h[n]=f}
};
global.localStorage={_m:{},getItem(k){return this._m[k]||null},setItem(k,v){this._m[k]=String(v)},removeItem(k){delete this._m[k]}};
Object.defineProperty(global,'navigator',{value:{clipboard:{writeText:async()=>{}}},configurable:true,writable:true});

const NC='https://kai.nl.example';
const CAL='/remote.php/dav/calendars/kai/personal/';
const SUB='/remote.php/dav/calendars/kai/theo-kapsel/';
const collections={
  [NC+CAL]:{comps:['VEVENT','VTODO'],files:{}},
  [NC+SUB]:{comps:['VJOURNAL'],files:{}}
};
let failDeletes=false, reportCalls=0, putLog=[];
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
    putLog.push(colUrl+fn);
    col.files[fn]=body;
    return {ok:true,status:201,text:async()=>''};
  }
  if(method==='DELETE'){
    if(failDeletes)return {ok:false,status:503,text:async()=>'Offline'};
    if(!(fn in col.files))return {ok:false,status:404,text:async()=>'Not found'};
    delete col.files[fn];
    return {ok:true,status:204,text:async()=>''};
  }
  return {ok:false,status:405,text:async()=>''};
};

const html=fs.readFileSync(__dirname+'/../conf/lebensrhythmus-prototyp.html','utf8');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).sort((a,b)=>b.length-a.length);
const code=scripts[0];
const T=(new Function(code+'\nreturn {S:()=>S,setS:v=>{S=v},ui,SYNC,ACT,seed,normalizeState,normalizeType,timePickHtml,syncCycle,pushAll,pullCapsule,capsuleJson,capsuleICS,processCapsule,wk,mondayOf,parseISO,iso,addDays,dayIdx,findAppt,apptsInSlot,slotApptDisplayList,allApptItems,blocksFor,apsFor,slotCell,renderUpcoming,renderConfig,render,isAsApptBlock,realBlockAt,blockOccW};'))();

let fail=0;
function ok(cond,msg){
  if(cond)console.log('PASS — '+msg);
  else{console.error('FAIL — '+msg); fail++}
}

(async()=>{
  const S=T.S();
  S.meta.intro=true;
  S.meta.pulled=true;
  S.settings.webdav={url:NC,user:'kai',pass:'app-pw',cal:CAL,cal2:'',capMode:'sub'};
  T.ui.anchor=T.mondayOf(T.parseISO('2026-11-25')); // Woche ab Mo 2026-11-23
  const W=T.wk();

  /* =========================================================================
     T4: 15-Minuten-Time-Picker (:00, :15, :30, :45), nie aktuelle Uhrzeit
     ========================================================================= */
  ok(!/type="time"/i.test(html),'T4: Kein einziges natives <input type="time"> mehr im gesamten HTML/JS');
  const tpEmpty=T.timePickHtml('','id="t-test"','— Start —');
  ok(/<option value="" selected>— Start —<\/option>/.test(tpEmpty),'T4: Leerer Time-Picker startet immer leer (übernimmt niemals die aktuelle Minute von „jetzt“)');
  const optVals=[...tpEmpty.matchAll(/<option value="([^"]+)"/g)].map(m=>m[1]);
  ok(optVals.length===96&&optVals.every(v=>/^\d{2}:(00|15|30|45)$/.test(v)),
    'T4: Exakt 96 Optionen streng im 15-Minuten-Raster (00, 15, 30, 45) — gefunden: '+optVals.length);
  const tpImported=T.timePickHtml('14:07','id="t-imp"');
  ok(/<option value="14:07" selected>14:07<\/option>/.test(tpImported),
    'T4: Aus Nextcloud importierte krumme Uhrzeit (14:07) bleibt verlustfrei als Option erhalten');

  /* =========================================================================
     T1: „wie Termin“-Blöcke (asAppt) konsistent als Termin-Karte + Koexistenz
     ========================================================================= */
  const ty1on1=S.types.find(t=>t.asAppt); // ty6: 1:1-Termin
  ok(!!ty1on1,'T1: Vorkonfigurierter „wie Termin“-Typ (1:1-Termin) vorhanden');
  els['f-span']=mkEl('f-span',{value:'0'});
  T.ACT.fillType({day:'1',slot:'0',tid:ty1on1.id});
  const ov=els['overlay'];
  ok(ov.classList.contains('on')&&/id="ta-title"/.test(ov.innerHTML)&&/<select[^>]*id="ta-t0"/.test(ov.innerHTML),
    'T1: Auswahl eines „wie Termin“-Typs öffnet Termin-Vorlagen-Sheet mit 15-Min-Select');
  els['ta-title']=mkEl('ta-title',{value:'1:1 mit Anna'});
  els['ta-note']=mkEl('ta-note',{value:'Quartals-Check'});
  els['ta-t0']=mkEl('ta-t0',{value:'10:15'});
  els['ta-t1']=mkEl('ta-t1',{value:'11:00'});
  els['ta-span']=mkEl('ta-span',{value:'1'});
  T.ACT.typeApptSave({day:'1',slot:'0',tid:ty1on1.id});

  const cellOnlyAsAppt=T.slotCell(1,0,true,-1,false);
  ok(/class="card appt"/.test(cellOnlyAsAppt)&&/1:1 mit Anna/.test(cellOnlyAsAppt)&&/10:15–11:00/.test(cellOnlyAsAppt),
    'T1: „wie Termin“-Eintrag wird im Wochenraster optisch als echte Termin-Karte (card appt) mit Uhrzeit gerendert');
  ok(!T.blockOccW(W,1,0)&&/class="slotAddBlk"/.test(cellOnlyAsAppt),
    'T1: Slot mit „wie Termin“-Eintrag gilt für Arbeitsblöcke als frei und bietet „＋ Block dazu“ an');

  /* Jetzt regulären Arbeitsblock (Fokusarbeit) in DENSELBEN Slot legen -> Koexistenz! */
  const tyFokus=S.types.find(t=>t.name==='Fokusarbeit');
  tyFokus.openEdit=false; // direkt setzen für diesen Schritt
  T.ACT.fillType({day:'1',slot:'0',tid:tyFokus.id});
  tyFokus.openEdit=true;
  const realB=T.realBlockAt(W,1,0);
  const slotDisp=T.slotApptDisplayList(W,1,0);
  const cellBoth=T.slotCell(1,0,true,-1,false);
  ok(!!realB&&realB.title==='Fokusarbeit'&&slotDisp.length===1&&slotDisp[0].title==='1:1 mit Anna',
    'T1: Regulärer Block + „wie Termin“-Eintrag koexistieren im selben Slot (kein Überschreiben!)');
  ok(/Fokusarbeit/.test(cellBoth)&&/1:1 mit Anna/.test(cellBoth),
    'T1: Wochenzelle zeigt sowohl Fokusarbeit-Block als auch „1:1 mit Anna“ gleichzeitig');

  /* Umgekehrte Reihenfolge: erst Block im Slot, danach noch einen „wie Termin“-Eintrag dazu! */
  els['ta-title']=mkEl('ta-title',{value:'1:1 mit Ben'});
  els['ta-t0']=mkEl('ta-t0',{value:'11:15'});
  els['ta-t1']=mkEl('ta-t1',{value:'11:45'});
  els['ta-span']=mkEl('ta-span',{value:'1'});
  T.ACT.typeApptSave({day:'1',slot:'0',tid:ty1on1.id});
  ok(T.realBlockAt(W,1,0).title==='Fokusarbeit'&&T.slotApptDisplayList(W,1,0).length===2,
    'T1: Auch in einen bereits mit Block belegten Slot lässt sich ein weiterer „wie Termin“-Eintrag dazulegen');

  /* =========================================================================
     T5 & T6: Editor nach Auswahl voreingestellter Blöcke + Blocktyp-Templates
     ========================================================================= */
  const tyReg=S.types.find(t=>t.name==='Regeneration'); // voreingestellter Block (openEdit default true)
  els['f-span']=mkEl('f-span',{value:'0'});
  T.ACT.fillType({day:'4',slot:'2',tid:tyReg.id}); // Fr Abend
  ok(!!T.blocksFor(W)['4|2']&&ov.classList.contains('on')&&/id="b-title"/.test(ov.innerHTML)&&/Regeneration/.test(ov.innerHTML),
    'T5: Voreingestellter Block (Regeneration) öffnet nach dem Auswählen direkt den Block-Editor');
  els['b-title']=mkEl('b-title',{value:'Kochen mit Freunden'});
  els['b-note']=mkEl('b-note',{value:'Pasta & Salat'});
  els['b-span']=mkEl('b-span',{value:'1'});
  els['b-type']=mkEl('b-type',{value:tyReg.id});
  T.ACT.blockSave({day:'4',slot:'2',w:W});
  ok(T.blocksFor(W)['4|2'].title==='Kochen mit Freunden'&&!ov.classList.contains('on'),
    'T5: Direktes Umbenennen im geöffneten Editor speichert den individuellen Titel');

  /* Blocktyp-Vorlage in der Konfiguration anpassen (2 Blöcke, direkt ohne Editor, Notiz, Uhrzeit) */
  T.ACT.addType();
  const customType=S.types[S.types.length-1];
  __h.input({target:mkEl('inp',{value:'Deep-Work-Sprint',dataset:{field:'typeName',id:customType.id}})});
  __h.change({target:mkEl('sel',{value:'2',dataset:{field:'typeDefSpan',id:customType.id}})});
  __h.change({target:mkEl('chk',{checked:false,dataset:{field:'typeOpenEdit',id:customType.id}})});
  __h.input({target:mkEl('inp',{value:'Handy im Flugmodus',dataset:{field:'typeDefNote',id:customType.id}})});
  __h.change({target:mkEl('sel',{value:'08:30',dataset:{field:'typeDefT0',id:customType.id}})});
  __h.change({target:mkEl('sel',{value:'12:30',dataset:{field:'typeDefT1',id:customType.id}})});
  ok(customType.name==='Deep-Work-Sprint'&&customType.defSpan===2&&customType.openEdit===false&&customType.defNote==='Handy im Flugmodus'&&customType.defT0==='08:30'&&customType.defT1==='12:30',
    'T6: Blocktyp-Vorlage übernimmt Standard-Dauer (2 Blöcke), Direkt-Modus, Notiz und 15-Min-Uhrzeiten');

  els['f-span']=mkEl('f-span',{value:'0'}); // Vorlagen-Standard nutzen
  T.ACT.fillType({day:'3',slot:'0',tid:customType.id}); // Do Vormittag (+ Mittag)
  const sprintBl=T.blocksFor(W)['3|0'];
  ok(!!sprintBl&&sprintBl.span===2&&sprintBl.note==='Handy im Flugmodus'&&sprintBl.t0==='08:30'&&sprintBl.t1==='12:30'&&!ov.classList.contains('on'),
    'T6: Einsetzen der Vorlage erzeugt sofort einen 2-Block-Eintrag mit Vorlagen-Notiz/Uhrzeit ohne Editor-Popup');

  /* Kapsel-Roundtrip der Blocktyp-Vorlagen prüfen */
  const capIcs=T.capsuleICS(T.capsuleJson());
  ok(/defSpan/.test(capIcs)&&/Handy im Flugmodus/.test(capIcs),'T6: Blocktyp-Vorlagen werden in der Theo-Kapsel (CalDAV) mitgesichert');

  /* =========================================================================
     T3: Drag & Drop aus „🕐 Anstehend — mit Deadline, ohne Block“
     ========================================================================= */
  S.areas=[{id:'ar1',name:'Arbeit',emoji:'💼',color:'#5b8fa8'}];
  S.projects=[{id:'pr1',areaId:'ar1',name:'Steuer & Buchhaltung',emoji:'📂',note:'',views:{list:true,kanban:true},
    todos:[{id:'td_due1',title:'USt-Voranmeldung abschicken',done:false,kanban:'offen',due:'2026-11-27',firstStep:'ELSTER öffnen',planned:null}]}];
  S.tasks=[{id:'tk_due1',title:'Rechnung Zahnarzt einreichen',done:false,due:'2026-11-28',firstStep:'PDF scannen',planned:null}];

  const upHtml=T.renderUpcoming();
  ok(/data-drag="todo:pr1\|td_due1"/.test(upHtml)&&/data-drag="task:tk_due1"/.test(upHtml)&&/class="upGrip"/.test(upHtml),
    'T3: „Anstehend“-Einträge (Projekt-To-do UND Einzelaufgabe) sind als draggable Karten gerendert');

  function simulateDragDrop(dragAttr,dropAttr){
    const src=mkEl('drag-src',{dataset:{drag:dragAttr}});
    const dst=mkEl('drop-dst',{dataset:{drop:dropAttr}});
    let transferred='';
    const dt={setData:(k,v)=>{transferred=v},getData:()=>transferred,effectAllowed:'',dropEffect:''};
    __h.dragstart({target:src,dataTransfer:dt});
    __h.drop({target:dst,dataTransfer:dt,preventDefault(){}});
    __h.dragend({});
  }
  simulateDragDrop('todo:pr1|td_due1','w2s0'); // Mi Vormittag
  ok(!!T.blocksFor(W)['2|0']&&T.blocksFor(W)['2|0'].todoId==='td_due1'&&S.projects[0].todos[0].planned.day===2&&S.projects[0].todos[0].planned.slot===0,
    'T3a: Projekt-To-do aus „Anstehend“ per Drag & Drop direkt in Mi Vormittag geplant');
  simulateDragDrop('task:tk_due1','w2s2'); // Mi Abend
  ok(!!T.blocksFor(W)['2|2']&&T.blocksFor(W)['2|2'].taskId==='tk_due1'&&S.tasks[0].planned.day===2&&S.tasks[0].planned.slot===2,
    'T3b: Einzelaufgabe aus „Anstehend“ per Drag & Drop direkt in Mi Abend geplant');
  ok(/Nichts mit Deadline/.test(T.renderUpcoming())&&!/data-drag=/.test(T.renderUpcoming()),
    'T3c: Beide eingeplanten Einträge verschwinden sofort aus „Anstehend — ohne Block“');

  /* =========================================================================
     T2: Sync-Stabilität — kein Termin-Verdoppeln beim Drag & Drop + Live-Edit-Schutz
     ========================================================================= */
  /* T2a: Lokaler Termin -> Sync -> Drag & Drop bei verzögertem/fehlschlagendem DELETE -> Sync darf NICHT verdoppeln! */
  els['ap-title']=mkEl('ap-title',{value:'Zahnarzt Kontrolle'});
  els['ap-date']=mkEl('ap-date',{value:'2026-11-23'}); // Mo
  els['ap-end']=mkEl('ap-end',{value:''});
  els['ap-t0']=mkEl('ap-t0',{value:'09:15'});
  els['ap-t1']=mkEl('ap-t1',{value:'10:00'});
  els['ap-span']=mkEl('ap-span',{value:'1'});
  els['ap-ampel']=mkEl('ap-ampel',{value:'gelb'});
  els['ap-type']=mkEl('ap-type',{value:''});
  T.ACT.addAppt({day:'0',slot:'0'});
  const localAp=T.apsFor(W)['0|0'];
  ok(!!localAp&&localAp.title==='Zahnarzt Kontrolle','T2a: Lokaler Termin auf Mo Vormittag angelegt');

  await T.syncCycle();
  ok(!!collections[NC+CAL].files['theo-appt-'+W+'-0-0.ics'],'T2a: Lokaler Termin als VEVENT nach Nextcloud synchronisiert');

  failDeletes=true; // Simuliere langsames/fehlschlagendes DELETE während Drag & Drop!
  simulateDragDrop('appt:'+localAp.id,'w5s1'); // Sa Mittag
  await T.syncCycle();
  const zahnarztMatches1=T.allApptItems().filter(x=>x.ap&&x.ap.title==='Zahnarzt Kontrolle');
  ok(zahnarztMatches1.length===1&&zahnarztMatches1[0].ap.day===5&&zahnarztMatches1[0].ap.slot===1,
    'T2a: KEIN Verdoppeln trotz noch auf Nextcloud liegender Alt-Datei (exakt 1 Termin am neuen Slot Sa Mittag, gefunden: '+zahnarztMatches1.length+')');

  failDeletes=false;
  await T.syncCycle();
  ok(!collections[NC+CAL].files['theo-appt-'+W+'-0-0.ics']&&!!collections[NC+CAL].files['theo-appt-'+W+'-5-1.ics'],
    'T2a: Alte VEVENT-Datei wurde beim nächsten Sync sauber aufgeräumt, neue Datei liegt auf Sa Mittag');

  /* T2b: Nextcloud-Fremdtermin mit Nextcloud-XXXX.ics Dateinamen ohne gecachtes S.hrefs per Drag & Drop verschieben */
  collections[NC+CAL].files['Nextcloud-DRAG99.ics']=[
    'BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT',
    'UID:nc-drag-99','DTSTART:20261124T140000','DTEND:20261124T150000',
    'SUMMARY:Steuerberater Call','END:VEVENT','END:VCALENDAR'
  ].join('\r\n');
  await T.syncCycle();
  const ncMovedItem=T.allApptItems().find(x=>x.ap&&x.ap.remoteUid==='nc-drag-99');
  ok(!!ncMovedItem,'T2b: Fremdtermin (Nextcloud-DRAG99.ics) übernommen');
  T.SYNC.hrefs={}; // Kaltstart simulieren (kein href im Speicher)
  const repBefore=reportCalls;
  simulateDragDrop('appt:'+ncMovedItem.ap.id,'w6s0'); // So Vormittag (2026-11-29)
  await new Promise(r=>setTimeout(r,30));
  await T.syncCycle();
  const ncMatches=T.allApptItems().filter(x=>x.ap&&x.ap.remoteUid==='nc-drag-99');
  ok(reportCalls>repBefore&&ncMatches.length===1&&ncMatches[0].ap.day===6&&ncMatches[0].ap.slot===0&&/DTSTART:20261129T140000/.test(collections[NC+CAL].files['Nextcloud-DRAG99.ics']),
    'T2b: Fremdtermin ohne gecachtes href per CalDAV-REPORT auf Nextcloud aktualisiert und exakt 1× am Zieltag');

  /* T2c: Bereichs-Texte dürfen beim Tippen NICHT durch Hintergrund-Sync überschrieben werden */
  T.ui.route={view:'bereiche'};
  T.render();
  const areaInp=mkEl('area-inp',{tagName:'INPUT',value:'Arbeit & Fokus Strategie',dataset:{field:'areaName',id:'ar1'},_insideMain:true});
  areaInp.focus(); // Benutzer tippt gerade aktiv im Bereichs-Feld!
  __h.input({target:areaInp}); // noch kein blur/change!
  ok(S.areas[0].name==='Arbeit & Fokus Strategie','T2c: Bereichs-Name wird bereits beim Tippen (input) im State gesichert');

  const mainHtmlBeforeSync=els['main'].innerHTML='<!-- active-typing-dom -->';
  await T.syncCycle();
  ok(S.areas[0].name==='Arbeit & Fokus Strategie',
    'T2c: Hintergrund-Sync überschreibt den gerade editierten Bereichs-Namen NICHT mit dem alten Serverstand');
  ok(els['main'].innerHTML===mainHtmlBeforeSync&&T.ui.deferRender===true,
    'T2c: Fokus-Schutz verhindert Neu-Rendern von #main mitten im Tippen (kein Cursor-/Textverlust)');
  const allCapContent=Object.values(collections[NC+CAL].files).concat(Object.values(collections[NC+SUB].files)).join('\n');
  ok(allCapContent.indexOf('Arbeit & Fokus Strategie')>=0,
    'T2c: Der frisch getippte Bereichs-Text wurde direkt in die Server-Kapsel geschrieben');

  global.document.activeElement=global.document.body;
  __h.focusout({});
  await new Promise(r=>setTimeout(r,90));
  ok(T.ui.deferRender===false&&els['main'].innerHTML!==mainHtmlBeforeSync,
    'T2c: Nach Verlassen des Textfelds (focusout) wird das aufgeschobene Render sauber nachgeholt');

  /* =========================================================================
     T7 & T8: Dezentes „＋ Block dazu“ & kein Karten-/Ampel-Überlauf
     ========================================================================= */
  ok(/\.slot:hover \.slotAddBlk/.test(html)&&/@media\s*\(hover:none\),\(pointer:coarse\)[\s\S]*?\.slotAddBlk \.addLbl\{display:none\}/.test(html),
    'T7: CSS blendet „＋ Block dazu“ am PC erst bei Hover ein und nutzt auf Touch/Mobil einen dezenten 24×24-Eck-Button');
  /* Termin-Sheet bietet zusätzlich expliziten „＋ Block dazulegen“-Button für Mobile & Desktop */
  const curSaAp=T.apsFor(W)['5|1'];
  T.ACT.openAppt({id:curSaAp.id}); // Sa Mittag hat nur Termin, keinen Block
  ok(/data-act="openSlotW"/.test(ov.innerHTML)&&/Block dazulegen/.test(ov.innerHTML),
    'T7: Termin-Dialog bietet bei freiem Blockplatz direkt „＋ Block dazulegen“ (ideal auf dem Smartphone)');
  T.ACT.closeModal();

  /* Layout-Checks gegen Screenshot-Bug (Ampel-Punkt aus Karte, + Ampel Umbruch) */
  curSaAp.ampel=null;
  const saCell=T.slotCell(5,1,true,-1,false);
  ok(!/＋ Ampel/.test(saCell)&&/class="noampDot"/.test(saCell),
    'T8: Termin-Karte ohne Ampel nutzt kompakten Kreis (.noampDot) statt „＋ Ampel“-Text (kein kaputter Zeit-Umbruch mehr)');
  ok(/\.card\{[^}]*min-width:0;\s*max-width:100%/.test(html)&&/\.bttl\{[^}]*min-width:0;[^}]*overflow-wrap:anywhere/.test(html)&&/\.brow>\.dot,\.brow>\.noampDot\{[^}]*flex:none\}/.test(html),
    'T8: CSS begrenzt .slot/.card auf 100% Spaltenbreite, bricht lange Titel sauber um und hält Ampel-Punkte innerhalb der Karte');

  T.ui.route={view:'woche'};
  T.render();
  T.ui.route={view:'konfig'};
  T.render();
  ok(els['main'].innerHTML.length>500,'Vollständiges Render (Woche & Konfiguration) ohne Fehler');

  if(fail){console.error('\n✖ '+fail+' Fehler'); process.exit(1)}
  console.log('\n✔ SMOKE R13e GRÜN — alle Tests bestanden');
  process.exit(0);
})().catch(e=>{console.error('DRIVER-CRASH:',e); process.exit(2)});
