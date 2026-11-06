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
