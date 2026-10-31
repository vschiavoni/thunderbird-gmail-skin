const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const core=fs.readFileSync(path.join(__dirname,'../thunder-g/label-backup.js'),'utf8');
const native=fs.readFileSync(path.join(__dirname,'../thunder-g/label-backup-native.js'),'utf8');
const hiddenPref='extensions.thunderg.hiddenMessageLabels',sidebarPref='extensions.thunderg.sidebarLabelVisibility';
const plain=value=>JSON.parse(JSON.stringify(value));
const tag=(key='work',name='Work',extra={})=>({key,tag:name,color:'#123456',ordinal:'',...extra});
function fixture({tags=[tag()],user='person@gmail.com',host='imap.gmail.com',serverKey='native1',preferences={},pause,lookup='db',notifications}={}){
 const values=new Map(Object.entries(preferences)),writes=[],calls=[],state={tags:tags.map(item=>({...item})),pauseCount:0,phase:''};
 const server={key:serverKey,type:'imap',hostName:host,username:user};
 for(const key of ['password','passwordWithUI','credentials'])Object.defineProperty(server,key,{get(){throw Error('must not read credentials')}});
 server.rootFolder={URI:'imap://profile-'+serverKey};
 const accounts={accounts:[{incomingServer:server}],allFolders:[]};
 Object.defineProperty(server.rootFolder,'descendants',{configurable:true,get(){return accounts.allFolders.filter(folder=>folder.server===server);}});
 const prefs={getStringPref:(name,fallback)=>values.has(name)?values.get(name):fallback,setStringPref(name,value){writes.push([name,value]);values.set(name,value);}};
 const service={getAllTags:()=>state.tags.map(item=>({...item})),addTagForKey(key,name,color,ordinal){calls.push(['create',key,name,color,ordinal]);state.tags.push({key,tag:name,color,ordinal});}};
 const scope=require('./localization-context.cjs').createContext({});vm.runInContext(core+'\n'+native,scope);
 const f={state,server,accounts,prefs,service,values,writes,calls,scope};
 f.folder=(name='INBOX',items=[{id:'one@example.invalid',keys:'work'}],extra={})=>{
  const headers=[],folder={URI:server.rootFolder.URI+'/'+name,server,flags:0,...extra};
  for(let i=0;i<items.length;i++){
   const item=items[i],header={folder,messageKey:item.key??i+1,messageId:item.id??'one@example.invalid',keywords:item.keys??'',label:item.label??0,
    getStringProperty(name){assert.equal(name,'keywords');return this.keywords;}};
   for(const key of ['body','subject','mime2DecodedSubject','author','mime2DecodedAuthor'])Object.defineProperty(header,key,{get(){throw Error('must not read message content')}});
   headers.push(header);
  }
  Object.defineProperty(folder,'messages',{get(){state.folderReads=(state.folderReads||0)+1;if(folder.unavailable)throw Error('folder database unavailable');return headers;}});
  const find=key=>headers.find(header=>header.messageKey===key)||null;
  folder.msgDatabase=lookup==='legacy'?{GetMsgHdrForKey:find}:{getMsgHdrForKey:find};
  if(lookup==='folder')folder.getMsgHdr=find;
  folder.addKeywordsToMessages=(selected,keys)=>{calls.push(['assign',name,Array.from(selected,header=>header.messageKey),keys]);for(const header of selected)header.keywords=[...new Set([...header.keywords.split(/\s+/).filter(Boolean),...keys.split(' ')])].join(' ');};
  f.accounts.allFolders.push(folder);folder.headers=headers;return folder;
 };
 let sequence=0;
 f.controller=scope.createNativeLabelBackup({service,accounts,prefs,notifications,randomId:()=>String(++sequence),pause:async()=>{state.pauseCount++;if(pause)await pause(f);}});
 f.run=async(action,data={})=>{state.phase=action;return plain(await f.controller.run(action,data));};
 return f;
}
async function exported({items=[{id:'one@example.invalid',keys:'work'}],...options}={}){
 const f=fixture(options);f.folder('INBOX',items);return {fixture:f,text:JSON.stringify((await f.run('export')).backup)};
}
async function prepared({items=[{id:'one@example.invalid',keys:''}],...options}={}){
 const {text}=await exported();const f=fixture({tags:[],...options});f.folder('INBOX',items);const preview=await f.run('preview',{text});return {f,text,preview};
}
function notificationService(){
 const listeners=new Set(),calls=[];
 return {listeners,calls,msgAdded:1,msgsDeleted:2,msgsMoveCopyCompleted:4,msgPropertyChanged:8,
  addListener(listener,flags){calls.push(['add',flags]);listeners.add(listener);},
  removeListener(listener){calls.push(['remove']);listeners.delete(listener);},
  emit(name,...args){for(const listener of [...listeners])listener[name]?.(...args);}};
}

