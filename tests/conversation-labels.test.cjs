const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(){
 const folders=[],writes=[],timers=new Map(),listeners=new Set(),definitions=[{key:'project',tag:'Project'},{key:'team',tag:'Team'},{key:'$label1',tag:'Legacy'}];let sequence=0;
 const mail={accounts:{allFolders:folders,allIdentities:[]},tags:{getAllTags:()=>definitions},mfn:{addListener(listener){listeners.add(listener)},removeListener(listener){listeners.delete(listener)}}};
 const clock={setTimeout(fn){timers.set(++sequence,fn);return sequence},clearTimeout(id){timers.delete(id)}};
 const scope=require('./localization-context.cjs').createContext({MailServices:mail,console,Ci:{nsMsgFolderFlags:{Drafts:1,Inbox:2,SentMail:4},nsIMsgFolderNotificationService:{msgAdded:1,msgsClassified:2}}});
 for(const name of ['labels.js','reading.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g',name),'utf8'),scope);
 function folder(uri,owner='account',flags=0){
  const headers=[];
  const folder={URI:uri,rootFolder:{URI:owner},headers,isSpecialFolder:flag=>!!(flags&flag),
   msgDatabase:{getMsgHdrForMessageID:id=>headers.find(header=>header.messageId===id),getThreadContainingMsgHdr:header=>{
    const members=header.thread || [header];return {threadKey:members[0].messageKey,numChildren:members.length,getChildHdrAt:i=>members[i]};
   }},addKeywordsToMessages(items,keywords){writes.push({folder,items:[...items],keywords});for(const header of items)for(const key of keywords.split(' '))header.keys.add(key)},
   removeKeywordsFromMessages(items,keywords){for(const header of items)for(const key of keywords.split(' '))header.keys.delete(key)}};
  folders.push(folder);return folder;
 }
 function message(folder,id,refs=[],keys=[]){const header={folder,messageId:id,messageKey:folder.headers.length+1,numReferences:refs.length,getStringReference:i=>refs[i],keys:new Set(keys),getStringProperty:()=>[...header.keys].join(' ')};folder.headers.push(header);return header;}
 function flush(){let count=0;while(timers.size){assert.ok(++count<30,'queue drains without notification loops');const [id,fn]=timers.entries().next().value;timers.delete(id);fn();}}
 return {scope,mail,clock,folders,writes,timers,listeners,folder,message,flush};
}

test('label scope follows references, native threads and physical copies across folders, never matching subjects or other accounts',()=>{
 const f=fixture(),inbox=f.folder('inbox'),sent=f.folder('sent'),archive=f.folder('archive'),other=f.folder('other','second-account');
 const root=f.message(archive,'root'),reply=f.message(sent,'reply',['root']),incoming=f.message(inbox,'incoming',['root','reply']);
 const sibling=f.message(archive,'sibling',['root']);root.thread=[root,sibling];sibling.thread=root.thread;
 const copy=f.message(inbox,'root');const unrelated=f.message(inbox,'unrelated');const foreign=f.message(other,'root');
 const result=f.scope.conversationLabelScope([incoming]);
 assert.equal(result.length,5);for(const header of [incoming,root,reply,sibling,copy])assert.ok(result.includes(header));
 assert.ok(!result.includes(unrelated));assert.ok(!result.includes(foreign));
 assert.ok(!f.scope.conversationPhysicalMessages([root],[other]).includes(foreign),'physical-copy expansion also respects account boundaries');
});

test('new unread follow-up inherits the union without removing old assignments, legacy tags or internal flags',()=>{
 const f=fixture(),inbox=f.folder('inbox'),sent=f.folder('sent');
 const root=f.message(inbox,'root',[],['project','$Junk']),reply=f.message(sent,'reply',['root'],['team']);reply.label=1;
 const incoming=f.message(inbox,'incoming',['root','reply'],['existing-undefined']);incoming.isRead=false;
 const controller=f.scope.installConversationLabelInheritance(f.mail,f.clock,f.scope.Ci);
 assert.equal(f.writes.length,0,'installation never rewrites existing mailbox labels');
 const listener=[...f.listeners][0];listener.msgAdded(incoming);listener.msgAdded(incoming);
 assert.equal(f.timers.size,1,'deduplicate arrivals before processing');f.flush();
 for(const header of [root,reply,incoming])for(const key of ['project','team'])assert.ok(header.keys.has(key));
 assert.ok(incoming.keys.has('$label1'));assert.equal(reply.label,1);
 assert.ok(root.keys.has('$Junk'));assert.ok(!incoming.keys.has('$Junk'));
 assert.ok(incoming.keys.has('existing-undefined'));assert.equal(incoming.isRead,false);
 const before=f.writes.length;listener.msgsClassified([incoming]);f.flush();assert.equal(f.writes.length,before,'classification retries do not repeat keyword writes');
 controller.close();assert.equal(f.listeners.size,0);
});

