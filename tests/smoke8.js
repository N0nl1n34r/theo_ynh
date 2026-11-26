/* SMOKE R8 — Demo-Entfernung (v4), seedFrom-Migration, VTODO-Sync (Export/Pull/Import),
   Theo-Kapsel (VJOURNAL, Escaping, Adopt), Render-Smoke mit leerem State */
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

let src=fs.readFileSync('/tmp/theo.js','utf8');
src+='\nglobalThis.__T={S,ui,ACT,buildTodos,todoICS,processTodos,processCapsule,adoptCapsule,capsuleJson,capsuleICS,CAP_UID,icsEsc,icsUnesc,icsUid,seedFrom,kanOf,findTodo,SYNC,render,parseICSAll,parseICS};';
eval(src);
const T=globalThis.__T, S=T.S;
let fails=0; const ok=(c,m)=>{console.log((c?'PASS':'FAIL')+' — '+m); if(!c)fails++};

/* ---------- T1 Demo-Daten entfernt ---------- */
ok(S.meta.v===4,'State-Version 4');
ok(S.areas.length===0&&S.projects.length===0&&S.tasks.length===0&&S.inbox.length===0,'leer: keine Bereiche/Projekte/To-dos/Kiste');
ok(S.phases.length===0&&Object.values(S.blocks).every(b=>Object.keys(b).length===0)&&Object.values(S.appts).every(b=>Object.keys(b).length===0)&&Object.keys(S.mit).length===0,'leer: keine Phasen/Blöcke/Termine/MITs (leere Wochen-Buckets von render zählen nicht)');
ok(Object.keys(S.motto).length===0,'leer: kein Demo-Jahresmotto');
ok(S.types.length===7,'Blocktypen-Vokabular bleibt (Systemkonfiguration)');
const sf=T.seedFrom({settings:{webdav:{url:'https://kai.example',user:'denis',pass:'apw',cal:'https://kai.example/c/'}}});
ok(sf.areas.length===0&&sf.settings.webdav.url==='https://kai.example'&&sf.settings.webdav.user==='denis','seedFrom: leere Struktur, Verbindungseinstellungen bleiben erhalten');

/* ---------- T2 VTODO-Export ---------- */
S.tasks.push({id:'zz-k1',title:'Steuer abgeben',done:false,due:'2026-12-01',firstStep:'Unterlagen suchen',est:{mode:'pert',to:1,tm:2,tp:5}});
S.tasks.push({id:'zz-k2',title:'Rückruf erledigt',done:true});
const tds=T.buildTodos();
const t1=tds.find(x=>x.uid==='theo-todo-zz-k1@theo-app'), t2=tds.find(x=>x.uid==='theo-todo-zz-k2@theo-app');
ok(!!t1&&t1.text.indexOf('SUMMARY:Steuer abgeben')>=0,'VTODO: SUMMARY');
ok(!!t1&&/DUE;VALUE=DATE:20261201/.test(t1.text),'VTODO: DUE VALUE=DATE');
ok(!!t1&&/STATUS:NEEDS-ACTION/.test(t1.text)&&/X-LR-KAN:offen/.test(t1.text),'VTODO: STATUS + X-LR-KAN (Kanban-Spalte)');
ok(!!t1&&/X-LR-EST:PERT,1,2,5/.test(t1.text)&&/DESCRIPTION:Erster Schritt: Unterlagen suchen/.test(t1.text),'VTODO: PERT-Schätzung + Erster Schritt als DESCRIPTION');
ok(!!t2&&/STATUS:COMPLETED/.test(t2.text)&&/PERCENT-COMPLETE:100/.test(t2.text),'VTODO: erledigt → STATUS COMPLETED + PERCENT 100');

/* ---------- T3 VTODO-Pull: eigenes Update ---------- */
const ourTxt=['BEGIN:VCALENDAR','BEGIN:VTODO','UID:theo-todo-zz-k1@theo-app','SUMMARY:Steuer 2025 abgeben','DUE;VALUE=DATE:20261215','STATUS:NEEDS-ACTION','X-LR-KAN:arbeit','X-LR-EST:SIMPLE,2','DESCRIPTION:Erster Schritt: Ordner suchen','END:VTODO','END:VCALENDAR'].join('\r\n');
const r1=T.processTodos(ourTxt);
const k1=S.tasks.find(x=>x.id==='zz-k1');
ok(r1.updated===1&&k1.title==='Steuer 2025 abgeben'&&k1.due==='2026-12-15','Pull eigenes VTODO: Titel+Deadline übernommen');
ok(k1.kanban==='arbeit'&&k1.done===false&&k1.est.mode==='simple'&&k1.est.simple===2&&k1.firstStep==='Ordner suchen','Pull eigenes VTODO: Kanban-Spalte, Schätzung, Erster Schritt');

