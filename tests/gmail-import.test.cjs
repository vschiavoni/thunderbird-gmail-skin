const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../inline-labels/gmail-import.js'),'utf8');
const scope=vm.createContext({});vm.runInContext(code,scope);
const plain=x=>JSON.parse(JSON.stringify(x));
const remote=[{id:'INBOX',name:'INBOX',type:'system'},{id:'a',name:'Work',type:'user'},{id:'b',name:'Work/Projects',type:'user'},{id:'c',name:'Conferences/Middleware',type:'user'}];
const plan=(selected=['a','b','c'],local=[],root='GMAIL-Labels')=>plain(scope.planGmailLabelImport(remote,selected,root,local));
test('dry run materializes selected hierarchy and missing parents without touching native labels',()=>{
 const p=plan();assert.deepEqual(p.counts,{create:5,skip:0,conflict:0});
 assert.deepEqual(p.rows.map(r=>r.path).sort(),['GMAIL-Labels','GMAIL-Labels/Conferences','GMAIL-Labels/Conferences/Middleware','GMAIL-Labels/Work','GMAIL-Labels/Work/Projects'].sort());
 assert.equal(p.rows.find(r=>r.path==='GMAIL-Labels/Conferences').requiredParent,true);
 assert.equal(p.rows.find(r=>r.path==='GMAIL-Labels/Work').requiredParent,false);
 assert.equal(plan([]).rows.length,0,'no selected labels means no empty root is created');
 assert.throws(()=>plan(['INBOX']),/unknown/,'system labels cannot enter the import');
 assert.throws(()=>plan(['gone']),/unknown/);
});
test('exact local paths are skipped with keys preserved; normalized/case collisions block import',()=>{
 const p=plan(['a'],[{key:'keep',tag:'GMAIL-Labels/Work',color:'#123456'}]);
 assert.equal(p.rows.find(r=>r.status==='skip').key,'keep');
 assert.equal(plan(['a'],[{key:'case',tag:'gmail-labels'}]).counts.conflict,1);
 const duplicate=[{key:'one',tag:'GMAIL-Labels'},{key:'two',tag:'GMAIL-Labels'}];
 assert.equal(plan(['a'],duplicate).counts.conflict,1);
 const r=[{id:'1',type:'user',name:'Café'},{id:'2',type:'user',name:'Cafe\u0301'}];
 const collision=plain(scope.planGmailLabelImport(r,['1','2'],'GMAIL-Labels',[]));
 assert.equal(collision.counts.conflict,2);
});
test('invalid paths are reported; source paths and Unicode are preserved exactly',()=>{
 for(const root of ['','/Root','Root//Child',' Root /Child','Root\n'])assert.throws(()=>plan(['a'],[],root));
 const p=plain(scope.planGmailLabelImport([{id:'bad',type:'user',name:'A//B'},{id:'ok',type:'user',name:'研究/été'}],['bad','ok'],'GMAIL-Labels',[]));
 assert.equal(p.counts.conflict,1);assert.ok(p.rows.some(r=>r.path==='GMAIL-Labels/研究/été'));
 assert.throws(()=>scope.gmailImportPath('x'.repeat(513)),/maximum/);
});
function fixture({authorize,fetchJSON,tags=[]}={}) {
 let list=tags.map(t=>({...t})),calls=[],requests=[],i=0;
 const service={getAllTags:()=>list.map(t=>({...t})),addTag(name,color,ordinal){calls.push([name,color,ordinal]);list.push({key:'new'+(++i),tag:name,color});}};
 const auth=authorize||async function(){return {token:'test-access-token'}};
 const importer=scope.createGmailLabelImporter({service,authorize:auth,fetchJSON:fetchJSON||async function(url,token){requests.push([url,token]);return url.includes('userinfo')?{email:'actual@example.invalid',email_verified:true}:{labels:remote}},randomId:()=>String(++i)});
 return {importer,service,calls,requests,change:fn=>fn(list)};
}
test('connection fetches verified identity and label definitions only; preview writes nothing',async()=>{
 const f=fixture();assert.equal((await f.importer.run('status')).connected,false);assert.equal(f.requests.length,0);
 const state=await f.importer.run('connect',{clientId:'unused-test-id'});
 assert.equal(state.email,'actual@example.invalid');assert.equal(state.labels.length,3);assert.equal(state.systemLabelsExcluded,1);
 assert.deepEqual(f.requests.map(r=>r[0]),['https://openidconnect.googleapis.com/v1/userinfo','https://gmail.googleapis.com/gmail/v1/users/me/labels']);
 const p=await f.importer.run('preview',{selected:['b'],root:'GMAIL-Labels'});
 assert.equal(p.counts.create,3);assert.equal(f.calls.length,0);assert.equal(f.requests.length,2);
 await f.importer.run('cancel');await assert.rejects(f.importer.run('import',{previewToken:p.previewToken}),/Preview/);
 assert.equal(f.calls.length,0);
});
test('import requires a valid one-use preview, writes parents first and repeats without duplicates',async()=>{
 const f=fixture();await f.importer.run('connect');
 await assert.rejects(f.importer.run('import',{previewToken:'forged'}),/Preview/);
 const p=await f.importer.run('preview',{selected:['b'],root:'GMAIL-Labels'});
 const r=await f.importer.run('import',{previewToken:p.previewToken});
 assert.equal(r.created.length,3);assert.deepEqual(f.calls.map(c=>c[0]),['GMAIL-Labels','GMAIL-Labels/Work','GMAIL-Labels/Work/Projects']);
 assert.ok(f.calls.every(c=>c[1]===''&&c[2]===''),'no imported color or message assignments');
 await assert.rejects(f.importer.run('import',{previewToken:p.previewToken}),/Preview/);
 const repeat=await f.importer.run('preview',{selected:['b'],root:'GMAIL-Labels'});
 assert.equal(repeat.counts.create,0);assert.equal(repeat.counts.skip,3);
 await f.importer.run('import',{previewToken:repeat.previewToken});assert.equal(f.calls.length,3);
});
test('a changed local label set invalidates preview before any native write',async()=>{
 const f=fixture();await f.importer.run('connect');const p=await f.importer.run('preview',{selected:['a'],root:'GMAIL-Labels'});
 f.change(list=>list.push({key:'outside',tag:'GMAIL-Labels/Work'}));
 await assert.rejects(f.importer.run('import',{previewToken:p.previewToken}),/changed since/);assert.equal(f.calls.length,0);
});
test('conflicts prevent every write, including the root',async()=>{
 const f=fixture({tags:[{key:'original',tag:'gmail-labels'}]});await f.importer.run('connect');
 const p=await f.importer.run('preview',{selected:['a'],root:'GMAIL-Labels'});
 await assert.rejects(f.importer.run('import',{previewToken:p.previewToken}),/conflicts/);assert.equal(f.calls.length,0);
});
test('native write failure stops, reports partial result and supports a fresh safe retry',async()=>{
 const f=fixture();await f.importer.run('connect');const p=await f.importer.run('preview',{selected:['b'],root:'GMAIL-Labels'});
 const add=f.service.addTag;f.service.addTag=(name,...args)=>{if(name.endsWith('/Work'))throw Error('disk full');add(name,...args)};
 const result=await f.importer.run('import',{previewToken:p.previewToken});assert.equal(result.created.length,1);assert.equal(result.failed.length,2);
 f.service.addTag=add;const retry=await f.importer.run('preview',{selected:['b'],root:'GMAIL-Labels'});
 assert.equal(retry.counts.skip,1);assert.equal((await f.importer.run('import',{previewToken:retry.previewToken})).created.length,2);
});
test('disconnect and close invalidate pending sign-in and discard previews',async()=>{
 let resolve;const authorize=()=>new Promise(r=>resolve=r);let cancelled=0;authorize.cancel=()=>cancelled++;
 const f=fixture({authorize});const promise=f.importer.run('connect');
 await assert.rejects(f.importer.run('connect'),/already/);await f.importer.run('disconnect');resolve({token:'discard'});
 await assert.rejects(promise,/cancelled/);assert.equal(f.requests.length,0);assert.equal((await f.importer.run('status')).connected,false);
 f.importer.close();assert.ok(cancelled>0);await assert.rejects(f.importer.run('status'),/closed/);
});
test('failed verification or malformed remote data never creates labels',async()=>{
 for(const response of [{labels:null},{labels:[{id:'1',name:'x',type:'user'},{id:'1',name:'y',type:'user'}]}]){
  const f=fixture({fetchJSON:async url=>url.includes('userinfo')?{email:'a@b.invalid',email_verified:true}:response});
  await assert.rejects(f.importer.run('connect'),/invalid label/);assert.equal(f.calls.length,0);
 }
 const f=fixture({fetchJSON:async()=>({email:'spoof@b.invalid',email_verified:false})});await assert.rejects(f.importer.run('connect'),/verified/);
});
test('native adapter is dormant without explicit client configuration and requires external-browser auth',async()=>{
 const local=vm.createContext({Services:{prefs:{getBoolPref:()=>false}},ChromeUtils:{importESModule(){throw Error('must not import OAuth')}},clearTimeout,setTimeout});vm.runInContext(code,local);
 const f=local.createNativeGmailImporter({getAllTags:()=>[]});
 assert.equal((await f.run('status')).connected,false);
 await assert.rejects(f.run('connect',{clientId:''}),/optional Google Desktop/);
 await assert.rejects(f.run('connect',{clientId:'123.apps.googleusercontent.com'}),/external-browser/);
});
test('native OAuth adapter requests only identity/label scope with PKCE and forgets credentials after fetching',async()=>{
 let request;const requests=[];
 class OAuth2 {
  constructor(scope,config){this.scope=scope;this.config=config;this.accessToken='one-shot-token';request=this}
  async connect(withUI,refresh){assert.equal(withUI,true);assert.equal(refresh,false)}
  finishAuthorizationRequest(){} onAuthorizationFailed(){}
 }
 const local=vm.createContext({Services:{prefs:{getBoolPref:()=>true},uuid:{generateUUID:()=>'{preview}'}},ChromeUtils:{importESModule:()=>({OAuth2})},clearTimeout,setTimeout,AbortController,
  fetch:async(url,options)=>{requests.push([url,options]);return {ok:true,json:async()=>url.includes('userinfo')?{email:'real-choice@example.invalid',email_verified:true}:{labels:remote}}}});
 vm.runInContext(code,local);const importer=local.createNativeGmailImporter({getAllTags:()=>[]});
 const result=await importer.run('connect',{clientId:'123.apps.googleusercontent.com',clientSecret:'desktop-config'});
 assert.equal(result.email,'real-choice@example.invalid');assert.equal(request.config.usePKCE,true);assert.equal(request.config.useExternalBrowser,true);
 assert.equal(request.scope,'openid email https://www.googleapis.com/auth/gmail.labels');assert.equal(request.accessToken,null);assert.equal(request.refreshToken,null);
 assert.ok(requests.every(([,o])=>o.headers.Authorization==='Bearer one-shot-token'&&o.credentials==='omit'&&o.redirect==='error'));
 assert.ok(!JSON.stringify(await importer.run('status')).includes('one-shot-token'));
 importer.close();
});
test('privileged API returns usable setup errors instead of exposing exceptions or losing their message',async()=>{
 const module={setTimeout,clearTimeout,ExtensionCommon:{ExtensionAPI:class{},EventManager:class{api(){return {}}}},ExtensionParent:{},ExtensionSupport:{},MailServices:{tags:{getAllTags:()=>[]}},UIFontSize:{}};
 const local=vm.createContext({ChromeUtils:{importESModule:()=>module},Services:{},GMAIL_SKIN_CSS:'',GMAIL_CONVERSATIONS_CSS:''});
 vm.runInContext(code,local);vm.runInContext(fs.readFileSync(path.join(__dirname,'../inline-labels/experiments/api.js'),'utf8'),local);
 const api=new local.inlineLabels().getAPI({extension:{id:'test'},callOnClose(){}}).inlineLabels;
 const before=JSON.parse(await api.gmailLabelImport('status','{}'));assert.equal(before.ok,true);assert.equal(before.result.connected,false);
 const failure=JSON.parse(await api.gmailLabelImport('connect','{}'));assert.equal(failure.ok,false);assert.match(failure.error,/Configure an optional Google Desktop/);
 const invalid=JSON.parse(await api.gmailLabelImport('preview','not JSON'));assert.equal(invalid.error,'Invalid importer request.');
});
