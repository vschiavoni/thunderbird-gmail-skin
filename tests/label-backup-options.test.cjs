const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
class Element {
 constructor(tag='div'){this.tag=tag;this.children=[];this.events={};this.dataset={};this.files=[];this.disabled=false;this.hidden=false;this.value='';}
 append(...nodes){this.children.push(...nodes)}
 replaceChildren(...nodes){this.children=nodes}
 setAttribute(name,value){this[name]=value}
 addEventListener(name,fn){this.events[name]=fn}
 click(){this.clicked=true;this.events.click?.()}
 remove(){this.removed=true}
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(overrides={}){
 const nodes=new Map(),actions=[],downloads=[],blobs=[],revoked=[],windowEvents={},timers=[];
 const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id)};
 let previews=0;
 const preview={previewToken:'preview-1',counts:{create:1,reuse:1,conflict:0,matched:2,missing:1,ambiguous:1,restore:1},labelRows:[{name:'Work/<img src=x onerror=alert(1)>',status:'create'},{name:'Existing',status:'reuse'}]};
 const response=async(action,data)=>{
  actions.push({action,data});
  if(overrides[action])return overrides[action](data);
  if(action==='preview')return {...preview,previewToken:`preview-${++previews}`};
  if(action==='accounts')return {accounts:[{id:'account-radar',label:'svt.radar@gmail.com (imap.gmail.com)'},{id:'account-other',label:'Other <img src=x>'}]};
  if(action==='import')return {created:1,reused:1,restored:1,missing:1,ambiguous:1,failed:0};
  if(action==='export')return {backup:{format:'thunder-g-label-backup',version:1,labels:[{key:'work',name:'Work'}],assignments:[]},counts:{labels:1,messages:2,skipped:1},warnings:['One local folder was unavailable.']};
  return {};
 };
 const scope=require('./localization-context.cjs').createContext({
  Blob,
  URL:{createObjectURL(blob){blobs.push(blob);return `blob:backup-${blobs.length}`},revokeObjectURL:url=>revoked.push(url)},
  document:{body:new Element('body'),getElementById:get,createElement(tag){const node=new Element(tag);if(tag==='a'){downloads.push(node);if(overrides.downloadClick)node.click=overrides.downloadClick;}return node}},
  window:{addEventListener:(name,fn)=>{windowEvents[name]=fn},setTimeout:fn=>timers.push(fn)},
  browser:{inlineLabels:{labelBackup:async(action,json)=>{
   try{return JSON.stringify({ok:true,result:await response(action,JSON.parse(json))});}
   catch(error){return JSON.stringify({ok:false,error:error.message});}
  }}}
 });
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/label-backup-options.js'),'utf8'),scope);
 const el=id=>get('label-backup-'+id);
 async function file(text='{"format":"test"}',size=text.length){
  const selected={size,text:async()=>text};el('file').files=[selected];await el('file').events.change();return selected;
 }
 async function selectAccount(id='account-radar'){
  await el('load-accounts').events.click();el('accounts').value=id;await el('accounts').events.change();
 }
 return {el,actions,downloads,blobs,revoked,timers,windowEvents,scope,file,selectAccount,preview};
}
test('backup settings are dormant, and selecting a file cannot change labels or scan mail',async()=>{
 const f=fixture();await tick();assert.deepEqual(f.actions,[]);
 assert.equal(f.el('apply').disabled,true);assert.equal(f.el('preview').disabled,true);
 assert.equal(f.el('export').disabled,true);await f.el('export').events.click();assert.deepEqual(f.actions,[]);
 await f.el('apply').events.click();assert.deepEqual(f.actions,[]);
 await f.file();assert.deepEqual(f.actions.map(item=>item.action),['cancel']);
 assert.equal(f.el('preview').disabled,false);assert.equal(f.el('apply').disabled,true);
 assert.match(f.el('feedback').textContent,/Choose Preview restore/);
});
test('account metadata is loaded explicitly and exporting one account never requests all accounts',async()=>{
 const f=fixture();await f.el('load-accounts').events.click();
 assert.deepEqual(f.actions.map(item=>item.action),['cancel','accounts']);
 assert.equal(f.el('accounts').value,'');assert.equal(f.el('export').disabled,true);
 await f.el('export').events.click();assert.equal(f.actions.some(item=>item.action==='export'),false);
 assert.equal(f.el('accounts').children.at(-1).textContent,'Other <img src=x>');
 f.el('accounts').value='account-radar';await f.el('accounts').events.change();assert.equal(f.el('export').disabled,false);
 await f.el('export').events.click();assert.deepEqual(f.actions.at(-1),{action:'export',data:{accountId:'account-radar'}});
 f.el('accounts').value='__all__';await f.el('accounts').events.change();await f.el('export').events.click();
 assert.deepEqual(f.actions.at(-1),{action:'export',data:{}});
 f.el('accounts').value='unlisted-account';await f.el('accounts').events.change();assert.equal(f.el('export').disabled,true);
 const exports=f.actions.filter(item=>item.action==='export').length;await f.el('export').events.click();
 assert.equal(f.actions.filter(item=>item.action==='export').length,exports);
});
test('changing the export account discards a restore preview, and account refresh failures disable export',async()=>{
 let loads=0;
 const f=fixture({accounts:async()=>{if(++loads>1)throw Error('The account list is unavailable.');return {accounts:[{id:'account-radar',label:'svt.radar@gmail.com'}]}}});
 await f.selectAccount();await f.file();await f.el('preview').events.click();assert.equal(f.el('apply').disabled,false);
 f.el('accounts').value='__all__';await f.el('accounts').events.change();
 assert.equal(f.el('apply').disabled,true);assert.equal(f.el('review').hidden,true);
 await f.el('apply').events.click();assert.equal(f.actions.some(item=>item.action==='import'),false);
 await f.el('load-accounts').events.click();assert.equal(f.el('accounts').disabled,true);assert.equal(f.el('export').disabled,true);
 assert.equal(f.el('feedback').textContent,'The account list is unavailable.');
});
test('preview is read-only, shows missing and ambiguous messages, and Restore consumes its token once',async()=>{
 const f=fixture();await f.file();await f.el('preview').events.click();
 assert.deepEqual(f.actions.map(item=>item.action),['cancel','preview']);
 assert.match(f.el('summary').textContent,/2 matched, 1 missing, 1 ambiguous/);
 assert.equal(f.el('apply').disabled,false);assert.equal(f.el('review').hidden,false);
 await f.el('apply').events.click();
 assert.deepEqual(f.actions.at(-1),{action:'import',data:{previewToken:'preview-1'}});
 assert.equal(f.el('apply').disabled,true);assert.equal(f.el('review').hidden,true);
 assert.match(f.el('feedback').textContent,/restored labels on 1 messages/);
 await f.el('apply').events.click();assert.equal(f.actions.filter(item=>item.action==='import').length,1);
});
test('label conflicts block a dispatched Restore click and a missing-only preview has no restore action',async()=>{
 const f=fixture({preview:async()=>({previewToken:'conflict',counts:{create:1,reuse:0,conflict:1,matched:3,missing:0,ambiguous:0,restore:3},labelRows:[{name:'Work',status:'conflict',reason:'Name already used'}]})});
 await f.file();await f.el('preview').events.click();
 assert.equal(f.el('apply').disabled,true);assert.match(f.el('feedback').textContent,/Resolve the label conflicts/);
 await f.el('apply').events.click();assert.equal(f.actions.some(item=>item.action==='import'),false);
 const missing=fixture({preview:async()=>({previewToken:'missing',counts:{create:0,reuse:1,conflict:0,matched:0,missing:5,ambiguous:0,restore:0},labelRows:[]})});
 await missing.file();await missing.el('preview').events.click();assert.equal(missing.el('apply').disabled,true);
});
test('the file size limit is checked before reading; malformed backups report native errors without import',async()=>{
 const f=fixture();let reads=0;
 f.el('file').files=[{size:16*1024*1024+1,text:async()=>{reads++;return '{}'}}];
 await f.el('file').events.change();await f.el('preview').events.click();
 assert.equal(reads,0);assert.equal(f.actions.some(item=>item.action==='preview'),false);
 assert.equal(f.el('feedback').dataset.error,'true');assert.match(f.el('feedback').textContent,/16 MiB/);
 const invalid=fixture({preview:async()=>{throw Error('This is not a supported label backup.')}});
 await invalid.file('{not-json');await invalid.el('preview').events.click();
 assert.equal(invalid.el('apply').disabled,true);assert.equal(invalid.el('feedback').textContent,'This is not a supported label backup.');
});
test('a new file cancels an in-flight preview and an old result cannot enable Restore',async()=>{
 let resolve;
 const f=fixture({preview:()=>new Promise(done=>{resolve=done})});
 await f.file();const opening=f.el('preview').events.click();await tick();assert.equal(f.el('file').disabled,true);
 await f.file('{"other":true}');
 resolve(f.preview);await opening;
 assert.equal(f.el('apply').disabled,true);assert.equal(f.el('review').hidden,true);
 assert.equal(f.el('file').disabled,false);assert.equal(f.el('preview').disabled,false);
 assert.match(f.el('feedback').textContent,/Backup selected/);
});
test('cancel discards a late preview failure and invalid preview tokens cannot enable Restore',async()=>{
 let reject;const f=fixture({preview:()=>new Promise((_done,failed)=>{reject=failed})});
 await f.file();const opening=f.el('preview').events.click();await tick();await f.el('cancel').events.click();
 reject(Error('An old preview failed.'));await opening;
 assert.match(f.el('feedback').textContent,/Preview cancelled/);assert.equal(f.el('feedback').dataset.error,'false');
 for(const token of [undefined,null,{},1,'','   ']){
  const invalid=fixture({preview:async()=>({...f.preview,previewToken:token})});
  await invalid.file();await invalid.el('preview').events.click();assert.equal(invalid.el('apply').disabled,true);
  await invalid.el('apply').events.click();assert.equal(invalid.actions.some(item=>item.action==='import'),false);
 }
});
test('untrusted names and warnings stay literal, and the table is bounded without changing totals',async()=>{
 const rows=Array.from({length:230},(_,i)=>({name:`<script>${i}</script>`,status:'create',reason:'<img src=x>'}));
 const f=fixture({preview:async()=>({previewToken:'many',counts:{create:230,reuse:0,conflict:0,matched:0,missing:0,ambiguous:0,restore:0},labelRows:rows,warnings:['<svg onload=alert(1)>']})});
 await f.file();await f.el('preview').events.click();
 assert.equal(f.el('rows').children.length,200);assert.match(f.el('summary').textContent,/230 labels to create/);
 assert.equal(f.el('rows').children[0].children[0].textContent,'<script>0</script>');
 assert.equal(f.el('rows').children[0].children[0].innerHTML,undefined);
 assert.equal(f.el('warnings').children[0].textContent,'<svg onload=alert(1)>');
 assert.match(f.el('omitted').textContent,/200 of 230/);
});
test('export generates a JSON download and releases its URL without writing to browser storage',async()=>{
 const f=fixture();await f.selectAccount();await f.el('export').events.click();
 assert.deepEqual(f.actions.map(item=>item.action),['cancel','accounts','cancel','cancel','export']);
 assert.equal(f.downloads.length,1);const download=f.downloads[0];
 assert.match(download.download,/^thunder-g-labels-\d{4}-\d{2}-\d{2}\.json$/);
 assert.equal(download.clicked,true);assert.equal(download.removed,true);
 assert.equal(f.blobs[0].type,'application/json');assert.equal(JSON.parse(await f.blobs[0].text()).format,'thunder-g-label-backup');
 assert.match(f.el('feedback').textContent,/1 labels and assignments for 2 messages/);
 assert.equal(f.el('warnings').children.length,1);assert.equal(f.el('warnings').hidden,false);assert.equal(f.el('review').hidden,true);
 f.timers[0]();assert.deepEqual(f.revoked,['blob:backup-1']);
});
test('a failed download releases the Blob URL and temporary link',async()=>{
 const f=fixture({downloadClick(){throw Error('The download could not be started.')}});
 await f.selectAccount();await f.el('export').events.click();assert.deepEqual(f.revoked,['blob:backup-1']);
 assert.equal(f.downloads[0].removed,true);assert.equal(f.el('feedback').dataset.error,'true');
 f.windowEvents.pagehide();assert.deepEqual(f.revoked,['blob:backup-1'],'failed downloads do not remain retained until close');
});
test('cancel and page exit discard previews; closing during a scan cannot trigger a late download',async()=>{
 const f=fixture();await f.file();await f.el('preview').events.click();await f.el('cancel').events.click();
 assert.equal(f.el('apply').disabled,true);assert.match(f.el('feedback').textContent,/No labels or assignments were changed/);
 let resolve;const closing=fixture({export:()=>new Promise(done=>{resolve=done})});
 await closing.selectAccount();const exporting=closing.el('export').events.click();await tick();closing.windowEvents.pagehide();
 resolve({backup:{},counts:{}});await exporting;
 assert.equal(closing.downloads.length,0);assert.equal(closing.actions.at(-1).action,'cancel');
});
test('a partially failed restore stays consumed and reports the native result without automatic retries',async()=>{
 const f=fixture({import:async()=>({created:1,reused:1,restored:1,missing:0,ambiguous:0,failed:2,error:'One folder could not be updated.'})});
 await f.file();await f.el('preview').events.click();await f.el('apply').events.click();
 assert.equal(f.el('feedback').dataset.error,'true');assert.match(f.el('feedback').textContent,/failed: 2/);
 assert.equal(f.el('warnings').children[0].textContent,'One folder could not be updated.');
 assert.equal(f.el('warnings').hidden,false);assert.equal(f.el('review').hidden,true);
 assert.equal(f.el('apply').disabled,true);await f.el('apply').events.click();
 assert.equal(f.actions.filter(item=>item.action==='import').length,1);
});
test('a restore result arriving after the settings page closes cannot update the page or retry writes',async()=>{
 let resolve;const f=fixture({import:()=>new Promise(done=>{resolve=done})});
 await f.file();await f.el('preview').events.click();const restoring=f.el('apply').events.click();await tick();
 const notice=f.el('feedback').textContent;f.windowEvents.pagehide();
 resolve({created:1,reused:1,restored:2,missing:0,ambiguous:0,failed:0});await restoring;
 assert.equal(f.el('feedback').textContent,notice);assert.equal(f.actions.filter(item=>item.action==='import').length,1);
});
test('backup summaries follow the selected interface language and the section explains included identifiers',async()=>{
 const f=fixture();const catalogs=Object.fromEntries(['en','it'].map(language=>[language,JSON.parse(fs.readFileSync(path.join(__dirname,`../thunder-g/_locales/${language}/messages.json`),'utf8'))]));
 f.scope.gmSetCatalogs(catalogs);f.scope.gmSetLanguage('it');await f.file();await f.el('preview').events.click();
 assert.match(f.el('summary').textContent,/etichette da creare/);assert.match(f.el('rows').children[0].children[1].textContent,/Crea etichetta/);
 f.scope.gmSetLanguage('en');assert.match(f.el('summary').textContent,/labels to create/);
 const html=fs.readFileSync(path.join(__dirname,'../thunder-g/options.html'),'utf8');
 assert.match(html,/id="label-backup-section"/);assert.match(html,/account identifiers and message identifiers/);
 assert.match(html,/Message text, attachments and account credentials are excluded/);
 const stack=[];let warningParents;
 for(const match of html.matchAll(/<(\/?)([a-z][a-z0-9-]*)([^<>]*)>/gi)){
  const [,closing,tag,attributes]=match;
  if(closing){const at=stack.findLastIndex(item=>item.tag===tag);if(at!==-1)stack.splice(at);continue;}
  const id=attributes.match(/\bid="([^"]+)"/)?.[1];
  if(id==='label-backup-warnings')warningParents=[...stack];
  if(!['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'].includes(tag)&&!attributes.endsWith('/'))stack.push({tag,id,hidden:/\bhidden\b/.test(attributes)});
 }
 assert.ok(warningParents);assert.ok(warningParents.every(item=>!item.hidden),'export and partial-restore warnings remain outside the hidden preview');
});