/* ---------- T4 VTODO-Pull: fremde Aufgabe importiert, gelöschte nicht wiederbelebt ---------- */
const before=S.tasks.length;
const forTxt=['BEGIN:VCALENDAR','BEGIN:VTODO','UID:ext-todo-1@otherclient','SUMMARY:Zins\\, Rate prüfen','DUE;VALUE=DATE:20270115','STATUS:COMPLETED','END:VTODO','BEGIN:VTODO','UID:theo-todo-zz-gone@theo-app','SUMMARY:Wiederbelebung?','END:VTODO','END:VCALENDAR'].join('\r\n');
const r2=T.processTodos(forTxt);
const imp=S.tasks.find(x=>x.remoteUid==='ext-todo-1@otherclient');
ok(r2.imported===1&&!!imp&&imp.title==='Zins, Rate prüfen','fremdes VTODO → Aufgabe importiert (Komma-Escaping aufgelöst)');
ok(imp.done===true&&imp.kanban==='fertig'&&imp.due==='2027-01-15','fremdes VTODO: STATUS COMPLETED → erledigt, DUE geparst');
ok(!S.tasks.some(x=>x.remoteUid==='theo-todo-zz-gone@theo-app'),'eigenes (lokal gelöschtes) VTODO wird nicht wiederbelebt');
ok(S.tasks.length===before+1,'nur die fremde Aufgabe kam dazu');

/* ---------- T5 Kapsel: Escaping-Roundtrip ---------- */
const tricky={a:'Komma, Semikolon; Backslash \\ und Zeile\nzwei'};
const esc=T.icsEsc(JSON.stringify(tricky));
ok(JSON.stringify(JSON.parse(T.icsUnesc(esc)))===JSON.stringify(tricky),'icsEsc/icsUnesc: JSON-Roundtrip mit , ; \\ \\n');

/* ---------- T6 Kapsel: Push-Format + Adopt (neuer/alter TS) ---------- */
S.areas.push({id:'zz-a1',name:'Werkstatt',color:'#6FA8A0',emoji:'🛠️'});
S.projects.push({id:'zz-p1',areaId:'zz-a1',name:'Umbau',emoji:'📐',views:{list:true,kanban:true},todos:[{id:'zz-pt1',title:'Regal bauen',done:false,kanban:'offen'}]});
S.inbox=[{id:'zz-i1',kind:'gedanke',text:'Anruf beim Amt; Zins, Rate',ts:'heute'}];
S.motto={'2027':'Ruhig wachsen'};
S.meta.pulled=true; /* etabliertes Gerät: LWW wie gehabt */
S.capsuleTs=5000;
const cap1=T.capsuleJson(); const capTxt=T.capsuleICS(cap1);
ok(/BEGIN:VJOURNAL/.test(capTxt)&&/UID:theo-state@theo-app/.test(capTxt)&&/CATEGORIES:LR-STATE/.test(capTxt),'Kapsel: VJOURNAL mit UID + LR-STATE');
ok(/X-LR-TS:5000/.test(capTxt)&&capTxt.indexOf('X-LR-STATE:')>=0,'Kapsel: Zeitstempel + Zustand');
ok(!/Zins, Rate/.test(capTxt)&&/Zins\\, Rate/.test(capTxt),'Kapsel: JSON-Kommas im Kalendertext sauber escaped');
const cpOld=T.processCapsule(capTxt);
ok(cpOld.adopted===false,'Kapsel: gleicher/älterer TS → nichts übernommen (kein Ping-Pong)');
const remote=JSON.parse(JSON.stringify(cap1));
remote.ts=9999; remote.motto={'2027':'Neu vom anderen Gerät'}; remote.inbox=[{id:'zz-i2',kind:'idee',text:'Vom Laptop',ts:'Di'}]; remote.areas=[{id:'zz-a2',name:'Anderes Gerät',color:'#CBB389',emoji:'💻'}];
const cpNew=T.processCapsule(T.capsuleICS(remote));
ok(cpNew.adopted===true&&S.motto['2027']==='Neu vom anderen Gerät'&&S.inbox[0].text==='Vom Laptop','Kapsel: neuerer TS → Motto/Kiste übernommen (Multi-Gerät)');
ok(S.areas.length===1&&S.areas[0].name==='Anderes Gerät','Kapsel: Bereiche übernommen');
ok(S.projects.length===1&&S.projects[0].id==='zz-p1'&&S.projects[0].todos.length===1&&S.projects[0].todos[0].id==='zz-pt1','Kapsel: Projekt-Metadaten übernommen, lokale To-dos bleiben (die leben als VTODO)');
ok(S.types.length===7&&S.settings.slotTimes['0'].s==='09:00','Kapsel: Typen/Einstellungen im Transportformat');
ok(T.SYNC.capJson===null,'SYNC.capJson initial null → erste Kapsel wird immer geschrieben');

/* ---------- T7 Render-Smoke mit leerem State und neuem Inhalt ---------- */
S.capsuleTs=10000;
T.render(); ok(true,'render (Woche, leer) ohne Crash');
T.ui.route={view:'jahr'}; T.render(); ok(true,'render (Jahr, ohne Phasen) ohne Crash');
T.ui.route={view:'projekte'}; T.render(); ok(true,'render (Projekte, leer) ohne Crash');
T.ui.route={view:'kiste'}; T.render(); ok(true,'render (Kiste) ohne Crash');
T.ui.route={view:'projekte'}; T.ui.projTab='kanban'; T.render(); ok(true,'render (Kanban) ohne Crash');
T.ui.projTab='gantt'; T.render(); ok(true,'render (Gantt, ohne Schätzungen) ohne Crash');

console.log('\n'+(fails? '✖ '+fails+' FEHLER':'✔ SMOKE R8 GRÜN — alle Tests bestanden'));
process.exit(fails?1:0);