test('native export and restore roundtrip preserves label definitions, visibility and new-profile header identities',async()=>{
 const {text}=await exported({tags:[tag('work','Work/Study',{ordinal:'003'})],preferences:{[hiddenPref]:'["work"]',[sidebarPref]:'{"work":"unread"}'}});
 const f=fixture({tags:[],serverKey:'new-profile'}),folder=f.folder('INBOX',[{id:'one@example.invalid',key:999,keys:'unrelated'}]);
 const preview=await f.run('preview',{text});assert.equal(preview.counts.create,1);assert.equal(preview.counts.restore,1);
 assert.equal(f.calls.length,0);assert.equal(f.writes.length,0,'preview is read only');
 const result=await f.run('import',{previewToken:preview.previewToken});
 assert.deepEqual(result,{created:1,reused:0,restored:1,missing:0,ambiguous:0,failed:0});
 assert.deepEqual(f.calls,[['create','work','Work/Study','#123456','003'],['assign','INBOX',[999],'work']]);
 assert.deepEqual(new Set(folder.headers[0].keywords.split(' ')),new Set(['unrelated','work']));
 assert.deepEqual(JSON.parse(f.values.get(hiddenPref)),['work']);assert.deepEqual(JSON.parse(f.values.get(sidebarPref)),{work:'unread'});
 assert.ok(!text.includes('new-profile'));assert.ok(!text.includes('credentials'));assert.ok(!text.includes('keywords'));
});

test('native account identity uses the current hostname property and supports the legacy hostName spelling',async()=>{
 for(const current of [true,false]){
  const f=fixture();f.folder();
  if(current){f.server.hostname='imap.gmail.com';delete f.server.hostName;}
  const result=await f.run('export');assert.equal(result.backup.accounts[0].host,'imap.gmail.com');
  const target=fixture({tags:[]});target.server.hostname='imap.gmail.com';delete target.server.hostName;target.folder('INBOX',[{id:'one@example.invalid',keys:''}]);
  const preview=await target.run('preview',{text:JSON.stringify(result.backup)});assert.equal(preview.counts.matched,1);
  assert.equal((await target.run('import',{previewToken:preview.previewToken})).restored,1);
 }
 const f=fixture();f.folder();f.server.hostname='current.example.invalid';
 assert.equal((await f.run('export')).backup.accounts[0].host,'current.example.invalid','current native property wins if both exist');
});

test('account listing is read only, deduplicated and limited to supported configured incoming servers',async()=>{
 const f=fixture();f.server.prettyName='Radar demo';
 const other={key:'other',type:'imap',hostname:'mail.example.invalid',username:'other@example.invalid'};
 f.accounts.accounts.push({incomingServer:other},{incomingServer:f.server},{incomingServer:{key:'chat',type:'nntp'}},{incomingServer:null});
 Object.defineProperty(f.accounts,'allFolders',{get(){throw Error('account listing must not enumerate folders');}});
 assert.deepEqual(await f.run('accounts'),{accounts:[{id:'account-native1',label:'Radar demo'},{id:'account-other',label:'other@example.invalid (mail.example.invalid)'}]});
 assert.equal(f.calls.length,0);assert.equal(f.writes.length,0);assert.equal(f.state.pauseCount,0);
});

