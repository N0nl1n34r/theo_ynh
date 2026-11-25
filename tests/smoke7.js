/* SMOKE R7 — buildEvents-Split/TRANSP/remoteUid-Skip, classifyRemote, processRemote,
   mirrorICS, KCOLS/kanOf/setKan, estDays/fmtEst/apTimeStr, Konverter, Gantt-Move, edSave, kanState */
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

let src=fs.readFileSync('/tmp/theo.js','utf8');
src+='\nglobalThis.__T={S,ui,ACT,buildEvents,processRemote,classifyRemote,mirrorICS,kanOf,setKan,KCOLS,estDays,fmtEst,apTimeStr,findTodo,slotPickerSheet,wk,apsFor,blocksFor,render};';
eval(src);
const T=globalThis.__T, S=T.S, ACT=T.ACT;
const E=id=>document.getElementById(id);
let fails=0; const ok=(c,m)=>{console.log((c?'PASS':'FAIL')+' — '+m); if(!c)fails++};
/* Demo-State hat feste IDs t1..t3 — alle Test-IDs mit zz- präfixen, Kollisionen ausgeschlossen */
const P1ID='zz-proj-1', P2ID='zz-proj-2';

/* ---------- T1 buildEvents-Split ---------- */
const W=T.wk();
T.blocksFor(W)['0|0']={id:'zz-b1',kind:'typ',typeId:null,title:'Tiefenarbeit',ampel:'rot',note:'',done:false};
T.apsFor(W)['1|1']={id:'zz-a1',day:1,slot:1,title:'Zahnarzt',time:'14:00–15:30',ampel:null,src:'Manuell',areaId:null,span:1,typeId:null,t0:'14:00',t1:'15:30'};
T.apsFor(W)['2|0']={id:'zz-a2',day:2,slot:0,title:'Fremd Original',time:'10:00',ampel:null,src:'Kalender',areaId:null,span:1,typeId:null,remoteUid:'remote-123'};
S.mit['2026-11-25']={text:'Wichtigstes Ding',done:false};
S.phases=[{id:'zz-p1',start:'2026-12-21',end:'2026-12-27',title:'Erholung',desc:'',color:'#7CA982'}];
const main=T.buildEvents('main'), ph=T.buildEvents('phases');
const allMain=main.map(e=>e.text).join('\n');
ok(main.length>=3,'main: Block+Termin+MIT exportiert ('+main.length+' Events)');
ok(!allMain.includes('LR-PHASE'),'main: keine Phasen-Events');
ok(!allMain.includes('remote-123'),'main: Termin mit remoteUid übersprungen (Original lebt auf Server)');
ok(ph.length===1,'phases: genau 1 Phasen-Event');
ok(/TRANSP:TRANSPARENT/.test(ph[0].text),'Phase: TRANSP:TRANSPARENT (nicht busy)');
ok(/VALUE=DATE/.test(ph[0].text),'Phase: VALUE=DATE');
const a1ev=main.find(e=>/Zahnarzt/.test(e.text));
ok(a1ev&&/DTSTART:\d{8}T140000/.test(a1ev.text)&&/DTEND:\d{8}T153000/.test(a1ev.text),'Termin: echte Zeiten DTSTART 14:00 / DTEND 15:30 im Export');
delete T.apsFor(W)['2|0']; /* a2-Seed freigeben für T3 */

/* ---------- T2 classifyRemote ---------- */
const txtMir='BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:zz-mir-1\nDTSTART:20261126T090000\nDTEND:20261126T100000\nSUMMARY:Theo Spiegel\nCATEGORIES:LR-MIRROR\nEND:VEVENT\nEND:VCALENDAR';
const txtFor='BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:zz-f-1\nDTSTART:20261126T090000\nDTEND:20261126T100000\nSUMMARY:Externes Meeting\nEND:VEVENT\nEND:VCALENDAR';
const c1=T.classifyRemote(txtMir), c2=T.classifyRemote(txtFor);
ok(c1.length===0,'classifyRemote: LR-MIRROR-Spiegel übersprungen');
ok(c2.length===1&&c2[0].uid==='zz-f-1'&&c2[0].title==='Externes Meeting','classifyRemote: fremdes Event erkannt');
ok(c2[0].date==='2026-11-26'&&c2[0].time==='09:00–10:00','classifyRemote: Datum+Zeit geparst');

