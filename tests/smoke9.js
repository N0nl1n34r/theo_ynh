/* SMOKE R9 — MIT transparent, Termin-Chips konsistent (Zahl == Liste),
   Zuordnung scheitert nie (Stack), Writeback-Markierung (LR-ASSIGNED + X-LR-SLOT) */
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
/* fetch stubpen: kein echtes Netz im Driver; nur full-1 antwortet (Writeback-Szenario) */
let putBody=null;
global.fetch=async(url,opt)=>{
  const u=String(url);
  if(u.indexOf('full-1')>=0){
    if((opt||{}).method==='PUT'){putBody=opt.body; return {ok:true,status:204,text:async()=>''}}
    return {ok:true,status:200,text:async()=>['BEGIN:VCALENDAR','BEGIN:VEVENT','UID:full-1','DTSTART:20261126T093000','DTEND:20261126T103000','SUMMARY:Muss zuordenbar sein','END:VEVENT','END:VCALENDAR'].join('\r\n')};
  }
  return {ok:false,status:599,text:async()=>''};
};

let src=fs.readFileSync('/tmp/theo.js','utf8');
src+='\nglobalThis.__T={S,ui,ACT,buildEvents,processRemote,classifyRemote,autoAssign,takeRemote,stackAppt,apsFor,blocksFor,coveredByW,wk,renderAgenda,allApptItems,wdCfg,render,SLOTS,mapSlotForTime,parseISO,addDays,iso,mondayOf,dayIdx};';
eval(src);