test('scoped export reads only the selected account tree while retaining profile-global tag definitions',async()=>{
 const f=fixture({tags:[tag(),tag('shared','Shared label')]}),selected=f.folder('INBOX',[{id:'selected@example.invalid',keys:'work'}]);
 const other={key:'other',type:'imap',hostname:'other.example.invalid',username:'other@example.invalid',rootFolder:{URI:'imap://other'}};
 Object.defineProperty(other.rootFolder,'descendants',{get(){throw Error('must not enumerate another account tree');}});
 const foreign={URI:'imap://other/INBOX',server:other,flags:0};Object.defineProperty(foreign,'messages',{get(){throw Error('must not read another account messages');}});
 f.accounts.accounts.push({incomingServer:other});f.accounts.allFolders.push(foreign);
 Object.defineProperty(f.server.rootFolder,'descendants',{value:[selected]});
 Object.defineProperty(f.accounts,'allFolders',{get(){throw Error('scoped export must not enumerate all account folders');}});
 const result=await f.run('export',{accountId:'account-native1'});
 assert.equal(result.counts.messages,1);assert.equal(result.warnings.length,0);assert.deepEqual(result.backup.accounts.map(account=>account.id),['account-native1']);
 assert.deepEqual(result.backup.assignments.map(item=>item.messageId),['selected@example.invalid']);
 assert.deepEqual(result.backup.labels.map(label=>label.name),['Shared label','Work']);assert.equal(f.state.folderReads,1);
});

test('invalid or unconfigured account IDs are rejected before any folder enumeration or writes',async()=>{
 const f=fixture();f.folder();
 Object.defineProperty(f.accounts,'allFolders',{get(){throw Error('must validate account before enumerating folders');}});
 Object.defineProperty(f.server.rootFolder,'descendants',{get(){throw Error('must validate account before enumerating its folders');}});
 for(const accountId of ['account-missing','imap://profile-native1/INBOX','__proto__',null,3,{},'x'.repeat(129)]){
  await assert.rejects(f.run('export',{accountId}),/Choose an available account/);
 }
 assert.equal(f.state.folderReads,undefined);assert.equal(f.calls.length,0);assert.equal(f.writes.length,0);
});

test('omitted and empty export account IDs retain the explicit all-account behavior',async()=>{
 const f=fixture();f.folder();
 for(const data of [{},{accountId:''}])assert.equal((await f.run('export',data)).counts.messages,1);
});

test('native export excludes missing IDs, duplicate IDs, untagged headers and virtual folders with an explicit skip count',async()=>{
 const f=fixture(),folder=f.folder('INBOX',[{id:'one@example.invalid',keys:'work'},{id:'',keys:'work'},{id:'duplicate@example.invalid',keys:'work'},{id:'<duplicate@example.invalid>',keys:''},{id:'unlabelled@example.invalid',keys:''}]);
 f.folder('Virtual',[{id:'virtual@example.invalid',keys:'work'}],{flags:0x20});
 f.accounts.allFolders.push(folder);
 const result=await f.run('export');assert.equal(result.counts.messages,1);assert.equal(result.counts.skipped,2);assert.equal(result.warnings.length,0);
 assert.deepEqual(result.backup.assignments.map(item=>item.messageId),['one@example.invalid']);
});

test('native label reuse maps to an existing key and keeps existing preferences and colors',async()=>{
 const {text}=await exported();
 const f=fixture({tags:[tag('other','Work',{color:'#ffffff'})],preferences:{[hiddenPref]:'["other"]',[sidebarPref]:'{"other":"hide"}'}}),folder=f.folder('INBOX',[{id:'one@example.invalid',keys:''}]);
 const preview=await f.run('preview',{text});assert.equal(preview.counts.reuse,1);assert.equal(preview.labelRows[0].targetKey,'other');
 const result=await f.run('import',{previewToken:preview.previewToken});assert.equal(result.reused,1);assert.equal(result.restored,1);
 assert.deepEqual(f.calls,[['assign','INBOX',[1],'other']]);assert.equal(f.writes.length,0);assert.equal(folder.headers[0].keywords,'other');assert.equal(f.state.tags[0].color,'#ffffff');
});

