const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture({stalledRefresh=false,stalledCopy=false,delayedArrival=false,onTiming=null}={}){
  const flags={Inbox:1,SentMail:2,Trash:4,Junk:8,Drafts:16};let saved='[]',listener,sequence=0,copyCount=0,finishCopy,failSource=null;
  const folders=[];
  const server={key:'a',type:'imap',hostname:'imap.example.com',username:'me@example.com'};
  function folder(name,flag=0){const value={name,URI:'imap://example/'+name,flags:flag,server,messages:[],pending:[],refreshes:0,QueryInterface(){const folder=this;return {updateFolderWithListener(_win,listener){folder.refreshes++;folder.messages.push(...folder.pending);folder.pending=[];if(!stalledRefresh)listener.OnStopRunningUrl(null,0)}}}};folders.push(value);return value;}
  const inbox=folder('Inbox',1),sent=folder('Sent',2),root=folder('root');server.rootFolder=root;
  root.descendants=folders;root.containsChildNamed=name=>folders.some(folder=>folder.name===name);root.getChildNamed=name=>folders.find(folder=>folder.name===name);root.createSubfolder=name=>folder(name);root.getFolderWithFlags=flag=>folders.find(folder=>folder.flags&flag);
  const errors=[],notifications=[],scope=vm.createContext({console:{error:(...args)=>errors.push(args),warn(){}},setTimeout:(callback,delay)=>{if((stalledRefresh&&delay===2000)||(stalledCopy&&delay===60000))queueMicrotask(callback);return 1;},clearTimeout(){},gmText:text=>text,
    Ci:{nsMsgFolderFlags:flags,nsIMsgFolderNotificationService:{msgAdded:1}},Cc:{'@mozilla.org/alerts-service;1':{getService:()=>({showAlertNotification:(...args)=>notifications.push(args)})}},
    ChromeUtils:{generateQI:()=>()=>{}},Components:{isSuccessCode:status=>status===0},
    Services:{uuid:{generateUUID:()=>String(++sequence)},prefs:{getStringPref:()=>saved,setStringPref:(key,value)=>saved=value,savePrefFile(){},getBoolPref:()=>false}},
    MailServices:{accounts:{allServers:[server]},mfn:{addListener:value=>listener=value,removeListener(){}},copy:{copyMessages(source,headers,dest,move,callback){copyCount++;if(source.name===failSource){callback.onStopCopy(1);return;}if(stalledCopy){finishCopy=()=>callback.onStopCopy(0);return;}for(const header of headers){(delayedArrival?dest.pending:dest.messages).push({...header,messageSize:header.messageSize+11,folder:dest});if(move)source.messages=source.messages.filter(item=>item!==header);}for(const remaining of source.messages)remaining.messageSize+=11;callback.onStopCopy(0);}}}});
  vm.runInContext(fs.readFileSync('thunder-g/snooze.js','utf8'),scope);vm.runInContext(fs.readFileSync('thunder-g/snooze-native.js','utf8'),scope);
  const service=scope.createNativeSnooze({onTiming});
  function header(id,source=inbox,{read=true,refs=[]}={}){const properties={};const h={messageId:id,date:1000000,dateInSeconds:1,messageSize:100,isRead:read,mime2DecodedSubject:id,folder:source,numReferences:refs.length,getStringReference:i=>refs[i],setStringProperty:(name,value)=>properties[name]=value,getStringProperty:name=>properties[name]||''};source.messages.push(h);return h;}
  return {service,header,inbox,sent,folders,server,errors,notifications,flags,rewriteJournal(fn){saved=JSON.stringify(fn(JSON.parse(saved)))},restart(){service.close();return scope.createNativeSnooze({onTiming})},set failSource(value){failSource=value},finishCopy:()=>finishCopy(),get copyCount(){return copyCount},get saved(){return JSON.parse(saved)},get listener(){return listener}};
}
test('native Inbox moves wait for IMAP refresh, tolerate changed sizes, and preserve read/unread',async()=>{const f=fixture();const a=f.header('a'),b=f.header('b',f.inbox,{read:false,refs:['a']});await f.service.snooze([a,b],Date.now()+100000);assert.equal(f.inbox.messages.length,0);const storage=f.folders.find(folder=>folder.name==='Thunder-G Snoozed');assert.deepEqual(storage.messages.map(h=>h.isRead),[true,false]);assert.equal(f.saved.length,1);await f.service.cancel(f.saved[0].id);assert.deepEqual(f.inbox.messages.map(h=>h.isRead),[true,false]);assert.equal(storage.messages.length,0);});
test('native Sent snooze retains Sent and creates Inbox at unsnooze',async()=>{const f=fixture();const a=f.header('a',f.sent);await f.service.snooze([a],Date.now()+100000);assert.equal(f.sent.messages.length,1);await f.service.cancel(f.saved[0].id);assert.equal(f.sent.messages.length,1);assert.equal(f.inbox.messages.length,1);assert.equal(f.inbox.messages[0].messageId,'a');});
test('unrelated bulk conversations get independent schedules',async()=>{const f=fixture();await f.service.snooze([f.header('a'),f.header('b')],Date.now()+100000);assert.equal(f.saved.length,2);await f.service.cancel(f.saved[0].id);assert.equal(f.inbox.messages.length,1);assert.equal(f.saved.length,1);});
test('a matching new Inbox reply wakes its conversation without waking others',async()=>{const f=fixture();await f.service.snooze([f.header('a'),f.header('b')],Date.now()+100000);const reply=f.header('reply',f.inbox,{refs:['a']});reply.dateInSeconds=Date.now()/1000+1;await f.service.check();assert.equal(f.saved.length,1);assert.equal(f.saved[0].messages[0].id,'b');assert.equal(f.inbox.messages.some(h=>h.messageId==='a'),true);});
test('ambiguous native headers and replaced accounts fail without an unsafe move',async()=>{const f=fixture();f.header('a');await assert.rejects(f.service.snooze([f.header('a')],Date.now()+100000),/retried/);assert.equal(f.inbox.messages.length,2);const g=fixture();await g.service.snooze([g.header('b')],Date.now()+100000);g.server.hostname='other.example.com';await assert.rejects(g.service.cancel(g.saved[0].id),/account/);assert.equal(g.inbox.messages.length,0);assert.equal(g.saved.length,1);});
test('manually removed held message is never recreated from Sent',async()=>{const f=fixture();await f.service.snooze([f.header('a',f.sent)],Date.now()+100000);const id=f.saved[0].id;const storage=f.folders.find(folder=>folder.name==='Thunder-G Snoozed');const deleted=storage.messages;storage.messages=[];f.listener.msgsDeleted(deleted);await f.service.check();await f.service.cancel(id);assert.equal(f.sent.messages.length,1);assert.equal(f.inbox.messages.length,0);assert.equal(f.saved.length,0);});

