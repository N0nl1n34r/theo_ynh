/* SMOKE R13 — asAppt-Erstell-Flow mit Uhrzeit, Gantt-Estimate-Balken (Deadline fix) */
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
global.fetch=async()=>({ok:true,status:201,text:async()=>''});
let src=fs.readFileSync('/tmp/theo.js','utf8');
src+='\nglobalThis.__T={S,ui,ACT,renderGantt,buildEvents,blocksFor,apsFor,wk,parseISO,addDays,iso,mondayOf,dayIdx,findTodo,render,typeOf};';
eval(src);

(async()=>{
const T=globalThis.__T, S=T.S, ACT=T.ACT, ui=T.ui;
const E=id=>{const e=els['q:#'+id]; return e||document.getElementById(id)};
let fails=0; const ok=(c,m)=>{console.log((c?'PASS':'FAIL')+' — '+m); if(!c)fails++};
const W=T.wk();
ui.anchor=T.mondayOf(new Date());

/* ---------- T1 asAppt-Erstellung mit Uhrzeit ---------- */
S.types.push({id:'ta1',name:'1:1-Termin',emoji:'🤝',ampel:'rot',asAppt:true});
/* fillType auf Button-Dataset-zurückgeführt: readSpan() liest f-span → Stub setzen */
E('f-span').value='1';
ACT.fillType({day:1,slot:0,tid:'ta1'});
ok(E('overlay').innerHTML.indexOf('ta-t0')>=0&&E('overlay').innerHTML.indexOf('ta-title')>=0,'fillType (wie Termin) öffnet Erstell-Formular mit Titel + Uhrzeit');
ok(!T.blocksFor(W)['1|0'],'noch nichts erzeugt (erst „Eintragen")');
E('ta-title').value='1:1 mit L.'; E('ta-t0').value='16:00'; E('ta-t1').value='17:30';
ACT.typeApptSave({day:1,slot:0,tid:'ta1'});
const bl=T.blocksFor(W)['1|0'];
ok(bl&&bl.title==='1:1 mit L.'&&bl.t0==='16:00'&&bl.t1==='17:30','Erstell-Flow: Block mit Titel + Start-/Endzeit');
const evAs=T.buildEvents('main').find(e=>/1:1 mit L\./.test(e.text));
ok(evAs&&/DTSTART:\d{8}T160000/.test(evAs.text),'Export: echte Zeit beim Erstellen (16:00)');
/* ohne Zeit */
E('f-span').value='1';
ACT.fillType({day:2,slot:1,tid:'ta1'});
E('ta-title').value='Kurz-Check'; E('ta-t0').value=''; E('ta-t1').value='';
ACT.typeApptSave({day:2,slot:1,tid:'ta1'});
const bl2=T.blocksFor(W)['2|1'];
ok(bl2&&bl2.title==='Kurz-Check'&&bl2.t0===undefined,'ohne Zeit: Blockfenster gilt (kein t0)');

/* ---------- T2 Gantt: Balken = Estimate, Deadline fix ---------- */
S.projects.push({id:'gp',name:'GanttP',areaId:'',views:{list:true},todos:[
  {id:'g1',title:'Estimate-Task',done:false,est:{mode:'simple',simple:4},start:'2026-11-24',due:'2027-01-15'}]});
ui.route={view:'projekt',id:'gp'}; ui.projTab='gantt';
T.render();
const gh=E('main').innerHTML;
const m=gh.match(/class="gbar"[^>]*style="left:(\d+)px;width:(\d+)px;/);
if(!m){const gi=gh.indexOf('gbar'); console.log('DEBUG gbar snippet:',JSON.stringify(gh.slice(Math.max(0,gi-20),gi+180)))}
ok(!!m&&Math.round(parseInt(m[2],10)/36)===4,'Balkenlänge = Estimate (4 Tage → '+m[2]+'px ≈ 4×36px)');
ok(!!m&&parseInt(m[1],10)>=0,'Balken startet am Startdatum');
const mD=gh.match(/class="gdue" style="left:(\d+)px"/);
ok(!!mD,'Deadline-Dreieck vorhanden');
ok(parseInt(mD[1],10)>parseInt(m[1],10)+4*36,'Dreieck liegt fern der Balkenlänge (Deadline ≠ Balkenende)');
/* Verschieben: nur Start */
ACT.ganttMove({pid:'gp',tid:'g1',d:'5'});
const g1=T.findTodo('g1').t;
ok(g1.start==='2026-11-29'&&g1.due==='2027-01-15','ganttMove: Start wandert, Deadline bleibt fix');
/* Drag (drop-Handler) — direkt simulieren über ACT? drop ist im click-Handler eingebettet; hier reichen ‹ › */
ACT.ganttMove({pid:'gp',tid:'g1',d:'-5'});
ok(T.findTodo('g1').t.start==='2026-11-24','zurück verschoben');

/* ---------- T3 Render-Smoke ---------- */
T.render(); ok(true,'render nach R13 ohne Crash');
console.log('\n'+(fails? '✖ '+fails+' FEHLER':'✔ SMOKE R13 GRÜN — alle Tests bestanden'));
process.exit(fails?1:0);
})().catch(e=>{console.error('DRIVER-CRASH:',e&&e.stack||e); process.exit(2)});