test('native preview reports missing, wrong-account, wrong-folder and duplicate messages without writes',async()=>{
 const {text}=await exported();
 for(const options of [{host:'elsewhere.example.invalid'},{user:'different@gmail.com'}]){
  const f=fixture(options);f.folder('INBOX',[{id:'one@example.invalid',keys:''}]);const preview=await f.run('preview',{text});
  assert.equal(preview.counts.missing,1);assert.equal(preview.counts.restore,0);assert.equal(f.calls.length,0);
 }
 const missing=fixture();missing.folder('Archive',[{id:'one@example.invalid',keys:''}]);assert.equal((await missing.run('preview',{text})).counts.missing,1);
 const duplicate=fixture();duplicate.folder('INBOX',[{id:'one@example.invalid',keys:''},{id:'<one@example.invalid>',keys:''}]);
 const preview=await duplicate.run('preview',{text});assert.equal(preview.counts.ambiguous,1);
 const result=await duplicate.run('import',{previewToken:preview.previewToken});assert.equal(result.restored,0);assert.equal(result.ambiguous,1);assert.equal(duplicate.calls.length,0);
});

test('forged, absent, cancelled, consumed and replaced preview tokens cannot mutate labels or messages',async()=>{
 const {f,text,preview}=await prepared();
 await assert.rejects(f.run('import',{previewToken:'forged'}),/Preview/);assert.equal(f.calls.length,0);
 await f.run('cancel');await assert.rejects(f.run('import',{previewToken:preview.previewToken}),/Preview/);
 const first=await f.run('preview',{text}),second=await f.run('preview',{text});
 await assert.rejects(f.run('import',{previewToken:first.previewToken}),/Preview/);
 assert.equal((await f.run('import',{previewToken:second.previewToken})).restored,1);
 await assert.rejects(f.run('import',{previewToken:second.previewToken}),/Preview/);
 await assert.rejects(f.run('import'),/Preview/);
});

test('malformed preview invalidates an earlier preview rather than leaving it accidentally applicable',async()=>{
 const {f,preview}=await prepared();await assert.rejects(f.run('preview',{text:'not json'}),/backup/);
 await assert.rejects(f.run('import',{previewToken:preview.previewToken}),/Preview/);assert.equal(f.calls.length,0);
});

test('untrusted system flags and malformed native tag atoms are rejected before native creation or keyword writes',async()=>{
 const {text}=await exported();
 for(const key of ['\\Deleted','\\Seen','\\Flagged','WORK',')','bad"tag','bad\\tag','bad[tag','bad]tag']){
  const value=JSON.parse(text);value.labels[0].key=key;value.assignments[0].labels=[key];
  const f=fixture({tags:[]});f.folder('INBOX',[{id:'one@example.invalid',keys:''}]);
  await assert.rejects(f.run('preview',{text:JSON.stringify(value)}),/Invalid label backup/);assert.equal(f.calls.length,0);assert.equal(f.writes.length,0);
  const malformedTarget=fixture({tags:[tag(key)]});malformedTarget.folder('INBOX',[{id:'one@example.invalid',keys:''}]);
  await assert.rejects(malformedTarget.run('preview',{text}),/Invalid label backup/);assert.equal(malformedTarget.calls.length,0);
 }
});

test('uppercase imported keys cannot bypass lowercase native-key collision checks',async()=>{
 const {text}=await exported(),value=JSON.parse(text);value.labels[0].key='WORK';value.assignments[0].labels=['WORK'];
 const f=fixture({tags:[tag('work','Personal')]});f.folder('INBOX',[{id:'one@example.invalid',keys:'work'}]);
 await assert.rejects(f.run('preview',{text:JSON.stringify(value)}),/Invalid label backup/);
 assert.deepEqual(f.state.tags,[tag('work','Personal')]);assert.equal(f.calls.length,0);assert.equal(f.writes.length,0);
});

test('definition and message membership changes between preview and commit invalidate every planned write',async()=>{
 for(const mutate of [
  f=>f.state.tags.push(tag('other','Work')),
  f=>f.accounts.allFolders[0].headers[0].keywords='existing',
  f=>f.accounts.allFolders[0].headers[0].messageId='different@example.invalid',
  f=>f.accounts.allFolders[0].headers.splice(0),
  f=>f.accounts.allFolders[0].URI=f.server.rootFolder.URI+'/Renamed',
  f=>f.server.username='changed@gmail.com',
 ]){
  const {f,preview}=await prepared({tags:[tag('existing','Personal')]});mutate(f);
  await assert.rejects(f.run('import',{previewToken:preview.previewToken}),/changed since/);assert.equal(f.calls.length,0);
  await assert.rejects(f.run('import',{previewToken:preview.previewToken}),/Preview/);
 }
});

