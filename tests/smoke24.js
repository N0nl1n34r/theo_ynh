/* Admin security contracts, feature gating and safe editorial rendering. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const schema=read('supabase/migrations/20261126000400_editorial_admin.sql')+read('supabase/migrations/20261126000500_generic_rollout.sql');
const html=read('app/index.html');
for(const name of ['theo_admin_feedback','theo_admin_review','theo_admin_articles','theo_admin_save_article','theo_admin_users','theo_admin_flags','theo_admin_update_user','theo_admin_user_overrides']) {
  const start=schema.indexOf('FUNCTION public.'+name+'('); assert(start>=0, name+' missing');
  const end=schema.indexOf('END $$;',start); assert(schema.slice(start,end).includes('IF NOT public.theo_is_admin()'),name+' must authorize server-side');
}
assert(!/\b(?:from|join|update|into)\s+public\.items\b/i.test(schema),'Admin RPC must not query planning data');
assert(/FOREIGN|REFERENCES public\.app_feedback\(id\) ON DELETE CASCADE/.test(schema),'Feedback review follows deletion');
assert(html.includes('class="presetGrid"') && html.includes('id="admin-nav" hidden') && html.includes('🐣</span> Theo <button class="btn mini" data-act="feedbackOpen"'),'Feedback and responsive preset grid');
const store={};
const context={console,Promise,JSON,Date,Math,Array,Object,String,Number,RegExp,Error,Set,
  localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>store[k]=v},
  document:{getElementById:()=>null}, navigator:{clipboard:{writeText:async()=>{}}},
  AUTH:{user:{id:'a'},session:{access_token:'token'}},ui:{demoMode:false,route:{view:'woche'}},
  safeBgRender(){},render(){},toast(){},getDataClient(){return {rpc:async name=>{
    if(name==='theo_is_admin')return {data:true};
    if(name==='theo_feature_access')return {data:{authenticity:false}};
    if(name==='theo_published_education')return {data:[{id:'edited',title:'<b>Titel</b>',paragraphs:['Text'],sources:[]}]};
    return {data:[]};
  }}}};
context.globalThis=context;vm.createContext(context);
vm.runInContext(read('app/education.js'),context);vm.runInContext(read('app/admin.js'),context);
(async()=>{
  assert.equal(context.THEO_ADMIN.isAdmin,false);
  await context.THEO_ADMIN.init();
  assert.equal(context.THEO_ADMIN.isAdmin,true);
  assert(!context.THEO_ADMIN.items().some(x=>x.id==='selbst-erkennen'),'feature flag hides content');
  assert(context.THEO_ADMIN.items().some(x=>x.id==='edited'),'published article merged');
  context.THEO_ADMIN.access={authenticity:true};
  assert(context.THEO_ADMIN.items().some(x=>x.id==='selbst-erkennen'));
  context.THEO_ADMIN.tab='feedback';context.THEO_ADMIN.feedback=[{id:'a',category:'bug',message:'<img src=x>',page:'woche',status:'neu',summary:'',created_at:'2026-01-01'}];
  assert(!context.THEO_ADMIN.render().includes('<img src=x>'),'feedback escaped');
  context.THEO_ADMIN.reset();
  context.getDataClient=()=>({rpc:async name=>{
    if(name==='theo_feature_access')return {error:new Error('unavailable')};
    if(name==='theo_is_admin')return {data:true};
    return {data:[]};
  }});
  await context.THEO_ADMIN.init();
  assert.equal(context.THEO_ADMIN.isAdmin,true,'unrelated RPC failure must not hide admin access');
  let resolveAdmin;
  context.getDataClient=()=>({rpc:name=>name==='theo_is_admin'?new Promise(r=>resolveAdmin=r):Promise.resolve({data:[]})});
  const pending=context.THEO_ADMIN.init();
  context.AUTH.user={id:'other'};context.AUTH.session={access_token:'other-token'};context.THEO_ADMIN.reset();
  resolveAdmin({data:true});await pending;
  assert.equal(context.THEO_ADMIN.isAdmin,false,'stale admin response must not survive account switch');
  assert(JSON.parse(read('vercel.json')).rewrites.some(r=>r.source==='/admin'&&r.destination==='/app/index.html'));
  context.THEO_ADMIN.reset(); assert.equal(context.THEO_ADMIN.isAdmin,false);
  assert(context.THEO_ADMIN.render().includes('Kein Zugriff'));
  console.log('SMOKE 24 ALL GREEN — admin authorization, rollout, editorial and escaping');
})().catch(e=>{console.error(e);process.exit(1)});