test('standalone mail, drafts and shutdown do not produce unintended label assignments',()=>{
 const f=fixture(),inbox=f.folder('inbox'),drafts=f.folder('drafts','account',1);
 const root=f.message(inbox,'root',[],['project']),unrelated=f.message(inbox,'unrelated'),draft=f.message(drafts,'draft',['root']);
 const controller=f.scope.installConversationLabelInheritance(f.mail,f.clock,f.scope.Ci),listener=[...f.listeners][0];
 listener.msgAdded(draft);assert.equal(f.timers.size,0);
 listener.msgAdded(unrelated);f.flush();assert.equal(f.writes.length,0);
 listener.msgAdded(f.message(inbox,'reply',['root']));assert.equal(f.timers.size,1);
 controller.close();assert.equal(f.timers.size,0);listener.msgAdded(root);assert.equal(f.timers.size,0);
});

test('all explicit label operations cover the conversation, clear legacy labels, and preserve other labels',()=>{
 const f=fixture(),inbox=f.folder('inbox'),sent=f.folder('sent');
 const root=f.message(inbox,'root',[],['project','team']),reply=f.message(sent,'reply',['root'],['team']);root.label=1;reply.label=1;
 f.scope.applyConversationLabel([reply],'project',true);assert.ok(root.keys.has('project'));assert.ok(reply.keys.has('project'));
 f.scope.applyConversationLabel([reply],'project',false);for(const header of [root,reply]){assert.ok(!header.keys.has('project'));assert.ok(header.keys.has('team'));}
 f.scope.applyConversationLabel([reply],'$label1',false);assert.equal(root.label,0);assert.equal(reply.label,0);
});

test('native tag and remove-all commands target conversation scope and restore original commands on disable',()=>{
 const f=fixture(),inbox=f.folder('inbox'),sent=f.folder('sent'),root=f.message(inbox,'root',[],['team']),reply=f.message(sent,'reply',['root']);
 const original=()=>assert.fail('single-message native writer must not run');
 const win={gDBView:{getSelectedMsgHdrs:()=>[reply]},commandController:{_toggleMessageTag:original,_removeAllMessageTags:original}};
 // Notice presentation has separate UI tests. Capture scope without a DOM here.
 const applied=[];f.scope.applyConversationLabel=(messages,key,add)=>{
  const scope=f.scope.conversationLabelScope(messages);applied.push({scope,key,add});
 };
 const controller=f.scope.installConversationLabelCommands(win);
 win.commandController._toggleMessageTag('project',true);assert.equal(applied[0].scope.length,2);assert.equal(applied[0].key,'project');
 win.commandController._removeAllMessageTags();assert.equal(applied[1].key,'team');assert.equal(applied[1].scope.length,2);assert.equal(applied[1].add,false);
 controller.close();assert.equal(win.commandController._toggleMessageTag,original);assert.equal(win.commandController._removeAllMessageTags,original);
});


test('automatic inheritance rejects unrelated native-thread members and never removes the existing project label',()=>{
 const f=fixture(),inbox=f.folder('inbox'),sent=f.folder('sent');
 const definitions=f.mail.tags.getAllTags();definitions.push({key:'unine-urbino',tag:'unine-urbino'},{key:'visiting-phd/fernando',tag:'visiting-phd/fernando'},{key:'circula',tag:'fns/circula'});
 // Redacted header-only reproduction: one parent reference, as in the supplied email.
 const rootId='project-announcement@university.test';
 const incoming=f.message(inbox,'project-reply@example.test',[rootId],['circula']);
 const root=f.message(sent,rootId,[],['circula']);
 const unrelated=f.message(inbox,'unrelated-message',[],['unine-urbino','visiting-phd/fernando']);
 incoming.thread=[incoming,unrelated];unrelated.thread=incoming.thread;
 const controller=f.scope.installConversationLabelInheritance(f.mail,f.clock,f.scope.Ci),listener=[...f.listeners][0];
 listener.msgAdded(incoming);f.flush();
 assert.deepEqual([...incoming.keys],['circula']);assert.deepEqual([...root.keys],['circula']);
 assert.deepEqual([...unrelated.keys],['unine-urbino','visiting-phd/fernando']);assert.equal(f.writes.length,0,'native grouping alone cannot cause automatic label writes');
 controller.close();
});

test('strict inheritance retains valid cross-folder ancestors, siblings and descendants with exact reference links',()=>{
 const f=fixture(),inbox=f.folder('inbox'),archive=f.folder('archive'),sent=f.folder('sent');
 const root=f.message(archive,'root',[],['project']),sibling=f.message(archive,'sibling',['root'],['team']);root.thread=[root,sibling];sibling.thread=root.thread;
 const outgoing=f.message(sent,'outgoing',['root']),incoming=f.message(inbox,'incoming',['root','outgoing']);
 const members=f.scope.conversationLabelScope([incoming],null,{requireReferences:true});
 assert.equal(members.length,4);for(const header of [root,sibling,outgoing,incoming])assert.ok(members.includes(header));
 f.scope.inheritConversationLabels(members,f.mail);
 for(const header of members){assert.ok(header.keys.has('project'));assert.ok(header.keys.has('team'));}
});
