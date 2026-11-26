/* Smoke-Test R13f (0.13~ynh7):
   Alle 14 Anforderungen:
   1. Zurück zu Woche → Heute-Woche
   2. Mehrere kleine To-dos in einem Block bündeln (DnD + Offene zurücklegen + ICS-Roundtrip)
   3. Markdown & Zeilenumbrüche in der Eingangskiste (+ XSS-Schutz + Shift+Enter)
   4. Drag-&-Drop-Mülleimer oben links im Wochenraster (direkt löschen ohne Dialog)
   5. „Wiederholen“ im Block-Editor (+X Wochen & freie Slots nächste Woche)
   6. Monats-/Wochenauswahl (weekJump) behält gewählten Monat (kein 2026-06 → 2026-05 Rücksprung)
   7. Schnell-Link zur Konfig & direkt neuen Blocktyp anlegen beim Einfügen (sheetSlot)
   8. Mehrtägige Seminare schnell anlegen (sheetSeminar / seminarSave)
   9. Leere Phase bleibt in der Wochenansicht sichtbar & klickbar („Phase: offen“)
   10. Klick auf Termin in der Wochen-Terminliste springt zur Woche (+ ✎-Button rechts)
   11. Überlappende Phasen in der Jahresansicht mehrfarbig gestreift (CSS linear-gradient)
   12. Enter beim Termin-Editieren speichert und schließt das Fenster
   13. Vorlagen in Konfig leicht auffindbar + keine verwirrende 17–20h-Standardzeit auf Morgen-Blöcken
   14. Unterkategorien & gelernte Schnellvorschläge pro Blocktyp (z. B. Socializing → letzte 3 Menschen) */

const fs=require('fs');
const html=fs.readFileSync(__dirname+'/../conf/lebensrhythmus-prototyp.html','utf8');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const mainSrc=scripts.slice().sort((a,b)=>b.length-a.length)[0];

/* Minimal-DOM für Node */
const els={}, __h={};
function mkCls(){
  const s=new Set();
  return {
    add:(...c)=>c.forEach(x=>s.add(x)),
    remove:(...c)=>c.forEach(x=>s.delete(x)),
    toggle:(c,f)=>{if(f===undefined){if(s.has(c)){s.delete(c);return false}s.add(c);return true}if(f)s.add(c);else s.delete(c);return !!f},
    contains:c=>s.has(c)
  };
}
let activeEl=null;
function mkEl(id,extra){
  const o=Object.assign({
    id:id,value:'',checked:false,textContent:'', dataset:{}, style:{}, tagName:'INPUT', type:'text',
    selectionStart:0, classList:mkCls(),
    focus(){activeEl=o}, select(){}, setSelectionRange(){}, scrollIntoView(){},
    remove(){}, appendChild(){},
    querySelector(){return null}, querySelectorAll(){return []},
    contains(other){return other===o},
    closest(sel){
      if(sel==='[data-act]'&&o.dataset&&o.dataset.act)return o;
      if(sel==='[data-drag]'&&o.dataset&&o.dataset.drag)return o;
      if(sel==='[data-drop]'&&o.dataset&&o.dataset.drop)return o;
      if(sel==='#overlay'&&o._inOverlay)return els['q:#overlay'];
      return o._parent&&o._parent.closest?o._parent.closest(sel):null;
    }
  },extra||{});
  return o;
}
els['q:#main']=mkEl('main',{tagName:'DIV',innerHTML:''});
let lastDefaultSubmit=null;
const ov=mkEl('overlay',{tagName:'DIV',_html:''});
Object.defineProperty(ov,'innerHTML',{
  get(){return this._html},
  set(v){
    this._html=String(v||'');
    lastDefaultSubmit=null;
    const m=this._html.match(/<button[^>]*data-default-submit="1"[^>]*>/);
    if(m){
      const tag=m[0], ds={};
      for(const am of tag.matchAll(/data-([a-z0-9-]+)="([^"]*)"/gi)){
        const key=am[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
        ds[key]=am[2];
      }
      lastDefaultSubmit=mkEl('default-sub',{tagName:'BUTTON',dataset:ds,_inOverlay:true});
    }
  }
});
ov.querySelector=sel=>{
  if(sel==='[data-default-submit="1"]')return lastDefaultSubmit;
  return null;
};
els['q:#overlay']=ov;
els['q:#toast']=mkEl('toast',{tagName:'DIV'});
els['q:#nav']=mkEl('nav',{tagName:'NAV'});