test('an IMAP refresh already in progress cannot stall snooze or cancellation',{timeout:1000},async()=>{const f=fixture({stalledRefresh:true});await f.service.snooze([f.header('a')],Date.now()+100000);assert.equal(f.saved[0].state,'sleeping');await f.service.cancel(f.saved[0].id);assert.equal(f.inbox.messages.length,1);assert.equal(f.saved.length,0);});

test('native acceptance does not wait for creating a remote holding folder',async()=>{
  const f=fixture();let accepted=false;
  await f.service.snooze([f.header('a')],Date.now()+100000,()=>{accepted=true;assert.equal(f.saved[0].state,'preparing');assert.equal(f.folders.some(folder=>folder.name==='Thunder-G Snoozed'),false);});
  assert.equal(accepted,true);assert.equal(f.saved[0].state,'sleeping');assert.equal(f.folders.find(folder=>folder.name==='Thunder-G Snoozed').messages.length,1);
});

test('IMAP removal events do not forget a schedule while its held message still exists',async()=>{
  const f=fixture();await f.service.snooze([f.header('a')],Date.now()+100000);
  const held=f.folders.find(folder=>folder.name==='Thunder-G Snoozed');
  const oldHeader=held.messages[0];held.messages=[{...oldHeader}];
  f.listener.msgsDeleted([oldHeader]);await f.service.check();
  assert.equal(f.saved.length,1);assert.equal(f.saved[0].state,'sleeping');
  f.listener.msgsMoveCopyCompleted(true,[oldHeader]);await f.service.check();
  assert.equal(f.saved.length,1);
  await f.service.cancel(f.saved[0].id);assert.equal(f.inbox.messages.length,1);
});

 test('a missing native copy callback releases the queue and retries never duplicate the move',{timeout:1000},async()=>{
  const f=fixture({stalledCopy:true});const a=f.header('a');
  await assert.rejects(f.service.snooze([a],Date.now()+100000),/retried/);
  assert.equal(f.saved[0].state,'preparing');
  await f.service.check();
  assert.equal(f.saved[0].state,'preparing');
  assert.ok(f.saved[0].error.includes('still pending'));
  assert.equal(f.copyCount,1);
  await assert.rejects(f.service.cancel(f.saved[0].id),/still pending/);
  assert.equal(f.saved[0].state,'waking');
  assert.equal(f.copyCount,1);
  f.finishCopy();await f.service.check();
  assert.equal(f.saved.length,0);
  assert.equal(f.inbox.messages.length,1);
  f.service.close();
});