test('native message keys can change after preview; commit applies only newly resolved refs',async()=>{
 const {f,preview}=await prepared();f.accounts.allFolders[0].headers[0].messageKey=654;
 const result=await f.run('import',{previewToken:preview.previewToken});assert.equal(result.restored,1);
 assert.deepEqual(f.calls.at(-1),['assign','INBOX',[654],'work']);
});

test('label conflicts block all creations and assignments even when other labels could import',async()=>{
 const source=fixture({tags:[tag(),tag('study','Study')]});source.folder('INBOX',[{id:'one@example.invalid',keys:'work study'}]);
 const text=JSON.stringify((await source.run('export')).backup),f=fixture({tags:[tag('work','Personal')]});f.folder('INBOX',[{id:'one@example.invalid',keys:''}]);
 const preview=await f.run('preview',{text});assert.equal(preview.counts.conflict,1);assert.equal(preview.counts.create,1);
 await assert.rejects(f.run('import',{previewToken:preview.previewToken}),/conflicts/);assert.equal(f.calls.length,0);assert.equal(f.writes.length,0);
});

test('missing folders produce warnings while supported cached folders still export',async()=>{
 const f=fixture();f.folder();f.folder('Unavailable',[],{unavailable:true});
 const result=await f.run('export');assert.equal(result.counts.messages,1);assert.equal(result.warnings.length,1);assert.match(result.warnings[0],/1 folders could not be read/);
 assert.ok(f.state.pauseCount>=1,'native scanning yields to keep Thunderbird responsive');
});

test('native scanning yields between large header batches and can be cancelled without producing a partial backup',async()=>{
 let cancelAt=1;
 const f=fixture({pause:async f=>{if(f.state.pauseCount===cancelAt)await f.controller.run('cancel');}});
 f.folder('INBOX',Array.from({length:501},(_,i)=>({id:`${i}@example.invalid`,keys:'work'})));
 await assert.rejects(f.run('export'),/cancelled/);assert.equal(f.calls.length,0);
 cancelAt=-1;const next=await f.run('export');assert.equal(next.counts.messages,501);assert.ok(f.state.pauseCount>=4);
});

test('busy operations reject interleaving; shutdown cancels in-flight scans and discards tokens',async()=>{
 let release;const f=fixture({pause:()=>new Promise(resolve=>{release=resolve})});f.folder();
 const promise=f.run('export');await Promise.resolve();
 await assert.rejects(f.run('preview',{text:'{}'}),/Wait for/);
 f.controller.close();release();await assert.rejects(promise,/cancelled/);
 await assert.rejects(f.run('export'),/closed/);await assert.rejects(f.run('cancel'),/closed/);assert.equal(f.calls.length,0);
});

test('partial native assignment failure reports kept work and supports a fresh idempotent retry',async()=>{
 const items=Array.from({length:3},(_,i)=>({id:`${i}@example.invalid`,keys:'work'})),{text}=await exported({items});
 const f=fixture({tags:[]}),folder=f.folder('INBOX',items.map(item=>({...item,keys:''})));
 const nativeAdd=folder.addKeywordsToMessages;folder.addKeywordsToMessages=(headers,keys)=>{if(headers[0].messageKey===2)throw Error('offline database failure');return nativeAdd(headers,keys);};
 const preview=await f.run('preview',{text}),result=await f.run('import',{previewToken:preview.previewToken});
 assert.equal(result.created,1);assert.equal(result.restored,1);assert.equal(result.failed,2);assert.match(result.error,/stopped/);
 await assert.rejects(f.run('import',{previewToken:preview.previewToken}),/Preview/);
 folder.addKeywordsToMessages=nativeAdd;const retry=await f.run('preview',{text});assert.equal(retry.counts.alreadyApplied,1);
 const recovered=await f.run('import',{previewToken:retry.previewToken});assert.equal(recovered.created,0);assert.equal(recovered.restored,2);assert.equal(recovered.failed,0);
});

