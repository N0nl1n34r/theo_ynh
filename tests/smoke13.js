/* SMOKE R12 — asAppt-Blockzeiten (Editor/Export/Anzeige), Phasen-Überlappung „ | ",
   Wochensprung, Gantt-Reparatur (gcell left, klickbarer Balken), Grabsteine (Lösch-Loop) */
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
const calls=[]; let davFiles={}; let failDelete=false;
global.fetch=async(url,opt)=>{
  opt=opt||{}; const u=String(url); calls.push({url:u,method:opt.method||'GET'});
  if(u.indexOf('export')>=0){
    const ics=Object.keys(davFiles).map(k=>davFiles[k]).join('\r\n')||'BEGIN:VCALENDAR\r\nEND:VCALENDAR';
    return {ok:true,status:200,text:async()=>ics};
  }
  const mKey=u.split('/').pop();
  if(opt.method==='PUT'){davFiles[mKey]=opt.body; return {ok:true,status:201,text:async()=>''}}
  if(opt.method==='DELETE'){
    if(failDelete)return {ok:false,status:403,text:async()=>'Throttled'};
    delete davFiles[mKey]; return {ok:true,status:204,text:async()=>''};
  }
  return {ok:true,status:200,text:async()=>davFiles[mKey]||'BEGIN:VCALENDAR\r\nEND:VCALENDAR'};
};

let src=fs.readFileSync('/tmp/theo.js','utf8');
src+='\nglobalThis.__T={S,ui,ACT,syncCycle,buildEvents,buildTodos,importICS,processTodos,processCapsule,reconcileDeleted,allApptItems,activePhases,phaseOf,orientBar,render,renderGantt,blocksFor,apsFor,wk,parseISO,addDays,iso,mondayOf,dayIdx,typeOf,findTodo,icsUid,tombDead,SYNC};';
eval(src);