test('generic folder wrappers expose IMAP refresh only through QueryInterface',async()=>{
  const f=fixture();assert.equal(f.inbox.updateFolderWithListener,undefined);
  await f.service.snooze([f.header('a')],Date.now()+100000);
  assert.equal(f.saved[0].state,'sleeping');
  assert.equal(f.inbox.refreshes,0,'a cached source header needs no network refresh');
  await f.service.cancel(f.saved[0].id);assert.equal(f.saved.length,0);
});

test('held headers and original headers resolve to the same durable reminder',async()=>{
  const f=fixture(),a=f.header('a');await f.service.snooze([a],Date.now()+100000);
  const held=f.folders.find(folder=>folder.name==='Thunder-G Snoozed').messages[0];
  assert.equal(f.service.forHeaders([held])[0].id,f.saved[0].id);
  assert.equal(f.service.forHeaders([a])[0].id,f.saved[0].id);
  assert.equal(f.service.forHeaders([f.header('other')]).length,0);
  const otherAccount={...held,folder:{server:{...f.server,key:'different'}}};
  assert.equal(f.service.forHeaders([otherAccount]).length,0);
});

test('a 120-message conversation uses three bounded native moves in each direction',async()=>{
  const f=fixture(),headers=Array.from({length:120},(_,i)=>f.header('batch-'+i,f.inbox,{refs:i?['batch-0']:[]}));
  await f.service.snooze(headers,Date.now()+100000);
  assert.equal(f.saved.length,1);assert.equal(f.saved[0].state,'sleeping');
  assert.equal(f.copyCount,3,'one native request per chunk, instead of per message');
  assert.equal(f.inbox.refreshes,0,'cached sources require no refresh');
  const held=f.folders.find(folder=>folder.name==='Thunder-G Snoozed');
  assert.equal(held.messages.length,120);
  assert.ok(held.refreshes<=6,'at most one preflight and one arrival refresh per chunk');
  await f.service.cancel(f.saved[0].id);
  assert.equal(f.copyCount,6);assert.equal(f.saved.length,0);assert.equal(f.inbox.messages.length,120);
  assert.equal(held.messages.length,0);
});
test('batching keeps Sent copies separate from Inbox moves',async()=>{
  const f=fixture(),inbox=f.header('incoming'),sent=f.header('reply',f.sent,{refs:['incoming']});
  await f.service.snooze([inbox,sent],Date.now()+100000);
  assert.equal(f.copyCount,2);assert.equal(f.inbox.messages.length,0);assert.equal(f.sent.messages.length,1);
  await f.service.cancel(f.saved[0].id);
  assert.equal(f.copyCount,3);assert.equal(f.inbox.messages.length,2);assert.equal(f.sent.messages.length,1);
});

test('a partial batch failure checkpoints successful messages and safely retries the rest',async()=>{
  const f=fixture();f.failSource='Sent';
  const a=f.header('a'),b=f.header('b',f.sent,{refs:['a']});
  await assert.rejects(f.service.snooze([a,b],Date.now()+100000),/retried/);
  assert.equal(f.saved[0].state,'preparing');
  assert.equal(f.saved[0].messages.filter(message=>message.hidden).length,1);
  const held=f.folders.find(folder=>folder.name==='Thunder-G Snoozed');
  assert.equal(held.messages.length,1);
  f.failSource=null;await f.service.check();
  assert.equal(f.saved[0].state,'sleeping');assert.equal(held.messages.length,2);
  assert.equal(f.copyCount,3,'only the failed source is copied again');
  assert.equal(f.sent.messages.length,1);
});