/* ---------- T3 processRemote: Auto-Einsortierung + Fallback ---------- */
const txt2='BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:zz-f-2\nDTSTART:20261126T093000\nDTEND:20261126T103000\nSUMMARY:Automatisch einsortieren\nEND:VEVENT\nEND:VCALENDAR';
let r1=T.processRemote(txt2);
ok(r1.placed===1&&r1.queued===0,'processRemote: 1 automatisch einsortiert');
const mF2=S.mapped['zz-f-2']||{};
const FD=mF2.day!==undefined?mF2.day:3; /* reale Tagesnummer des fremden Termins */
const apF2=T.apsFor(mF2.w||W)[FD+'|'+(mF2.slot!==undefined?mF2.slot:0)];
ok(apF2&&apF2.remoteUid==='zz-f-2'&&apF2.t0==='09:30'&&apF2.t1==='10:30','processRemote: Appt mit remoteUid + echten Zeiten t0/t1');
ok(apF2&&apF2.slot===0,'processRemote: bevorzugter Slot (09:30 → Morgens)');
let r1b=T.processRemote(txt2);
ok(r1b.placed===0&&r1b.queued===0,'processRemote: mapped verhindert Doppelt-Vorschlag');
T.apsFor(W)[FD+'|1']={id:'zz-x1',day:FD,slot:1,title:'Belegt 1',time:'—',ampel:null,src:'Manuell',span:1};
T.apsFor(W)[FD+'|2']={id:'zz-x2',day:FD,slot:2,title:'Belegt 2',time:'—',ampel:null,src:'Manuell',span:1};
const txt3='BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:zz-f-3\nDTSTART;VALUE=DATE:20261126\nSUMMARY:Ganztags fremd\nEND:VEVENT\nEND:VCALENDAR';
let r2=T.processRemote(txt3);
/* R9: Zuordnung scheitert nie — voller Tag → geteilter Slot (Stack) statt Warteschlange */
ok(r2.placed===1&&r2.queued===0,'processRemote: kein freier Slot → teilt sich einen Slot (R9: nie scheitern)');
const mF3=S.mapped['zz-f-3']||{};
ok(!!mF3.w,'processRemote R9: mapped-Eintrag gesetzt');

/* ---------- T4 mirrorICS ---------- */
const mir=T.mirrorICS({remoteUid:'zz-f-2',title:'Automatisch einsortieren',slot:0,span:1,t0:'09:30',t1:'10:30',time:'09:30–10:30'},'2026-11-27');
ok(/UID:zz-f-2/.test(mir)&&/DTSTART:20261127T093000/.test(mir)&&/DTEND:20261127T103000/.test(mir),'mirrorICS: gleiche UID + echte Zeiten für Writeback');
ok(/TRANSP:OPAQUE/.test(mir)&&/CATEGORIES:LR-MIRROR/.test(mir),'mirrorICS: LR-MIRROR-Kategorie (beim Pull übersprungen)');

/* ---------- T5 KCOLS/kanOf/setKan ---------- */
ok(T.KCOLS.map(k=>k[0]).join(',')==='offen,arbeit,pending,backlog,fertig','KCOLS: 5 Spalten inkl. Pending (delegiert) + Backlog');
S.projects.push({id:P1ID,name:'P',emoji:'🧩',areaId:S.areas[0]?S.areas[0].id:'a1',views:{kanban:true},todos:[
  {id:'zz-t1',title:'A',done:false},
  {id:'zz-t2',title:'B',done:false,delegated:'Tom',kanban:'pending'},
  {id:'zz-t3',title:'C',done:true}]});
const P1=S.projects.find(p=>p.id===P1ID);
ok(T.kanOf(P1.todos[0])==='offen','kanOf: default offen');
ok(T.kanOf(P1.todos[1])==='pending','kanOf: Pending (delegiert)');
ok(T.kanOf(P1.todos[2])==='fertig','kanOf: done → fertig');
T.setKan('zz-t1','arbeit'); ok(P1.todos[0].kanban==='arbeit','setKan: Status gesetzt (Liste↔Kanban gekoppelt)');
T.setKan('zz-t1','fertig'); ok(P1.todos[0].done===true,'setKan fertig → done=true (Kopplung)');
T.setKan('zz-t1','offen'); ok(P1.todos[0].done===false,'setKan zurück → done=false');
T.setKan('zz-t2','backlog'); ok(P1.todos[1].kanban==='backlog','setKan: Backlog erreichbar');

/* ---------- T6 estDays/fmtEst ---------- */
ok(T.estDays({est:{mode:'simple',simple:2}})===2,'estDays: einfache Zahl 2 → 2 Tage');
const pert=T.estDays({est:{mode:'pert',to:1,tm:2,tp:5}});
ok(Math.abs(pert-(1+8+5)/6)<1e-9,'estDays: PERT (1+4·2+5)/6 = 2,333');
ok(T.fmtEst({est:{mode:'pert',to:1,tm:2,tp:5}}).includes('2.3')&&T.fmtEst({est:{mode:'pert',to:1,tm:2,tp:5}}).includes('PERT'),'fmtEst: ≈2.3 T (PERT)');
ok(T.estDays({est:null})===0,'estDays: ohne Schätzung → 0 (kein Balken, kein Chip)');

/* ---------- T7 apTimeStr ---------- */
ok(T.apTimeStr('10:00','11:30')==='10:00–11:30'&&T.apTimeStr('10:00','')==='10:00'&&T.apTimeStr('','')==='—','apTimeStr: optional von–bis');