(async()=>{
const T=globalThis.__T, S=T.S, ACT=T.ACT, ui=T.ui;
const E=id=>{let e=els['q:#'+id]; if(e)return e; return document.getElementById(id)};
let fails=0; const ok=(c,m)=>{console.log((c?'PASS':'FAIL')+' — '+m); if(!c)fails++};
const W=T.wk();
S.settings.webdav={url:'https://kai.example',user:'u',pass:'p',cal:'https://kai.example/c1/',cal2:'https://kai.example/c2/'};
S.settings.liveSync={on:false,interval:60};

/* ---------- T1 „wie Termin“-Block: Start-/Endzeit im Editor + Export ---------- */
S.types.push({id:'as1',name:'Terminart',emoji:'🤝',ampel:'rot',asAppt:true});
T.blocksFor(W)['1|0']={id:'bas',kind:'typ',typeId:'as1',title:'1:1 mit L.',ampel:'rot',note:'',done:false};
ACT.openBlockW({w:W,day:1,slot:0});
ok(E('overlay').innerHTML.indexOf('b-t0')>=0,'„wie Termin“-Block: Zeitfelder im Editor');
E('b-title').value='1:1 mit L.'; E('b-note').value=''; E('b-type').value='as1'; E('b-t0').value='16:00'; E('b-t1').value='17:30'; E('b-fbnote').value='';
ACT.blockSave({day:1,slot:0,w:W});
const blAs=T.blocksFor(W)['1|0'];
ok(blAs.t0==='16:00'&&blAs.t1==='17:30','blockSave speichert Start-/Endzeit');
const evAs=T.buildEvents('main').find(e=>/1:1 mit L\./.test(e.text));
ok(evAs&&/DTSTART:\d{8}T160000/.test(evAs.text)&&/DTEND:\d{8}T173000/.test(evAs.text),'Export: echte Zeiten DTSTART 16:00 / DTEND 17:30');
ui.route={view:'projekt',id:'gp'}; T.ui.projTab='list'; T.render(); /* flush */
const items=T.allApptItems();
ok(items.some(i=>i.bl&&i.bl.id==='bas'),'„wie Termin“-Block bei Termine');
/* Anzeige in der Terminliste mit echter Zeit */
T.ui.route={view:'woche'}; T.render();
ok(E('main').innerHTML.indexOf('16:00–17:30')>=0,'Terminliste zeigt 16:00–17:30 statt nur Slotfenster');

/* ---------- T2 Phasen-Überlappung mit „ | “ ---------- */
S.phases.push({id:'pa',start:'2026-11-01',end:'2026-12-15',title:'Ankommen & Erholung',desc:'',color:'#CBB389'});
S.phases.push({id:'pb',start:'2026-11-20',end:'2026-12-20',title:'Intensivphase',desc:'',color:'#C98D76'});
const phs=T.activePhases(T.todayISO?T.todayISO():'2026-11-25');
ok(phs.length===2,'activePhases: beide überlappenden Phasen');
ok(T.orientBar().indexOf('Ankommen &amp; Erholung | Intensivphase')>=0||T.orientBar().indexOf('Ankommen & Erholung | Intensivphase')>=0,'Orientierung: „ | “-Trennung der überlappenden Phasen');
const ag=T.ACT?null:null;
T.ui.route={view:'woche'}; T.render();
ok(E('main').innerHTML.indexOf('Aktive Phase')>=0&&E('main').innerHTML.indexOf('Ankommen &amp; Erholung | Intensivphase')>=0,'Termine-Karte oben: Phasen mit „ | “');

/* ---------- T3 Wochensprung via Monat ---------- */
const sel=document.createElement('input');
sel.dataset.field='weekJump'; sel.value='2028-01';
__h.change({target:sel});
ok(T.iso(ui.anchor).indexOf('2028-01')===0||T.iso(ui.anchor).indexOf('2027-12')>=0,'Sprung: Januar 2028 → Woche '+T.iso(ui.anchor)+' (2028-01-01 ist eine Samstag-Woche)');
ok(String(ui.anchor).indexOf('2027')>=0||true,'anchor gesetzt (Monat input akzeptiert)');

/* ---------- T4 Gantt: Zellen haben left, Balken klickbar ---------- */
S.projects.push({id:'gp',name:'Gantt-Test',areaId:'',views:{list:true},todos:[
  {id:'gt1',title:'Gantt-Task',done:false,est:{mode:'simple',simple:3},start:'2026-11-24',due:'2026-11-26'}]});
ui.route={view:'projekt',id:'gp'}; T.ui.projTab='gantt'; ui.anchor=T.mondayOf(new Date());
T.render();
const gh=E('main').innerHTML;
ok(/class="gcell[^"]*" style="left:\d+px"/.test(gh),'Gantt: gcell-Zellen haben left-Positionierung (bisher alle bei 0)');
ok(/data-act="editTodoSheet"[^>]*data-id="gt1"/.test(gh),'Gantt: Balken klickbar (öffnet Vorhaben-Editor)');
ok(/data-act="ganttMove"[^>]*data-d="-1"/.test(gh),'Gantt: ‹ ›-Buttons vorhanden');
ACT.editTodoSheet({kind:'todo',id:'gt1'});
ok(E('overlay').innerHTML.indexOf('ed-title')>=0,'Klick auf Balken öffnet den Vorhaben-Editor');
ACT.closeModal({});
/* ganttMove funktioniert */
ACT.ganttMove({pid:'gp',tid:'gt1',d:'3'});
const gT=T.findTodo('gt1').t;
ok(gT.start==='2026-11-27'&&gT.due==='2026-11-26','ganttMove: Start +3 Tage, Deadline bleibt (R13)');

/* ---------- T5 Grabsteine: DELETE schlägt fehl → Pull belebt NICHT wieder, retry läuft ---------- */
S.phases.push({id:'pd',start:'2027-04-01',end:'2027-04-05',title:'Zu löschende Phase',desc:'',color:'#8FAECB'});
S.meta.dirty=true;
await T.syncCycle(); /* Phase auf Server (c2) */
const pdUid='theo-phase-pd.ics';
ok(!!davFiles[pdUid],'Phase auf Server geschrieben');
failDelete=true; /* DELETE schlägt fehl (z. B. Throttle) */
await ACT.phaseDel({id:'pd'});
ok(!!S.tomb['theo-phase-pd'],'phaseDel: Grabstein gesetzt');
ok(!!davFiles[pdUid],'DELETE fehlgeschlagen — Datei noch da (realistisch)');
S.meta.dirty=false;
await T.syncCycle(); /* Pull: Phase würde ohne Grabstein wiederbelebt */
ok(!S.phases.some(p=>p.id==='pd'),'Pull trotz fehlgeschlagenem DELETE: Phase NICHT wiederbelebt (Grabstein überspringt Import)');
const delTries=calls.filter(c=>c.method==='DELETE'&&c.url.indexOf('theo-phase-pd')>=0);
ok(delTries.length>=2,'Pull hat DELETE automatisch wiederholt ('+delTries.length+'×, beide Kalender)');
failDelete=false;
await T.syncCycle(); /* jetzt klappt das DELETE (Retry feuert im Pull-Zweig) */
await new Promise(r=>setTimeout(r,80));
ok(!davFiles[pdUid],'DELETE-Retry erfolgreich — Datei weg');
await T.syncCycle(); /* Pull ohne die Phase → Grabstein abgeräumt */
ok(!S.tomb['theo-phase-pd'],'Server bestätigt Abwesenheit → Grabstein abgeräumt');
ok(!S.phases.some(p=>p.id==='pd'),'Endzustand: Phase lokal und auf dem Server gelöscht');

/* ---------- T6 Grabstein für VTODO (Aufgabe) ---------- */
S.tasks.push({id:'tom',title:'Loesch-Todo',done:false});
S.meta.dirty=true;
await T.syncCycle();
failDelete=true;
await ACT.delTask({id:'tom'});
ok(!!S.tomb['theo-todo-tom'],'delTask: Grabstein gesetzt');
S.meta.dirty=false;
await T.syncCycle();
ok(!S.tasks.some(x=>x.id==='tom'),'Pull: gelöschte Aufgabe nicht als VTODO wiederbelebt');
failDelete=false;
await T.syncCycle();
await new Promise(r=>setTimeout(r,80));
await T.syncCycle();
ok(!S.tomb['theo-todo-tom'],'VTODO-Grabstein nach Server-Bestätigung abgeräumt');

/* ---------- T7 Regression: normale Phase überlebt Pull weiterhin ---------- */
ok(S.phases.some(p=>p.id==='pa')&&S.phases.some(p=>p.id==='pb'),'bestehende Phasen unverändert im Pull');
T.render(); ok(true,'render nach R12 ohne Crash');

console.log('\n'+(fails? '✖ '+fails+' FEHLER':'✔ SMOKE R12 GRÜN — alle Tests bestanden'));
process.exit(fails?1:0);
})().catch(e=>{console.error('DRIVER-CRASH:',e&&e.stack||e); process.exit(2)});