test('Unsnooze completes a native move when a matching Inbox copy already exists',async()=>{
  const f=fixture();await f.service.snooze([f.header('already-inbox')],Date.now()+100000);
  const held=f.folders.find(folder=>folder.name==='Thunder-G Snoozed');
  const inboxCopy=f.header('already-inbox');
  await f.service.cancel(f.saved[0].id);
  assert.equal(f.saved.length,0);assert.equal(held.messages.length,0);
  assert.ok(f.inbox.messages.includes(inboxCopy),'the original Inbox copy is preserved');
  assert.equal(f.copyCount,2,'uses the native move rather than deleting a message');
});
test('an orphaned reminder is cleared after successful refresh confirms no held or Inbox message',async()=>{
  const f=fixture();await f.service.snooze([f.header('gone')],Date.now()+100000);
  const held=f.folders.find(folder=>folder.name==='Thunder-G Snoozed');held.messages=[];
  await f.service.cancel(f.saved[0].id);
  assert.equal(f.saved.length,0);assert.equal(f.inbox.messages.length,0);
  assert.equal(f.copyCount,1,'no message is resurrected from another folder');
});
test('unconfirmed folder refresh keeps a missing-message reminder available for retry',async()=>{
  const f=fixture({stalledRefresh:true});await f.service.snooze([f.header('not-confirmed')],Date.now()+100000);
  f.folders.find(folder=>folder.name==='Thunder-G Snoozed').messages=[];
  await assert.rejects(f.service.cancel(f.saved[0].id),/unavailable/);
  assert.equal(f.saved.length,1);assert.equal(f.saved[0].state,'waking');
});

test('bulk selection of 120 unrelated conversations batches both Snooze and Unsnooze',async()=>{
  const f=fixture(),headers=Array.from({length:120},(_,i)=>f.header('independent-'+i));
  await f.service.snooze(headers,Date.now()+100000);
  assert.equal(f.saved.length,120);assert.equal(f.copyCount,3);
  await f.service.cancelMany(f.saved.map(job=>job.id));
  assert.equal(f.saved.length,0);assert.equal(f.copyCount,6);
  assert.equal(f.inbox.messages.length,120);
});
test('native move completion does not wait for delayed IMAP summary headers',async()=>{
  const f=fixture({delayedArrival:true}),a=f.header('delayed');
  await f.service.snooze([a],Date.now()+100000);
  const held=f.folders.find(folder=>folder.name==='Thunder-G Snoozed');
  assert.equal(f.saved[0].state,'sleeping');assert.equal(held.messages.length,1);
  assert.equal(held.pending.length,0);assert.equal(held.refreshes,1,'one background refresh populates the Snoozed view without polling');
  await f.service.cancel(f.saved[0].id);
  assert.equal(f.saved.length,0);assert.equal(f.inbox.pending.length,1);
  f.inbox.QueryInterface().updateFolderWithListener(null,{OnStopRunningUrl(){}});
  const restored=f.inbox.messages[0];f.listener.msgAdded(restored);
  assert.ok(Number(restored.getStringProperty('thunderGSnoozeReturned'))>0,'late Inbox headers still receive returned ordering metadata');
});

test('checking 120 sleeping conversations scans Inbox once per account',async()=>{
  const f=fixture();await f.service.snooze(Array.from({length:120},(_,i)=>f.header('scan-'+i)),Date.now()+100000);
  const messages=f.inbox.messages;let reads=0;
  Object.defineProperty(f.inbox,'messages',{configurable:true,get(){reads++;return messages},set(value){messages.splice(0,messages.length,...value)}});
  await f.service.check();assert.equal(reads,1);
});