test('label creation failures stop before message writes and preserve already created labels for retry',async()=>{
 const source=fixture({tags:[tag('a','A'),tag('b','B')]});source.folder('INBOX',[{id:'one@example.invalid',keys:'a b'}]);
 const text=JSON.stringify((await source.run('export')).backup),f=fixture({tags:[]});f.folder('INBOX',[{id:'one@example.invalid',keys:''}]);
 const add=f.service.addTagForKey;f.service.addTagForKey=(key,...args)=>{if(key==='b')throw Error('disk full');return add(key,...args);};
 const preview=await f.run('preview',{text}),result=await f.run('import',{previewToken:preview.previewToken});
 assert.equal(result.created,1);assert.equal(result.restored,0);assert.ok(result.failed>0);assert.match(result.error,/stopped/);assert.equal(f.calls.some(call=>call[0]==='assign'),false);
 assert.deepEqual(f.state.tags.map(tag=>tag.key),['a']);
});

test('current native header is revalidated after scan yields, and late additive keyword changes are preserved',async()=>{
 const {text}=await exported();
 const f=fixture({tags:[],pause:async f=>{if(f.state.phase==='import')f.accounts.allFolders[0].headers[0].keywords='external';}}),folder=f.folder('INBOX',[{id:'one@example.invalid',keys:''}]);
 const preview=await f.run('preview',{text}),result=await f.run('import',{previewToken:preview.previewToken});
 assert.equal(result.restored,1);assert.deepEqual(new Set(folder.headers[0].keywords.split(' ')),new Set(['external','work']));
 for(const [mutate,changedDuringScan] of [[folder=>folder.headers[0].messageId='replacement@example.invalid',false],[folder=>folder.URI+='/moved',true],[folder=>folder.headers.splice(0),false]]){
  const f=fixture({tags:[],pause:async f=>{if(f.state.phase==='import')mutate(f.accounts.allFolders[0]);}});f.folder('INBOX',[{id:'one@example.invalid',keys:''}]);
  const preview=await f.run('preview',{text});
  if(changedDuringScan){await assert.rejects(f.run('import',{previewToken:preview.previewToken}),/changed while scanning/);assert.equal(f.calls.length,0);continue;}
  const result=await f.run('import',{previewToken:preview.previewToken});assert.equal(result.restored,0);assert.equal(result.failed,1);assert.equal(f.calls.some(call=>call[0]==='assign'),false);
 }
});

test('native restore supports both current folder and legacy database header lookup APIs',async()=>{
 for(const lookup of ['db','legacy','folder']){
  const {f,preview}=await prepared({lookup});assert.equal((await f.run('import',{previewToken:preview.previewToken})).restored,1);
 }
});

test('native restore cancellation after a written batch keeps earlier changes and stops further writes',async()=>{
 const items=Array.from({length:201},(_,i)=>({id:`${i}@example.invalid`,keys:'work'})),{text}=await exported({items});
 const f=fixture({tags:[],pause:async f=>{if(f.state.phase==='import'&&f.calls.filter(call=>call[0]==='assign').length===100)await f.controller.run('cancel');}});
 f.folder('INBOX',items.map(item=>({...item,keys:''})));const preview=await f.run('preview',{text});
 const result=await f.run('import',{previewToken:preview.previewToken});assert.equal(result.restored,100);assert.equal(result.failed,101);assert.match(result.error,/stopped/);
 assert.equal(f.calls.filter(call=>call[0]==='assign').length,100);await assert.rejects(f.run('import',{previewToken:preview.previewToken}),/Preview/);
});