(async()=>{
const T=globalThis.__T, S=T.S, ACT=T.ACT;
let fails=0; const ok=(c,m)=>{console.log((c?'PASS':'FAIL')+' — '+m); if(!c)fails++};
const pad2=n=>('0'+n).padStart(2,'0');
const W=T.wk();
/* Verbindungsdaten setzen, damit Writeback-Flüsse überhaupt laufen (sonst Early-Return) */
S.settings.webdav={url:'https://kai.example',user:'u',pass:'p',cal:'https://kai.example/remote.php/dav/calendars/u/personal/'};

/* ---------- T1 MIT transparent ---------- */
S.mit['2026-11-26']={text:'Ruhig bleiben',done:false};
const mitEv=T.buildEvents('main').find(e=>/LR-MIT/.test(e.text));
ok(!!mitEv&&/TRANSP:TRANSPARENT/.test(mitEv.text),'MIT: TRANSP:TRANSPARENT im Export (wie Phasen, nicht busy)');

/* ---------- T2 Termin-Chips: Zahl == Liste in allen vier Bereichen ---------- */
const mk=(dateStr,slot,title)=>{
  const d=T.parseISO(dateStr);
  const w=T.iso(T.mondayOf(d)), dd=T.dayIdx(d);
  T.apsFor(w)[dd+'|'+slot]={id:'ag-'+dateStr+'-'+slot,day:dd,slot:slot,title:title,time:'—',ampel:null,src:'Test',span:1};
};
const now=new Date();
const tstr=now.getFullYear()+'-'+pad2(now.getMonth()+1)+'-'+pad2(now.getDate());
const monD=now.getFullYear()+'-'+pad2(now.getMonth()+1)+'-05';
const nextMonD=now.getMonth()===11?(now.getFullYear()+1)+'-01-15':now.getFullYear()+'-'+pad2(now.getMonth()+2)+'-15';
mk(tstr,0,'heute-thing');
mk(monD,1,'monat-thing');
mk(nextMonD,2,'spaeter-thing');
for(const r of ['heute','woche','monat','spaeter']){
  T.ui.agRange=r;
  const html=T.renderAgenda();
  const chipM=html.match(new RegExp('data-r="'+r+'">[^<]*\\((\\d+)\\)'));
  const rows=(html.match(/class="agRow"/g)||[]).length;
  ok(!!chipM&&+chipM[1]===rows,'Chips „'+r+'“: Zahl ('+(chipM?chipM[1]:'?')+') == angezeigte Zeilen ('+rows+')');
}

/* ---------- T3 Zuordnung scheitert nie (Auto-Stack bei vollem Tag) ---------- */
delete S.blocks[W]; delete S.appts[W];
T.apsFor(W)['3|0']={id:'occ0',day:3,slot:0,title:'Belegt 0',time:'—',ampel:null,src:'X',span:1};
T.apsFor(W)['3|1']={id:'occ1',day:3,slot:1,title:'Belegt 1',time:'—',ampel:null,src:'X',span:1};
T.apsFor(W)['3|2']={id:'occ2',day:3,slot:2,title:'Belegt 2',time:'—',ampel:null,src:'X',span:1};
const txtFull='BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:full-1\nDTSTART:20261126T093000\nDTEND:20261126T103000\nSUMMARY:Muss zuordenbar sein\nEND:VEVENT\nEND:VCALENDAR';
const r1=T.processRemote(txtFull);
ok(r1.placed===1&&r1.queued===0,'voller Tag: processRemote ordnet TROTZDEM zu (placed=1, keine Warteschlange)');
const mapped=S.mapped['full-1']||{};
const occ=T.apsFor(mapped.w||W)[mapped.day+'|'+mapped.slot];
ok(occ&&occ.stack&&occ.stack.length===1&&occ.stack[0].remoteUid==='full-1'&&occ.stack[0].t0==='09:30','geteilter Slot: Karte im Stack des belegten Slots, echte Zeiten (09:30) erhalten');
ok(occ.stack[0].slot===mapped.slot&&occ.stack[0].day===mapped.day,'Stack-Karte trägt Slot/Tag der Zuordnung');
const txtAll='BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:all-1\nDTSTART;VALUE=DATE:20261127\nSUMMARY:Ganztags voll\nEND:VEVENT\nEND:VCALENDAR';
const r2=T.processRemote(txtAll);
ok(r2.placed===1,'ganztägig bei vollem Tag: Zuordnung gelingt (placed=1)');
/* Writeback (aus takeRemote gefeuert) auf full-1 ausführen lassen */
await new Promise(res=>setTimeout(res,50));
ok(!!putBody,'Writeback: PUT wurde nach Auto-Zuordnung ausgeführt');
ok(putBody&&/CATEGORIES:LR-ASSIGNED/.test(putBody)&&/X-LR-SLOT:\d/.test(putBody),'Writeback: LR-ASSIGNED + X-LR-SLOT gesetzt');
ok(putBody&&/DTSTART:20261126T093000/.test(putBody)&&/DTEND:20261126T103000/.test(putBody)&&/SUMMARY:Muss zuordenbar sein/.test(putBody),'Writeback: DTSTART/DTEND/SUMMARY exakt unverändert');
ok(putBody&&!/LR-MIRROR/.test(putBody),'Writeback: keine Mirror-Kategorie (Spiegel nur bei Zeit-Änderung)');

/* ---------- T4 Manuelle Zuordnung stackt ebenfalls (assign) ---------- */
const fdate=T.iso(T.addDays(T.parseISO(W),3));
S.unmapped=[{uid:'man-1',date:fdate,title:'Manuell zuordnen',time:'20:00–21:00'}];
ACT.assign({uid:'man-1',v:'2'});
ok(!S.unmapped.some(x=>x.uid==='man-1')&&!!S.mapped['man-1'],'assign: Eintrag wurde zugeordnet (nicht abgelehnt)');
const occ2=T.apsFor(W)['3|2'];
ok(occ2&&occ2.stack&&occ2.stack.some(x=>x.remoteUid==='man-1'),'assign: gestapelt auf belegten Abend-Slot');
ok((S.mapped['man-1']||{}).slot===2,'assign: Merkliste zeigt gewählten Slot');
S.unmapped=[{uid:'man-2',date:fdate,title:'Ganztags manuell',time:''}];
ACT.assign({uid:'man-2',v:'all'});
ok(!!S.mapped['man-2']&&!S.unmapped.some(x=>x.uid==='man-2'),'assign „ganzer Tag“: trotz belegtem Tag zugeordnet');

/* ---------- T5 Writeback: vorhandene CATEGORIES werden erweitert, kein Doppel-Marker ---------- */
putBody=null;
global.fetch=async(url,opt)=>{
  if(String(url).indexOf('full-1')>=0){
    if((opt||{}).method==='PUT'){putBody=opt.body; return {ok:true,status:204,text:async()=>''}}
    return {ok:true,status:200,text:async()=>['BEGIN:VCALENDAR','BEGIN:VEVENT','UID:full-1','CATEGORIES:Arbeit,Fokus','DTSTART:20261126T093000','DTEND:20261126T103000','SUMMARY:Muss zuordenbar sein','X-LR-SLOT:9','END:VEVENT','END:VCALENDAR'].join('\r\n')};
  }
  return {ok:false,status:599,text:async()=>''};
};
const apWB=occ.stack.find(x=>x.remoteUid==='full-1');
/* wdAssignWriteback ist nicht exportiert — über assign-ähnlichen Aufruf: Prozess erneut simulieren */
T.processRemote('BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:full-2\nDTSTART:20261126T143000\nDTEND:20261126T153000\nSUMMARY:Zweiter Fall\nEND:VEVENT\nEND:VCALENDAR');
await new Promise(res=>setTimeout(res,50));
ok(putBody===null,'klassifizierte Fremdevents ohne Zuordnung bleiben unverändert (kein PUT ohne Anlass)');
/* echter Doppel-Marker-Test: full-1 erneut zuordnen (mapped löschen) */
delete S.mapped['full-1'];
occ.stack=occ.stack.filter(x=>x.remoteUid!=='full-1');
T.processRemote(txtFull);
await new Promise(res=>setTimeout(res,50));
ok(!!putBody&&putBody.indexOf('CATEGORIES:Arbeit,Fokus,LR-ASSIGNED')>=0,'bestehende CATEGORIES werden um LR-ASSIGNED erweitert (nicht ersetzt)');
ok(!!putBody&&putBody.indexOf('X-LR-SLOT:9')<0&&/X-LR-SLOT:\d/.test(putBody),'altes X-LR-SLOT wird ersetzt, nicht dupliziert');

/* ---------- T6 Render-Smoke ---------- */
T.render(); ok(true,'render (Woche mit Stack-Karten) ohne Crash');
T.ui.route={view:'kiste'}; T.render(); ok(true,'render nach R9-Änderungen ohne Crash');

console.log('\n'+(fails? '✖ '+fails+' FEHLER':'✔ SMOKE R9 GRÜN — alle Tests bestanden'));
process.exit(fails?1:0);
})().catch(e=>{console.error('DRIVER-CRASH:',e); process.exit(2)});
