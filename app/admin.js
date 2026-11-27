/* Admin functions use the signed-in user's JWT and narrowly scoped database RPCs.
   No service role key, arbitrary SQL, or access to other users' planning items. */
(() => {
  const A = {isAdmin:false, tab:'feedback', feedback:[], articles:[], users:[], flags:[], overrides:[], access:null, published:[], editing:null, status:'', busy:false};
  const escape = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const byId = id => document.getElementById(id);
  function client(){return AUTH.session && getDataClient(AUTH.session)}
  async function rpc(name, params){const sb=client(); if(!sb)throw new Error('Bitte online anmelden.'); const r=await sb.rpc(name,params||{}); if(r.error)throw r.error;return r.data}
  function validDoc(d){
    if(!d || typeof d!=='object' || typeof d.id!=='string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(d.id))return null;
    const str=(v,n=3000)=>typeof v==='string'?v.slice(0,n):'';
    const links = a => Array.isArray(a)?a.slice(0,30).filter(x=>x&&typeof x==='object'&&typeof x.label==='string'&&/^https:\/\//i.test(x.url||'')).map(x=>({label:str(x.label,200),url:str(x.url,1000),description:str(x.description,500),affiliate:x.affiliate===true})):[];
    if(!str(d.title,200) || !Array.isArray(d.paragraphs) || !Array.isArray(d.sources))return null;
    return {id:d.id,title:str(d.title,200),category:str(d.category,120),minutes:Math.max(1,Math.min(120,Number(d.minutes)||1)),summary:str(d.summary),takeaway:str(d.takeaway),paragraphs:d.paragraphs.slice(0,30).filter(x=>typeof x==='string').map(x=>str(x)),practice:str(d.practice),sources:links(d.sources),resources:links(d.resources),actions:Array.isArray(d.actions)?d.actions.slice(0,10).filter(x=>x&&typeof x.label==='string'&&['woche','jahr','eingang','bereiche'].includes(x.view)).map(x=>({label:str(x.label,200),view:x.view})):[],feature:d.feature==='authenticity'?'authenticity':''};
  }
  function cached(){try{const c=JSON.parse(localStorage.getItem('theo-published-education')||'[]');A.published=Array.isArray(c)?c.map(validDoc).filter(Boolean):[]}catch(e){A.published=[]}}
  cached();
  A.items=()=>{
    const merged=(Array.isArray(globalThis.THEO_EDUCATION)?globalThis.THEO_EDUCATION:[]).map(x=>validDoc(x)).filter(Boolean);
    A.published.forEach(x=>{const i=merged.findIndex(y=>y.id===x.id); if(i>=0)merged[i]=x; else merged.push(x)});
    const access=ui.demoMode?{authenticity:true}:A.access;
    return merged.filter(x=>!x.feature || (access && access[x.feature]===true));
  };
  A.reset=()=>{A.isAdmin=false;A.access=null;A.feedback=[];A.users=[];A.articles=[];A.flags=[];A.overrides=[];A.editing=null;A.busy=false;A.status='';A.checking=false;A.checkError=''};
  A.init=async()=>{
    const user=AUTH.user&&AUTH.user.id, session=AUTH.session;
    if(!user||!session)return;
    const token=session.access_token;
    A.checkError=''; A.checking=true;
    try{const value=JSON.parse(localStorage.getItem('theo-feature-access-'+user)||'null'); if(value&&typeof value==='object')A.access=value}catch(e){}
    const current=()=>AUTH.user&&AUTH.user.id===user&&AUTH.session&&AUTH.session.access_token===token;
    const admin=rpc('theo_is_admin').then(async value=>{
      if(!current())return;
      A.checking=false;A.isAdmin=value===true;
      if(!A.isAdmin){A.feedback=[];A.articles=[];A.users=[];A.flags=[];A.overrides=[];A.editing=null}
      safeBgRender();
      if(A.isAdmin&&ui.standaloneAdmin&&ui.route.view==='admin')await A.load();
    }).catch(()=>{if(current()){A.checking=false;A.isAdmin=false;A.checkError='Admin-Berechtigung konnte nicht geprüft werden. Bitte Internetverbindung prüfen und erneut versuchen.';safeBgRender()}});
    const access=rpc('theo_feature_access').then(value=>{
      if(!current())return;
      A.access=value&&typeof value==='object'?value:{};
      try{localStorage.setItem('theo-feature-access-'+user,JSON.stringify(A.access))}catch(e){} safeBgRender();
    }).catch(()=>{});
    const published=rpc('theo_published_education').then(value=>{
      if(!current())return;
      A.published=Array.isArray(value)?value.map(validDoc).filter(Boolean):[];
      try{localStorage.setItem('theo-published-education',JSON.stringify(A.published))}catch(e){} safeBgRender();
    }).catch(()=>{});
    await Promise.all([admin,access,published]);
  };
  A.open=async()=>{if(!A.isAdmin){toast('Kein Admin-Zugriff.');return}ui.route={view:'admin'};ui.menuOpen=false;render();await A.load()};
  A.load=async()=>{
    if(!A.isAdmin||!AUTH.user||!AUTH.session)return;
    const owner=AUTH.user.id, session=AUTH.session, tab=A.tab;
    const current=()=>AUTH.user&&AUTH.user.id===owner&&AUTH.session===session&&A.isAdmin&&A.tab===tab;
    A.busy=true;A.status='Wird geladen …';render();
    try{
      const data=tab==='feedback'?await rpc('theo_admin_feedback'):tab==='articles'?await rpc('theo_admin_articles'):await Promise.all([rpc('theo_admin_users'),rpc('theo_admin_flags'),rpc('theo_admin_user_overrides')]);
      if(!current())return;
      if(tab==='feedback')A.feedback=data||[];
      else if(tab==='articles')A.articles=data||[];
      else {A.users=data[0]||[];A.flags=data[1]||[];A.overrides=data[2]||[]}
      A.status='';
    }catch(e){if(current())A.status='Laden fehlgeschlagen. Anmeldung und Verbindung prüfen.'}
    finally{if(current()){A.busy=false;render()}}
  };
  A.tabTo=async tab=>{if(!['feedback','articles','users'].includes(tab))return;A.tab=tab;A.editing=null;await A.load()};
  A.render=()=>{
    if(!A.isAdmin)return '<div class="vhead"><h1>Administration</h1></div><p>'+(A.checking?'Berechtigung wird geprüft …':escape(A.checkError||'Kein Zugriff: Dieses Konto hat keine Admin-Berechtigung.'))+'</p><button class="btn" data-act="adminRetry">Erneut prüfen</button>';
    let h='<div class="vhead"><div><h1>⚙ Theo-Administration</h1><div class="sub">Feedback, Redaktion und Freigaben – keine Einsicht in Termine, Aufgaben oder Notizen.</div></div></div><div class="chips">'+[['feedback','💬 Feedback'],['articles','📚 Redaktion'],['users','👥 Nutzer & Freigaben']].map(([id,label])=>'<button class="chip'+(A.tab===id?' on':'')+'" data-act="adminTab" data-tab="'+id+'">'+label+'</button>').join('')+'</div>';
    if(A.status)h+='<p role="status" class="sub">'+escape(A.status)+'</p>';
    if(A.tab==='feedback'){
      h+='<p class="sub">Nachrichten sind privat. Zusammenfassungen selbst formulieren und vor einer Weitergabe personenbezogene oder sensible Angaben entfernen. Kein automatischer Agentenauftrag.</p><button class="btn mini" data-act="adminCopySummaries">Zusammenfassungen für Agentenauftrag kopieren</button>';
      h+=A.feedback.map(f=>'<div class="card" style="margin:10px 0"><b>'+escape(f.category)+'</b> · '+escape(new Date(f.created_at).toLocaleString('de-DE'))+' · '+escape(f.page)+'<p style="white-space:pre-wrap">'+escape(f.message)+'</p><label class="f">Status</label><select class="inp" id="review-status-'+escape(f.id)+'">'+[['neu','Neu'],['sortiert','Sortiert'],['geplant','Geplant'],['erledigt','Erledigt']].map(([v,l])=>'<option value="'+v+'"'+(f.status===v?' selected':'')+'>'+l+'</option>').join('')+'</select><label class="f">Datensparsame Zusammenfassung für Agentenauftrag</label><textarea class="inp" rows="3" maxlength="3000" id="review-summary-'+escape(f.id)+'">'+escape(f.summary)+'</textarea><button class="btn mini" data-act="adminSaveReview" data-id="'+escape(f.id)+'">Sortierung speichern</button></div>').join('');
      if(!A.feedback.length&&!A.busy)h+='<p class="sub">Noch kein Feedback vorhanden.</p>';
    }
    if(A.tab==='articles'){
      h+='<p class="sub">Texte, Quellen und optionale Medienlinks bearbeiten. Erst „Veröffentlichen“ macht den aktuellen Entwurf sichtbar; Texte vorab fachlich prüfen. Keine automatische KI- oder Medienveröffentlichung.</p><button class="btn mini" data-act="adminNewArticle">＋ Neuer Beitrag</button>';
      const base=(globalThis.THEO_EDUCATION||[]).map(validDoc).filter(Boolean);
      const ids=[...new Set(base.map(x=>x.id).concat(A.articles.map(x=>x.id)))];
      h+='<div class="eduGrid" style="margin-top:10px">'+ids.map(id=>{const row=A.articles.find(x=>x.id===id); const doc=validDoc(row&&row.draft)||base.find(x=>x.id===id);return doc?'<div class="card"><b>'+escape(doc.title)+'</b><p class="sub">'+(row?(row.published?'Veröffentlicht · Entwurf vorhanden':'Entwurf, noch nicht veröffentlicht'):'Mitgelieferter Inhalt')+'</p><button class="btn mini" data-act="adminEditArticle" data-id="'+escape(id)+'">Bearbeiten</button></div>':''}).join('')+'</div>';
      if(A.editing){const d=A.editing; h+='<div class="card" style="margin-top:14px"><h2>Beitrag bearbeiten</h2><p class="sub">ID nach Veröffentlichung nicht ändern: Termine und Fortschritt verwenden sie. Quellen und Medien: pro Zeile Titel | HTTPS-Adresse.</p>'+
      '<label class="f">ID (klein, Ziffern, Bindestrich)</label><input class="inp" id="ed-id" '+(d.id?'readonly ':'')+'value="'+escape(d.id)+'">'+
      '<label class="f">Titel</label><input class="inp" id="ed-title" value="'+escape(d.title)+'"><label class="f">Kategorie</label><input class="inp" id="ed-category" value="'+escape(d.category)+'"><label class="f">Minuten</label><input class="inp" type="number" min="1" max="120" id="ed-minutes" value="'+escape(d.minutes)+'">'+
      '<label class="f">Kurzbeschreibung</label><textarea class="inp" id="ed-summary">'+escape(d.summary)+'</textarea><label class="f">Kurz gesagt</label><textarea class="inp" id="ed-takeaway">'+escape(d.takeaway)+'</textarea><label class="f">Absätze (durch Leerzeilen trennen)</label><textarea class="inp" rows="8" id="ed-paragraphs">'+escape(d.paragraphs.join('\n\n'))+'</textarea><label class="f">Freiwilliger Impuls</label><textarea class="inp" id="ed-practice">'+escape(d.practice)+'</textarea>'+ 
      '<label class="f">Quellen</label><textarea class="inp" rows="4" id="ed-sources">'+escape(d.sources.map(x=>x.label+' | '+x.url).join('\n'))+'</textarea><label class="f">Weitere Medienlinks (Format und Sprache im Titel)</label><textarea class="inp" rows="4" id="ed-resources">'+escape(d.resources.map(x=>x.label+' | '+x.url).join('\n'))+'</textarea><label class="f">Freigabefunktion</label><select class="inp" id="ed-feature"><option value=""'+(!d.feature?' selected':'')+'>Immer</option><option value="authenticity"'+(d.feature==='authenticity'?' selected':'')+'>Authentizität</option></select><p class="sub">Vorhandene App-Aktionen bleiben erhalten. Beim Bearbeiten von Affiliate-Links zuerst die technische Anleitung beachten: die Werbekennzeichnung bleibt bei unveränderten Links erhalten.</p><div class="sheetBtns"><button class="btn" data-act="adminSaveArticle" data-publish="0">Entwurf speichern</button><button class="btn primary" data-act="adminSaveArticle" data-publish="1">Veröffentlichen</button><button class="btn ghost" data-act="adminCancelArticle">Abbrechen</button></div></div>';}
    }
    if(A.tab==='users'){
      h+='<p class="sub">Nur Kontodaten und Funktionsfreigaben. Keine Planungsdaten, kein Zugriff auf Passwörter. Alle Gruppen nutzen dasselbe Deployment; Funktionen müssen im Code eingebunden sein. Neue Freigaben wirken nach erneutem Laden/Anmelden; offline gilt der zuletzt gespeicherte Stand.</p>';
      h+=A.flags.map(f=>'<div class="card"><b>Funktion: '+escape(f.key)+'</b><select class="inp" id="flag-'+escape(f.key)+'">'+[['all','Alle'],['early','Nur Frühtester'],['off','Niemand (außer Einzel-Freigabe)']].map(([v,l])=>'<option value="'+v+'"'+(f.availability===v?' selected':'')+'>'+l+'</option>').join('')+'</select><button class="btn mini" data-act="adminSaveFlag" data-id="'+escape(f.key)+'">Funktion speichern</button></div>').join('');
      h+=A.users.map(u=>{
        const choices=A.flags.map(f=>{const o=A.overrides.find(x=>x.user_id===u.user_id&&x.feature_key===f.key);const value=!o?'default':o.enabled?'on':'off';return '<label class="f">'+escape(f.key)+' für dieses Konto</label><select class="inp" id="override-'+escape(u.user_id)+'-'+escape(f.key)+'"><option value="default"'+(value==='default'?' selected':'')+'>Gruppeneinstellung</option><option value="on"'+(value==='on'?' selected':'')+'>Freigeben</option><option value="off"'+(value==='off'?' selected':'')+'>Ausblenden</option></select>'}).join('');
        return '<div class="card" style="margin:10px 0"><b>'+escape(u.email||'Ohne E-Mail')+'</b><p class="sub">Konto seit '+escape(new Date(u.created_at).toLocaleDateString('de-DE'))+'</p><label class="f">Gruppe</label><select class="inp" id="channel-'+escape(u.user_id)+'"><option value="stable"'+(u.channel==='stable'?' selected':'')+'>Stabil</option><option value="early"'+(u.channel==='early'?' selected':'')+'>Frühtester</option></select>'+choices+'<button class="btn mini" data-act="adminSaveUser" data-id="'+escape(u.user_id)+'">Freigaben speichern</button></div>';
      }).join('');
    }
    return h;
  };
  A.edit=id=>{const row=A.articles.find(x=>x.id===id);const base=(globalThis.THEO_EDUCATION||[]).find(x=>x.id===id);A.editing=validDoc(row&&row.draft)||validDoc(base);render()};
  A.newArticle=()=>{A.editing={id:'',title:'',category:'',minutes:3,summary:'',takeaway:'',paragraphs:[],practice:'',sources:[],resources:[],actions:[],feature:''};render()};
  A.saveReview=async id=>{try{const status=byId('review-status-'+id).value,summary=byId('review-summary-'+id).value.trim();await rpc('theo_admin_review',{p_id:id,p_status:status,p_summary:summary}); const row=A.feedback.find(x=>x.id===id);if(row){row.status=status;row.summary=summary}toast('Sortierung gespeichert.')}catch(e){toast('Speichern fehlgeschlagen.')}};
  A.copy=async()=>{const rows=A.feedback.filter(x=>x.summary&&x.status!=='erledigt'); if(!rows.length){toast('Noch keine gespeicherten Zusammenfassungen.');return}const text='Theo – vorbereitete Aufgaben (vor Weitergabe auf persönliche Daten prüfen)\n\n'+rows.map(x=>'- ['+x.status+'] '+x.summary).join('\n');try{await navigator.clipboard.writeText(text);toast('Kopiert – bitte vor Weitergabe prüfen.')}catch(e){openSheet('<div class="shead"><h3>Auftrag kopieren</h3></div><p class="sub">Vor Weitergabe auf persönliche Daten prüfen.</p><textarea class="inp" rows="10" readonly>'+escape(text)+'</textarea><button class="btn" data-act="closeModal">Schließen</button>')}};
  A.saveArticle=async publish=>{
    const read=id=>byId('ed-'+id).value.trim();
    const lines=(v,previous)=>v.split('\n').map(x=>x.trim()).filter(Boolean).map(line=>{const at=line.lastIndexOf('|');if(at<0)throw new Error('Quellen/Medien: Titel | HTTPS-Adresse pro Zeile');const label=line.slice(0,at).trim(),url=line.slice(at+1).trim();if(!label||!/^https:\/\//i.test(url))throw new Error('Bitte nur HTTPS-Links mit Titel verwenden.');const old=previous.find(x=>x.url===url);return {label,url,description:old?old.description||'':'',affiliate:!!(old&&old.affiliate)}});
    try{const id=read('id');if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id))throw new Error('ID: Kleinbuchstaben, Ziffern und Bindestriche verwenden.');if(!A.editing.id&&((globalThis.THEO_EDUCATION||[]).some(x=>x.id===id)||A.articles.some(x=>x.id===id)))throw new Error('Diese ID existiert bereits.');const doc=validDoc({id,title:read('title'),category:read('category'),minutes:read('minutes'),summary:read('summary'),takeaway:read('takeaway'),paragraphs:read('paragraphs').split(/\n\s*\n/).filter(Boolean),practice:read('practice'),sources:lines(read('sources'),A.editing.sources),resources:lines(read('resources'),A.editing.resources),actions:A.editing.actions,feature:read('feature')});if(!doc||!doc.paragraphs.length||!doc.sources.length)throw new Error('Titel, mindestens ein Absatz und eine Quelle sind erforderlich.');if(publish&&!confirm('Diesen Beitrag nach redaktioneller Prüfung für die freigeschalteten Nutzer veröffentlichen?'))return;await rpc('theo_admin_save_article',{p_id:id,p_doc:doc,p_publish:publish});A.editing=null;await A.load();if(publish)await A.init();toast(publish?'Veröffentlicht.':'Entwurf gespeichert.')}catch(e){toast(e.message||'Speichern fehlgeschlagen.')}
  };
  A.saveUser=async id=>{try{const overrides={};A.flags.forEach(f=>{overrides[f.key]=byId('override-'+id+'-'+f.key).value});await rpc('theo_admin_update_user',{p_user:id,p_channel:byId('channel-'+id).value,p_overrides:overrides});toast('Freigaben gespeichert.')}catch(e){toast('Speichern fehlgeschlagen.')}};
  A.saveFlag=async id=>{try{await rpc('theo_admin_set_flag',{p_key:id,p_availability:byId('flag-'+id).value});await A.load();await A.init();toast('Funktion gespeichert.')}catch(e){toast('Speichern fehlgeschlagen.')}};
  globalThis.THEO_ADMIN=A;
})();