const bodyCls=mkCls();
const doc={
  body:{classList:bodyCls,appendChild(){}},
  get activeElement(){return activeEl},
  querySelector:s=>els['q:'+s]||(els['q:'+s]=mkEl(s,{tagName:'DIV'})),
  querySelectorAll:()=>[],
  getElementById:id=>els[id]||null,
  createElement:t=>mkEl(t,{tagName:String(t).toUpperCase()}),
  addEventListener:(ev,fn)=>{__h[ev]=fn}
};
const store={};
global.window={scrollTo(){}};
global.document=doc;
global.localStorage={getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}};
Object.defineProperty(global,'navigator',{value:{clipboard:{writeText:async()=>{}}},configurable:true,writable:true});
global.Blob=function(){};
global.URL={createObjectURL:()=>'blob:x',revokeObjectURL:()=>{}};

const davCalls=[];
const davFiles={};
global.fetch=async function(url,opt){
  opt=opt||{};
  const m=(opt.method||'GET').toUpperCase();
  const u=String(url);
  if(u==='__theo_proxy__')return {ok:false,status:404,text:async()=>'',json:async()=>({})};
  davCalls.push({method:m,url:u,body:opt.body||''});
  if(m==='DELETE'){delete davFiles[u]; return {ok:true,status:204,text:async()=>''}}
  if(m==='PUT'){davFiles[u]=String(opt.body||''); return {ok:true,status:201,text:async()=>''}}
  if(m==='GET'&&davFiles[u])return {ok:true,status:200,text:async()=>davFiles[u]};
  return {ok:false,status:404,text:async()=>'Not Found'};
};

const expose='\nglobalThis.__T={S,ui,ACT,SYNC,wk,iso,parseISO,addDays,mondayOf,dayIdx,todayISO,blocksFor,apsFor,apptsInSlot,findAppt,findTodo,typeOf,normalizeType,renderMd,phaseBgStyle,slotTimeFitsSlot,typeSuggestions,blockItems,returnOpenFromBlock,orientBar,renderWeek,renderAgenda,renderYear,renderInbox,renderConfig,buildEvents,importICS,tombDead,render};';
new Function(mainSrc+expose)();
const T=globalThis.__T;
const S=T.S, ui=T.ui;

let fails=0;
function ok(cond,msg){
  if(cond)console.log('PASS — '+msg);
  else{console.error('FAIL — '+msg); fails++}
}
function simDragDrop(dragStr,dropStr,onDragStartCheck){
  const src=mkEl('src',{dataset:{drag:dragStr}});
  const dst=mkEl('dst',{dataset:{drop:dropStr}});
  let payload='';
  const dt={setData:(k,v)=>{payload=v},getData:()=>payload,effectAllowed:'',dropEffect:''};
  __h.dragstart({target:src,dataTransfer:dt});
  if(onDragStartCheck)onDragStartCheck();
  __h.dragover({target:dst,dataTransfer:dt,preventDefault(){}});
  __h.drop({target:dst,dataTransfer:dt,preventDefault(){}});
  __h.dragend({});
}