test('a native label rename or deletion during yielded writes stops further assignments to that key',async()=>{
 const items=Array.from({length:201},(_,i)=>({id:`${i}@example.invalid`,keys:'work'})),{text}=await exported({items});
 for(const mutate of [f=>f.state.tags[0].tag='Now an unrelated label',f=>f.state.tags.splice(0)]){
  const f=fixture({tags:[],pause:async f=>{if(f.state.phase==='import'&&f.calls.filter(call=>call[0]==='assign').length===100)mutate(f);}});
  f.folder('INBOX',items.map(item=>({...item,keys:''})));const preview=await f.run('preview',{text}),result=await f.run('import',{previewToken:preview.previewToken});
  assert.equal(result.restored,100);assert.equal(result.failed,101);assert.equal(f.calls.filter(call=>call[0]==='assign').length,100);assert.match(result.error,/stopped/);
 }
});

test('a newly introduced duplicate Message-ID after a yielded batch makes that message ambiguous',async()=>{
 const items=Array.from({length:201},(_,i)=>({id:`${i}@example.invalid`,keys:'work'})),{text}=await exported({items});
 let duplicate,original;
 const f=fixture({tags:[],pause:async f=>{
  if(f.state.phase==='import'&&f.calls.filter(call=>call[0]==='assign').length===100&&!duplicate){
   const folder=f.accounts.allFolders[0],written=new Set(f.calls.filter(call=>call[0]==='assign').flatMap(call=>call[2]));
   original=folder.headers.find(header=>!written.has(header.messageKey));duplicate={...original,messageKey:99999};folder.headers.push(duplicate);
  }
 }}),folder=f.folder('INBOX',items.map(item=>({...item,keys:''})));
 const preview=await f.run('preview',{text}),result=await f.run('import',{previewToken:preview.previewToken});
 assert.ok(duplicate);assert.ok(result.failed>=1);assert.equal(original.keywords,'');assert.equal(duplicate.keywords,'');
 assert.equal(f.calls.some(call=>call[0]==='assign'&&call[2].includes(original.messageKey)),false,'do not first-match a now-ambiguous message');
});

test('native scan limits abort rather than returning silently truncated folders or message assignments',async()=>{
 const folders=fixture();folders.accounts.allFolders={*[Symbol.iterator](){for(let i=0;i<20001;i++)yield {URI:folders.server.rootFolder.URI+'/'+i,server:folders.server,flags:0,messages:[]};}};
 await assert.rejects(folders.run('export'),/Too many folders/);assert.equal(folders.calls.length,0);
 const headers=fixture(),header={messageId:'one@example.invalid',messageKey:1,label:0,getStringProperty:()=>''};
 headers.accounts.allFolders=[{URI:headers.server.rootFolder.URI+'/INBOX',server:headers.server,flags:0,messages:{*[Symbol.iterator](){for(let i=0;i<500001;i++)yield header;}}}];
 await assert.rejects(headers.run('export'),/maximum 500,000/);assert.equal(headers.calls.length,0);
});

test('a folder iteration failure discards all earlier records instead of exporting a possibly ambiguous partial folder',async()=>{
 const f=fixture(),folder={URI:f.server.rootFolder.URI+'/INBOX',server:f.server,flags:0};
 const header={folder,messageId:'one@example.invalid',messageKey:1,label:0,getStringProperty:()=> 'work'};
 folder.messages={*[Symbol.iterator](){yield header;throw Error('remaining headers including a duplicate are unavailable');}};f.accounts.allFolders.push(folder);
 const result=await f.run('export');assert.equal(result.counts.messages,0);assert.equal(result.backup.assignments.length,0);assert.equal(result.warnings.length,1);
 const {text}=await exported();const preview=await f.run('preview',{text});assert.equal(preview.counts.matched,0);assert.equal(preview.counts.missing,1);assert.equal(preview.warnings.length,1);
});

test('native notifications preserve linear scan work and ignore the restore’s own keyword changes',async()=>{
 const notifications=notificationService(),items=Array.from({length:201},(_,i)=>({id:`${i}@example.invalid`,keys:'work'})),{text}=await exported({items});
 const f=fixture({tags:[],notifications}),folder=f.folder('INBOX',items.map(item=>({...item,keys:''}))),nativeAdd=folder.addKeywordsToMessages;
 folder.addKeywordsToMessages=(headers,keys)=>{nativeAdd(headers,keys);for(const header of headers)notifications.emit('msgPropertyChanged',header,'keywords');};
 const preview=await f.run('preview',{text}),reads=f.state.folderReads;
 assert.equal(notifications.listeners.size,0);const result=await f.run('import',{previewToken:preview.previewToken});
 assert.equal(result.restored,201);assert.equal(result.failed,0);assert.equal(f.state.folderReads,reads+1,'one fresh mailbox scan, not one scan per assignment or batch');
 assert.equal(notifications.listeners.size,0);assert.equal(notifications.calls.filter(call=>call[0]==='add').length,2);assert.equal(notifications.calls.filter(call=>call[0]==='remove').length,2);
});