/* ---------- T8 Eingangskisten-Konverter ---------- */
S.inbox=[{id:'zz-i1',text:'Steuer erledigen',kind:'gedanke'}];
ACT.inbConvert({id:'zz-i1',target:'task'});
ok(T.ui.inbConv&&T.ui.inbConv.target==='task','Konverter: Fenster öffnet mit Ziel Aufgabe');
E('ic-title').value='Steuer 2025 abgeben'; E('ic-due').value='2026-12-01'; E('ic-step').value='Unterlagen suchen';
ACT.inbConvSave({iid:'zz-i1'});
const tk=S.tasks[S.tasks.length-1];
ok(tk.title==='Steuer 2025 abgeben'&&tk.due==='2026-12-01'&&tk.firstStep==='Unterlagen suchen','Konverter: Aufgabe mit Deadline + Erstem Schritt');
ok(S.inbox.length===0,'Konverter: Inbox-Eintrag konsumiert');
const p2={id:P2ID,name:'Q',emoji:'📋',areaId:S.areas[0]?S.areas[0].id:'a1',views:{kanban:true},todos:[]};
S.projects.push(p2);
S.inbox=[{id:'zz-i2',text:'Deckblatt',kind:'idee'}];
ACT.inbConvert({id:'zz-i2',target:'todo'});
ACT.inbConvProj({iid:'zz-i2',pid:P2ID});
E('ic-title').value='Deckblatt entwerfen';
ACT.inbConvSave({iid:'zz-i2'});
ok(p2.todos.length===1&&p2.todos[0].title==='Deckblatt entwerfen','Konverter: Projekt-To-do mit Projektwahl');

/* ---------- T9 Konverter → Block mit Vorbelegung ---------- */
delete S.blocks[W]; delete S.appts[W]; /* Woche leeren → garantiert freie Slots (Demo-State sonst belegt) */
S.inbox=[{id:'zz-i3',text:'Spaziergang-Idee',kind:'gedanke'}];
ACT.inbConvert({id:'zz-i3',target:'block'});
E('ic-title').value='Spaziergang'; E('ic-step').value='nur gehen, kein Ziel';
ACT.inbConvBlock({iid:'zz-i3'});
ok(T.ui.pickCtx&&T.ui.pickCtx.type==='inbox'&&T.ui.pickCtx.fields.title==='Spaziergang'&&T.ui.pickCtx.fields.note==='nur gehen, kein Ziel','Konverter: Block-Pfad mit Feld-Vorbelegung');
ACT.pickSlot({week:W,day:4,slot:1});
const bl=T.blocksFor(W)['4|1'];
ok(bl&&bl.title==='Spaziergang'&&bl.note==='nur gehen, kein Ziel','pickSlot: Block aus Inbox mit Titel+Notiz erstellt');
ok(S.inbox.length===0,'pickSlot: Inbox-Eintrag konsumiert');

/* ---------- T10 Gantt-Move ---------- */
p2.todos.push({id:'zz-t9',title:'Gantt-Ding',done:false,est:{mode:'simple',simple:3},start:'2026-11-24',due:'2026-11-26'});
ACT.ganttMove({pid:P2ID,tid:'zz-t9',d:'2'});
const g=p2.todos.find(t=>t.id==='zz-t9');
ok(g&&g.start==='2026-11-26'&&g.due==='2026-11-26','ganttMove: Start wandert, Deadline bleibt fix (R13)');

/* ---------- T11 edSave: Est + Start + Delegation ---------- */
p2.todos.push({id:'zz-t10',title:'Schätzung',done:false});
E('ed-title').value='Schätzung'; E('ed-step').value=''; E('ed-due').value='';
E('ed-start').value='2026-11-30'; E('ed-emode').value='pert';
E('ed-eto').value='1'; E('ed-etm').value='3'; E('ed-etp').value='9'; E('ed-del').value='Tom';
ACT.edSave({kind:'todo',id:'zz-t10'});
const e10=p2.todos.find(t=>t.id==='zz-t10');
ok(e10.est&&e10.est.mode==='pert'&&Math.abs(T.estDays(e10)-(1+12+9)/6)<1e-9,'edSave: PERT-Werte übernommen ((1+12+9)/6≈3,67)');
ok(e10.start==='2026-11-30','edSave: Startdatum gesetzt (Gantt-Balken)');
ok(e10.delegated==='Tom'&&T.kanOf(e10)==='pending','edSave: delegiert → automatisch Pending-Spalte');

/* ---------- T12 kanState-Change (Liste↔Kanban-Kopplung) ---------- */
const sel={dataset:{field:'kanState',tid:'zz-t1'},value:'backlog'};
__h.change({target:sel});
ok(T.kanOf(P1.todos[0])==='backlog','change kanState: Status-Select in der Liste steuert Kanban-Spalte');

/* ---------- T13 Render-Smoke ---------- */
T.ui.projTab='gantt'; T.render(); ok(true,'render (Gantt-Tab) ohne Crash');
T.ui.projTab='kanban'; T.render(); ok(true,'render (Kanban-Tab, 5 Spalten) ohne Crash');

console.log('\n'+(fails? '✖ '+fails+' FEHLER':'✔ SMOKE R7 GRÜN — alle Tests bestanden'));
process.exit(fails?1:0);