(async()=>{
  const realTodayW=T.iso(T.mondayOf(new Date()));

  /* =========================================================================
     1. Zurück zu Woche springt immer auf die Heute-Woche
     ========================================================================= */
  ui.anchor=T.parseISO('2027-08-02');
  ui.jumpMonth='2027-08';
  ok(T.wk()==='2027-08-02','T1: Woche zunächst auf 2027-08-02 verstellt');
  T.ACT.nav({v:'eingang'});
  ok(ui.route.view==='eingang','T1: Wechsel in Eingangskiste');
  T.ACT.nav({v:'woche'});
  ok(ui.route.view==='woche'&&T.wk()===realTodayW&&ui.jumpMonth===null,
    'T1: Rückkehr von Eingangskiste zu „Woche“ springt automatisch auf die aktuelle Heute-Woche');
  ui.anchor=T.parseISO('2028-03-06');
  T.ACT.nav({v:'jahr'});
  T.ACT.nav({v:'woche'});
  ok(T.wk()===realTodayW,'T1: Rückkehr von „Jahr“ zu „Woche“ springt ebenfalls auf die Heute-Woche');

  /* =========================================================================
     6. Monats-/Wochenauswahl (weekJump) behält gewählten Monat (2026-06 / 2026-05)
     ========================================================================= */
  __h.change({target:mkEl('wj',{value:'2026-06',dataset:{field:'weekJump'}})});
  const wkJunHtml=T.renderWeek();
  ok(T.wk()==='2026-06-01'&&/data-field="weekJump" value="2026-06"/.test(wkJunHtml),
    'T6: Eingabe 2026-06 bleibt im Feld auf „2026-06“ (kein UTC-Rücksprung auf 2026-05)');
  __h.change({target:mkEl('wj',{value:'2026-05',dataset:{field:'weekJump'}})});
  const wkMayHtml=T.renderWeek();
  ok(T.wk()==='2026-04-27'&&/data-field="weekJump" value="2026-05"/.test(wkMayHtml),
    'T6: Eingabe 2026-05 springt zur ersten Mai-Woche (Mo 27.4.) und hält im Feld stabil „2026-05“');
  T.ACT.weekThis();

  /* =========================================================================
     2. Mehrere kleine To-dos in einem Block bündeln + Offene zurücklegen
     ========================================================================= */
  const W=T.wk();
  S.areas=[{id:'ar1',name:'Alltag',emoji:'🏡',color:'#8FA88B'}];
  S.projects=[{id:'pr1',areaId:'ar1',name:'Haushalt & Orga',emoji:'🧺',note:'',views:{list:true,kanban:true},todos:[
    {id:'td_s1',title:'Paket zur Post bringen',done:false,kanban:'offen',due:'2026-11-28',planned:null},
    {id:'td_s2',title:'Glühbirne wechseln',done:false,kanban:'offen',due:'2026-11-28',planned:null},
    {id:'td_s3',title:'Blumen gießen',done:false,kanban:'offen',due:'2026-11-29',planned:null}
  ]}];
  S.tasks=[{id:'tk_s1',title:'Zahnarzt anrufen',done:false,due:'2026-11-28',planned:null}];

  simDragDrop('todo:pr1|td_s1','w1s0'); // Di Vormittag: 1. To-do
  simDragDrop('todo:pr1|td_s2','w1s0'); // Di Vormittag: 2. To-do drüberziehen -> Bündel!
  simDragDrop('task:tk_s1','w1s0');     // Di Vormittag: Einzelaufgabe drüberziehen -> 3er-Bündel!
  const bdl=T.blocksFor(W)['1|0'];
  ok(!!bdl&&bdl.kind==='bundle'&&T.blockItems(bdl).length===3,
    'T2a: Drag & Drop mehrerer kleiner To-dos/Aufgaben auf denselben Slot kombiniert sie zum 3er-To-do-Bündel');
  ok(S.projects[0].todos[0].planned.day===1&&S.projects[0].todos[1].planned.day===1&&S.tasks[0].planned.day===1,
    'T2a: Alle 3 gebündelten Aufgaben sind sauber mit dem gemeinsamen Block verknüpft');

  /* Zwei bestehende Aufgaben-Blöcke per Drag & Drop übereinanderlegen -> kombinieren! */
  simDragDrop('todo:pr1|td_s3','w2s0'); // Mi Vormittag
  simDragDrop('block:2|0','w1s0');      // Mi-Aufgabenblock auf Di-Bündel ziehen
  ok(!T.blocksFor(W)['2|0']&&T.blockItems(T.blocksFor(W)['1|0']).length===4&&S.projects[0].todos[2].planned.day===1,
    'T2b: Ziehen eines Aufgaben-Blocks über einen anderen kombiniert beide zu einem 4er-Bündel');

  /* ICS-Export/Import-Roundtrip des Multi-Todo-Blocks */
  const bdlIcs=T.buildEvents('main').map(e=>e.text).join('\r\n');
  ok(/X-LR-ITEMS:todo:td_s1\\;todo:td_s2\\;task:tk_s1\\;todo:td_s3/.test(bdlIcs),
    'T2c: Multi-Todo-Bündel wird im CalDAV-VEVENT (X-LR-ITEMS) verlustfrei serialisiert');

  /* 2 von 4 erledigen, dann „Nicht geschaffte zurücklegen“ */
  T.ACT.toggleTodoBox({id:'td_s1'},null,{target:{checked:true}});
  T.ACT.toggleTaskBox({id:'tk_s1'},null,{target:{checked:true}});
  ok(bdl.done===false,'T2d: Solange noch 2 von 4 Aufgaben offen sind, gilt das Bündel noch nicht als komplett erledigt');
  T.ACT.bundleReturnOpen({day:'1',slot:'0',w:W});
  ok(S.projects[0].todos[1].planned===null&&S.projects[0].todos[2].planned===null,
    'T2d: Nicht geschaffte To-dos gehen wieder zurück in die offenen To-dos (planned === null)');
  ok(!!T.blocksFor(W)['1|0']&&T.blocksFor(W)['1|0'].done===true&&T.blockItems(T.blocksFor(W)['1|0']).length===2,
    'T2d: Geschaffte Aufgaben bleiben als erledigt im Block dokumentiert');

  /* =========================================================================
     3. Markdown & Zeilenumbrüche in der Eingangskiste
     ========================================================================= */
  els['inb-inp']=mkEl('inb-inp',{tagName:'TEXTAREA',value:'# Projekt-Skizze\nErste Zeile\nZweite Zeile mit **Fokus** & *Ruhe* & `code`\n- Punkt 1\n- [x] Punkt 2\n<script>evil()</script>',dataset:{enter:'inbAdd'}});
  /* Shift+Enter im Textarea darf NICHT absenden */
  __h.keydown({key:'Enter',shiftKey:true,target:els['inb-inp'],preventDefault(){}});
  ok(S.inbox.length===0,'T3a: Shift+Enter im Eingangskisten-Feld erzeugt Zeilenumbruch statt vorzeitigem Absenden');
  /* Normales Enter legt ab */
  __h.keydown({key:'Enter',shiftKey:false,target:els['inb-inp'],preventDefault(){}});
  ok(S.inbox.length===1,'T3b: Enter im Eingangskisten-Feld legt den mehrzeiligen Markdown-Eintrag ab');
  const inbHtml=T.renderInbox();
  ok(/<h1>Projekt-Skizze<\/h1>/.test(inbHtml)&&/Erste Zeile<br>Zweite Zeile/.test(inbHtml)&&/<b>Fokus<\/b>/.test(inbHtml)&&/<i>Ruhe<\/i>/.test(inbHtml)&&/<code>code<\/code>/.test(inbHtml)&&/<ul><li>Punkt 1<\/li><li>☑ Punkt 2<\/li><\/ul>/.test(inbHtml)&&!/<script>evil/.test(inbHtml),
    'T3c: Eingangskiste rendert Überschriften, Zeilenumbrüche (<br>), Fett/Kursiv/Code, Listen & XSS-sicheres Escaping');

  /* =========================================================================
     4. Drag-&-Drop-Mülleimer oben links über Vormittag / Mittag / Abend
     ========================================================================= */
  const wkTrashHtml=T.renderWeek();
  ok(/id="drag-trash"[^>]*data-drop="trash"/.test(wkTrashHtml),'T4a: Mülleimer-Dropzone sitzt oben links im Wochenraster');
  T.blocksFor(W)['4|0']={id:'bl_trash',kind:'typ',typeId:'ty1',title:'Wegwerf-Block',ampel:'gruen',note:'',done:false};
  let trashVisibleDuringDrag=false;
  simDragDrop('block:4|0','trash',()=>{trashVisibleDuringDrag=bodyCls.contains('dragging-ev')});
  ok(trashVisibleDuringDrag&&!bodyCls.contains('dragging-ev')&&!T.blocksFor(W)['4|0']&&!ov.classList.contains('on'),
    'T4b: Ziehen blendet den Mülleimer ein (body.dragging-ev) und Drop löscht den Block sofort ohne Dialogfenster');

  S.settings.webdav={url:'https://cloud.example.de',user:'kai',pass:'app-pw',cal:'/remote.php/dav/calendars/kai/personal/'};
  const remUrl='https://cloud.example.de/remote.php/dav/calendars/kai/personal/ trash-uid.ics'.replace(' ','');
  davFiles[remUrl]='BEGIN:VCALENDAR\r\nEND:VCALENDAR';
  T.SYNC.hrefs['trash-uid']=remUrl;
  T.apsFor(W)['4|2']={id:'ap_trash',day:4,slot:2,title:'Abgesagtes Treffen',time:'19:00–20:00',remoteUid:'trash-uid',span:1};
  simDragDrop('appt:ap_trash','trash');
  await new Promise(r=>setTimeout(r,20));
  ok(!T.findAppt('ap_trash')&&T.tombDead('trash-uid')&&!davFiles[remUrl],
    'T4c: Auch ein Termin wird per Drag & Drop auf den Mülleimer sofort inkl. Nextcloud-DELETE gelöscht');

  /* =========================================================================
     5. „Wiederholen“ im Block-Editor (+X Wochen & freie Slots nächste Woche)
     ========================================================================= */
  T.blocksFor(W)['2|2']={id:'bl_kurs',kind:'typ',typeId:'ty2',title:'Töpferkurs',ampel:'gruen',note:'Schürze mitnehmen',done:false,span:1};
  T.ACT.openBlock({day:'2',slot:'2'});
  ok(/data-act="repeatBlock"/.test(ov.innerHTML)&&/data-act="repeatBlockPick"/.test(ov.innerHTML),
    'T5a: Block-Editor bietet Schnellwahl „🔁 Wiederholen“ (+X Wochen & freie Slots nächste Woche)');
  els['b-title']=mkEl('b-title',{value:'Töpferkurs Fortgeschritten'});
  els['b-note']=mkEl('b-note',{value:'Schürze mitnehmen'});
  els['b-span']=mkEl('b-span',{value:'1'});
  els['b-type']=mkEl('b-type',{value:'ty2'});
  T.ACT.repeatBlock({day:'2',slot:'2',w:W,n:'3'});
  const w1=T.iso(T.addDays(T.parseISO(W),7)), w2=T.iso(T.addDays(T.parseISO(W),14)), w3=T.iso(T.addDays(T.parseISO(W),21));
  ok(!!T.blocksFor(w1)['2|2']&&!!T.blocksFor(w2)['2|2']&&!!T.blocksFor(w3)['2|2']&&T.blocksFor(w3)['2|2'].title==='Töpferkurs Fortgeschritten',
    'T5b: „+3 Wochen“ übernimmt aktuelle Edits und legt den Kurs sauber in den nächsten 3 Wochen an');

  T.ACT.openBlock({day:'2',slot:'2'});
  T.ACT.repeatBlockPick({day:'2',slot:'2',w:W});
  T.ACT.repeatToggleSlot({k:'0|2',day:'2',slot:'2',w:W}); // Mo Abend nächste Woche zusätzlich wählen
  T.ACT.repeatToggleSlot({k:'4|2',day:'2',slot:'2',w:W}); // Fr Abend nächste Woche zusätzlich wählen
  T.ACT.repeatApplySlots({day:'2',slot:'2',w:W});
  ok(!!T.blocksFor(w1)['0|2']&&!!T.blocksFor(w1)['4|2']&&T.blocksFor(w1)['0|2'].title==='Töpferkurs Fortgeschritten',
    'T5c: Freie-Slots-Auswahl trägt den Block gezielt in die gewählten offenen Slots der nächsten Woche ein');

  /* =========================================================================
     7 & 14. Konfig-Link / Schnell-Blocktyp in sheetSlot + Unterkategorien / Vorschläge
     ========================================================================= */
  T.ACT.openSlot({day:'5',slot:'1'});
  ok(/data-act="goTypesConfig"/.test(ov.innerHTML)&&/data-act="quickAddTypeToggle"/.test(ov.innerHTML),
    'T7a: Einfüge-Dialog zeigt oben rechts „＋ Neuer Blocktyp“ und „⚙ Konfig“-Link');
  T.ACT.quickAddTypeToggle({day:'5',slot:'1'});
  els['qt-emo']=mkEl('qt-emo',{value:'🫂'});
  els['qt-name']=mkEl('qt-name',{value:'Socializing'});
  els['qt-ampel']=mkEl('qt-ampel',{value:'gruen'});
  els['qt-subs']=mkEl('qt-subs',{value:'Anna, Fanni'});
  els['qt-asappt']=mkEl('qt-asappt',{checked:false});
  els['f-span']=mkEl('f-span',{value:'0'});
  T.ACT.quickAddTypeSave({day:'5',slot:'1',use:'1'});
  const socType=S.types.find(t=>t.name==='Socializing');
  ok(!!socType&&socType.subs.length===2&&!!T.blocksFor(W)['5|1']&&T.blocksFor(W)['5|1'].typeId===socType.id,
    'T7b: Neuer Blocktyp „Socializing“ samt Unterkategorien direkt aus dem Einfüge-Dialog angelegt und eingesetzt');

  /* Automatisch gelernte Vorschläge aus bisherigen Blöcken desselben Typs */
  const prevW=T.iso(T.addDays(T.parseISO(W),-7));
  T.blocksFor(prevW)['5|2']={id:'bl_prev_m',kind:'typ',typeId:socType.id,title:'Markus',ampel:'gruen',note:'',done:true};
  const sugs=T.typeSuggestions(socType.id,4).map(x=>x.label);
  ok(sugs.includes('Anna')&&sugs.includes('Fanni')&&sugs.includes('Markus')&&!sugs.includes('Socializing'),
    'T14a: Blocktyp „Socializing“ schlägt sowohl feste Unterkategorien (Anna, Fanni) als auch gelernte letzte Personen (Markus) vor');
  T.ACT.openSlot({day:'6',slot:'1'});
  ok(/data-act="fillTypeSub"[^>]*data-sub="Anna"/.test(ov.innerHTML)&&/data-sub="Markus"/.test(ov.innerHTML),
    'T14b: Einfüge-Dialog zeigt die 3 Menschen direkt als 1-Klick-Unterkategorien unter „Socializing“ an');
  T.ACT.fillTypeSub({day:'6',slot:'1',tid:socType.id,sub:'Markus'});
  ok(T.blocksFor(W)['6|1'].title==='Markus','T14c: Klick auf Unterkategorie belegt den Block direkt mit „Markus“');

  T.ACT.goTypesConfig();
  ok(ui.route.view==='konfig'&&!ov.classList.contains('on')&&/id="cfg-types"/.test(els['q:#main'].innerHTML),
    'T7c: Klick auf „⚙ Konfig“ wechselt direkt in die Blocktypen-&-Vorlagen-Konfiguration');
  T.ACT.nav({v:'woche'});

  /* =========================================================================
     8. Mehrtägige Seminare schnell anlegen
     ========================================================================= */
  T.ACT.openSeminar({day:'0',slot:'0'});
  els['sem-title']=mkEl('sem-title',{value:'Methoden-Seminar'});
  els['sem-start']=mkEl('sem-start',{value:'2026-12-14'});
  els['sem-end']=mkEl('sem-end',{value:'2026-12-14'});
  T.ACT.semQuickDays({mode:'days',n:'3'});
  ok(els['sem-end'].value==='2026-12-16','T8a: Seminar-Schnellwahl „3 Tage“ setzt Enddatum automatisch auf +2 Tage');
  els['sem-scope']=mkEl('sem-scope',{value:'all'});
  els['sem-t0']=mkEl('sem-t0',{value:'09:00'});
  els['sem-t1']=mkEl('sem-t1',{value:'17:00'});
  els['sem-ampel']=mkEl('sem-ampel',{value:'orange'});
  els['sem-type']=mkEl('sem-type',{value:''});
  T.ACT.seminarSave({slot:'0'});
  const semW='2026-12-14';
  ok(T.apptsInSlot(semW,0,0).some(a=>a.title==='Methoden-Seminar'&&a.span===3&&a.time==='09:00–17:00'&&a.multiTotal===3)&&
     T.apptsInSlot(semW,1,0).some(a=>a.title==='Methoden-Seminar'&&a.span===3&&a.multiIdx===2)&&
     T.apptsInSlot(semW,2,0).some(a=>a.title==='Methoden-Seminar'&&a.span===3&&a.multiIdx===3),
    'T8b: Mehrtägiges Seminar belegt an allen 3 Tagen ganztägig (span=3, 09:00–17:00) die Slots und ist als Serie verknüpft');

  /* =========================================================================
     9. Leere Phase in der Wochenansicht sichtbar & klickbar
     ========================================================================= */
  S.phases=[];
  const obNoPhase=T.orientBar();
  ok(/data-act="addPhaseForWeek"/.test(obNoPhase)&&/Phase:\s*<i class="dim">offen<\/i>/.test(obNoPhase),
    'T9a: Ohne aktive Phase verschwindet der Phasen-Hinweis in der Woche nicht, sondern bleibt als „🍂 Phase: offen“ klickbar');
  T.ACT.addPhaseForWeek({date:W});
  ok(ov.classList.contains('on')&&ov.innerHTML.includes('id="ph-title"')&&ov.innerHTML.includes('value="'+W+'"'),
    'T9b: Klick auf „🍂 Phase: offen“ öffnet direkt den Phasen-Dialog für den aktuellen Zeitraum');
  T.ACT.closeModal();

  /* =========================================================================
     10. Klick auf Termin in der Wochen-Terminliste springt zur Woche (+ ✎ rechts)
     ========================================================================= */
  ui.agRange='spaeter';
  const agFuture=T.renderAgenda();
  ok(/class="agRow" data-act="jumpApptWeek" data-w="2026-12-14"/.test(agFuture)&&/data-act="openAppt"/.test(agFuture),
    'T10a: Terminzeile in „Später“ springt per Zeilenklick zur Woche und besitzt rechts den „✎“-Button zum Editieren');
  T.ACT.jumpApptWeek({w:'2026-12-14',day:'0'});
  ok(T.wk()==='2026-12-14'&&!ov.classList.contains('on'),
    'T10b: Klick auf den Termin springt direkt in dessen Kalenderwoche (2026-12-14), ohne das Edit-Fenster zu öffnen');
  T.ACT.weekThis();

  /* =========================================================================
     11. Überlappende Phasen in der Jahresansicht mehrfarbig gestreift
     ========================================================================= */
  ui.year=2026;
  S.phases=[
    {id:'ph_a',start:'2026-07-01',end:'2026-07-20',title:'Sommerprojekt',desc:'',color:'#E6B89C'},
    {id:'ph_b',start:'2026-07-10',end:'2026-07-25',title:'Familienbesuch',desc:'',color:'#9BC4BC'},
    {id:'ph_c',start:'2026-07-15',end:'2026-07-16',title:'Kurzretreat',desc:'',color:'#D9C589'}
  ];
  const yrHtml=T.renderYear();
  ok(/background:#E6B89C;[^>]*data-date="2026-07-05"/.test(yrHtml),
    'T11a: Einzelphase im Jahreskalender bleibt einfarbig');
  ok(/linear-gradient\(135deg,#E6B89C 0\.00% 50\.00%,#9BC4BC 50\.00% 100\.00%\);[^>]*data-date="2026-07-12"/.test(yrHtml),
    'T11b: 2 überlappende Phasen schneiden das Tagesquadrat in 2 farbige Streifen (0–50%, 50–100%)');
  ok(/linear-gradient\(135deg,#E6B89C 0\.00% 33\.33%,#9BC4BC 33\.33% 66\.67%,#D9C589 66\.67% 100\.00%\);[^>]*data-date="2026-07-15"/.test(yrHtml),
    'T11c: 3 überlappende Phasen schneiden das Tagesquadrat in 3 farbige Streifen (Drittelung)');

  /* =========================================================================
     12. Enter beim Editieren eines Termins speichert und schließt das Fenster
     ========================================================================= */
  T.apsFor(W)['3|1']={id:'ap_enter',day:3,slot:1,title:' Zahnarzt ',time:'15:00–16:00',t0:'15:00',t1:'16:00',span:1,src:'Manuell'};
  T.ACT.openAppt({id:'ap_enter'});
  ok(ov.classList.contains('on'),'T12a: Termin-Editor geöffnet');
  els['a-title']=mkEl('a-title',{tagName:'INPUT',value:'Zahnarzt Kontrolle'});
  els['a-date']=mkEl('a-date',{tagName:'INPUT',value:T.iso(T.addDays(T.parseISO(W),3))});
  els['a-slot']=mkEl('a-slot',{tagName:'SELECT',value:'1'});
  els['a-t0']=mkEl('a-t0',{tagName:'SELECT',value:'15:15'});
  els['a-t1']=mkEl('a-t1',{tagName:'SELECT',value:'16:00'});
  els['a-type']=mkEl('a-type',{tagName:'SELECT',value:''});
  els['a-fbnote']=mkEl('a-fbnote',{tagName:'INPUT',value:''});
  __h.keydown({key:'Enter',shiftKey:false,target:els['a-title'],preventDefault(){}});
  ok(!ov.classList.contains('on')&&T.findAppt('ap_enter').ap.title==='Zahnarzt Kontrolle'&&T.findAppt('ap_enter').ap.time==='15:15–16:00',
    'T12b: Drücken von Enter im Termin-Editor speichert alle Änderungen und schließt den Dialog sofort');

  /* =========================================================================
     13. Vorlagen in Konfig verständlich & keine 17–20h-Abendzeit auf Morgen-Blöcken
     ========================================================================= */
  const cfgHtml=T.renderConfig();
  ok(/data-to="cfg-types"/.test(cfgHtml)&&/Uhrzeit richtet sich automatisch nach Vormittag/.test(T. ACT ? (ui.tplOpen['ty1']=true, T.renderConfig()) : ''),
    'T13a: Konfiguration bietet Schnellnavigation zu „Blocktypen & Vorlagen“ und erklärt die automatische Tagesabschnitts-Zeit');
  const eveType={id:'ty_eve',name:'Abendroutine',emoji:'🌙',ampel:'gruen',defSpan:1,openEdit:false,defNote:'',defT0:'17:00',defT1:'20:00',subs:[]};
  S.types.push(eveType);
  els['f-span']=mkEl('f-span',{value:'0'});
  T.ACT.fillType({day:'0',slot:'0',tid:'ty_eve'}); // Morgens (Vormittag)!
  ok(!!T.blocksFor(W)['0|0']&&!T.blocksFor(W)['0|0'].t0,
    'T13b: Blocktyp mit 17:00–20:00 erhält beim Einsetzen am Morgen KEINE verwirrende 17–20-Uhr-Zeit, sondern nutzt das Vormittagsfenster');
  T.ACT.fillType({day:'0',slot:'2',tid:'ty_eve'}); // Abends!
  ok(!!T.blocksFor(W)['0|2']&&T.blocksFor(W)['0|2'].t0==='17:00'&&T.blocksFor(W)['0|2'].t1==='20:00',
    'T13c: Im passenden Abend-Slot (Slot 2) greift eine hinterlegte 17:00–20:00-Vorlagenzeit wie gewünscht');

  T.render();
  ok(true,'Vollständiges Render aller Ansichten ohne Fehler');

  console.log('\n'+(fails?'✖ '+fails+' FEHLER':'✔ SMOKE R13f GRÜN — alle 14 Feature-Bereiche bestanden'));
  process.exit(fails?1:0);
})().catch(e=>{console.error('SMOKE19-CRASH:',e); process.exit(2)});