test('native mutation notifications abort before the next batch when a duplicate is added, deleted or moved',async()=>{
 const items=Array.from({length:201},(_,i)=>({id:`${i}@example.invalid`,keys:'work'})),{text}=await exported({items});
 for(const event of ['msgAdded','msgsDeleted','msgsMoveCopyCompleted']){
  const notifications=notificationService();let changed=false;
  const f=fixture({tags:[],notifications,pause:async f=>{
   if(f.state.phase!=='import'||changed||f.calls.filter(call=>call[0]==='assign').length!==100)return;changed=true;
   const folder=f.accounts.allFolders[0],written=new Set(f.calls.filter(call=>call[0]==='assign').flatMap(call=>call[2])),original=folder.headers.find(header=>!written.has(header.messageKey));
   const duplicate={...original,messageKey:99999};folder.headers.push(duplicate);
   if(event==='msgAdded')notifications.emit(event,duplicate);
   else if(event==='msgsDeleted')notifications.emit(event,[original]);
   else notifications.emit(event,false,[original],folder,[duplicate]);
  }});f.folder('INBOX',items.map(item=>({...item,keys:''})));
  const preview=await f.run('preview',{text}),result=await f.run('import',{previewToken:preview.previewToken});
  assert.equal(result.restored,100);assert.equal(result.failed,101);assert.equal(notifications.listeners.size,0);assert.match(result.error,/stopped/);
 }
});

test('native listeners are removed immediately on cancel and shutdown, and failed registration falls back safely',async()=>{
 for(const action of ['cancel','close']){
  const notifications=notificationService();let release;
  const f=fixture({notifications,pause:()=>new Promise(resolve=>{release=resolve;})});f.folder();
  const pending=f.run('export');await Promise.resolve();assert.equal(notifications.listeners.size,1);
  if(action==='cancel')await f.controller.run('cancel');else f.controller.close();
  assert.equal(notifications.listeners.size,0);release();await assert.rejects(pending,/cancelled/);
  assert.equal(notifications.calls.filter(call=>call[0]==='remove').length,1);
 }
 const notifications=notificationService(),add=notifications.addListener;
 notifications.addListener=(...args)=>{add(...args);throw Error('old native service');};
 const f=fixture({notifications});f.folder();assert.equal((await f.run('export')).counts.messages,1);assert.equal(notifications.listeners.size,0);
});

test('mutations during a cached scan fail closed and listeners do not propagate dying-header exceptions',async()=>{
 for(const malformed of [false,true]){
  const notifications=notificationService();let changed=false;
  const f=fixture({notifications,pause:async f=>{
   if(changed)return;changed=true;const header=f.accounts.allFolders[0].headers[0];
   if(malformed){const bad={folder:header.folder};Object.defineProperty(bad,'messageId',{get(){throw Error('dying header');}});notifications.emit('msgAdded',bad);}
   else notifications.emit('msgAdded',header);
  }});f.folder();
  await assert.rejects(f.run('export'),/changed while scanning/);assert.equal(f.calls.length,0);assert.equal(notifications.listeners.size,0);
 }
});

test('account identity changes during an asynchronous scan cannot relabel cached messages under the previous account',async()=>{
 const {text}=await exported();
 const f=fixture({tags:[],pause:async f=>{if(f.state.phase==='import')f.server.username='different@gmail.com';}});f.folder('INBOX',[{id:'one@example.invalid',keys:''}]);
 const preview=await f.run('preview',{text});await assert.rejects(f.run('import',{previewToken:preview.previewToken}),/changed while scanning/);assert.equal(f.calls.length,0);
});