test('retry reconciles a partial native batch without recopying its successful message',async()=>{
  const f=fixture(),a=f.header('partial-a'),b=f.header('partial-b',f.inbox,{refs:['partial-a']});
  f.failSource='Inbox';await assert.rejects(f.service.snooze([a,b],Date.now()+100000),/retried/);
  const held=f.folders.find(folder=>folder.name==='Thunder-G Snoozed');
  // Model a server-side partial success despite its aggregate error status.
  held.messages.push({...a,folder:held});f.inbox.messages=f.inbox.messages.filter(header=>header!==a);
  f.failSource=null;await f.service.check();
  assert.equal(f.saved[0].state,'sleeping');assert.equal(held.messages.length,2);
  assert.equal(f.copyCount,2);assert.equal(f.inbox.messages.length,0);
});
test('failed bulk Unsnooze retains reminders and a later retry clears them',async()=>{
  const f=fixture();await f.service.snooze([f.header('bulk-a'),f.header('bulk-b')],Date.now()+100000);
  f.failSource='Thunder-G Snoozed';await assert.rejects(f.service.cancelMany(f.saved.map(job=>job.id)),/failed/);
  assert.equal(f.saved.length,2);assert.equal(f.saved.every(job=>job.state==='waking'&&job.wakeReason==='cancel'),true);
  f.failSource=null;await f.service.check();assert.equal(f.saved.length,0);assert.equal(f.inbox.messages.length,2);
});

test('optional timing distinguishes queue, refresh, native copy and durable writes',async()=>{
  const events=[],f=fixture({onTiming:event=>events.push(event)});
  await f.service.snooze([f.header('timed')],Date.now()+100000);
  assert.equal(events.some(event=>event.phase==='folder-refresh'),true);
  f.folders.find(folder=>folder.name==='Thunder-G Snoozed').messages=[];
  await f.service.cancel(f.saved[0].id);
  for(const phase of ['queue-wait','folder-refresh','native-copy','journal-write'])assert.ok(events.some(event=>event.phase===phase),phase);
  assert.ok(events.every(event=>Number.isFinite(event.ms)&&event.ms>=0));
  assert.ok(events.every(event=>!('subject' in event)&&!('account' in event)&&!('id' in event)));
  const broken=fixture({onTiming(){throw Error('diagnostic observer failed')}});
  await broken.service.snooze([broken.header('still-works')],Date.now()+100000);
  assert.equal(broken.saved[0].state,'sleeping');
});

test('indexed Snooze headers refresh the offline view while Unsnooze keeps cached Inbox fast',async()=>{
  const f=fixture();await f.service.snooze([f.header('fast')],Date.now()+100000);
  const held=f.folders.find(folder=>folder.name==='Thunder-G Snoozed');
  await f.service.cancel(f.saved[0].id);
  assert.equal(f.inbox.refreshes,0);assert.equal(held.refreshes,1);
  assert.equal(f.saved.length,0);assert.equal(f.inbox.messages.length,1);
});

test('restart recovery refreshes even cached headers before accepting an interrupted move',async()=>{
  const f=fixture();await f.service.snooze([f.header('recover-indexed')],Date.now()+100000);
  const held=f.folders.find(folder=>folder.name==='Thunder-G Snoozed');
  f.rewriteJournal(jobs=>{jobs[0].state='preparing';delete jobs[0].messages[0].hidden;return jobs});
  const next=f.restart();await next.check();
  assert.equal(f.saved[0].state,'sleeping');assert.equal(held.refreshes,2);
  assert.equal(f.copyCount,1,'a recovered successful move is not repeated');
  await next.cancel(f.saved[0].id);assert.equal(held.refreshes,2,'normal Unsnooze is fast again after recovery');next.close();
});
test('retry after a native move error still refreshes the destination',async()=>{
  const f=fixture();f.failSource='Inbox';await assert.rejects(f.service.snooze([f.header('retry-fast')],Date.now()+100000),/retried/);
  const held=f.folders.find(folder=>folder.name==='Thunder-G Snoozed');assert.equal(held.refreshes,0);
  f.failSource=null;await f.service.check();assert.ok(held.refreshes>0);assert.equal(f.saved[0].state,'sleeping');
});

test('a stalled background Snoozed refresh does not delay or duplicate accepted moves',{timeout:1000},async()=>{
  const f=fixture({delayedArrival:true,stalledRefresh:true});
  await f.service.snooze(Array.from({length:5},(_,i)=>f.header('background-'+i)),Date.now()+100000);
  const held=f.folders.find(folder=>folder.name==='Thunder-G Snoozed');
  assert.equal(f.saved.length,5);assert.ok(f.saved.every(job=>job.state==='sleeping'));
  assert.equal(f.copyCount,1);assert.equal(held.refreshes,1,'one refresh per destination batch');
  assert.equal(held.messages.length,5);f.service.close();
});