test('existing label definitions still allow restoring missing assignments; preview never imports',async()=>{
 const f=fixture();Object.assign(f.preview.counts,{create:0,reuse:18,matched:153,restore:1,alreadyApplied:152,missing:0,ambiguous:0});
 await f.file();await f.el('preview').events.click();
 assert.equal(f.el('apply').disabled,false);assert.equal(f.el('apply').textContent,'Restore labels');
 assert.match(f.el('summary').textContent,/assignments: 1; already assigned: 152/);
 assert.match(f.el('feedback').textContent,/No changes have been made/);
 assert.equal(f.actions.some(a=>a.action==='import'),false);
});
test('Done identifies an unchanged complete preview without applying anything and resets on another file',async()=>{
 const f=fixture();Object.assign(f.preview.counts,{create:0,reuse:18,matched:153,restore:0,alreadyApplied:153,missing:0,ambiguous:0});
 await f.file();await f.el('preview').events.click();
 assert.equal(f.el('apply').disabled,true);assert.equal(f.el('apply').textContent,'Done');
 assert.match(f.el('feedback').textContent,/matching folders.*Preview did not apply/);
 await f.el('apply').events.click();assert.equal(f.actions.some(a=>a.action==='import'),false);
 await f.file();assert.equal(f.el('apply').textContent,'Restore labels');
});
test('unresolved matches and unreadable folders never present a preview as Done',async()=>{
 for(const extra of [{missing:1},{ambiguous:1},{blocked:1}]){
  const f=fixture();Object.assign(f.preview.counts,{create:0,restore:0,missing:0,ambiguous:0},extra);
  await f.file();await f.el('preview').events.click();assert.equal(f.el('apply').textContent,'Restore labels');
 }
 const f=fixture();Object.assign(f.preview.counts,{create:0,restore:0,missing:0,ambiguous:0});f.preview.warnings=['One folder could not be read.'];
 await f.file();await f.el('preview').events.click();assert.equal(f.el('apply').textContent,'Restore labels');
});
test('Done after a successful restore does not imply another import and clears on cancellation',async()=>{
 const f=fixture({import:async()=>({created:0,reused:18,restored:1,missing:0,ambiguous:0,failed:0})});
 await f.file();await f.el('preview').events.click();await f.el('apply').events.click();
 assert.equal(f.el('apply').textContent,'Done');assert.equal(f.el('apply').disabled,true);
 await f.el('apply').events.click();assert.equal(f.actions.filter(a=>a.action==='import').length,1);
 await f.el('cancel').events.click();assert.equal(f.el('apply').textContent,'Restore labels');
});
