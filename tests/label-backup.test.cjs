const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../thunder-g/label-backup.js'),'utf8');
const scope=require('./localization-context.cjs').createContext({});vm.runInContext(code,scope);
const plain=value=>JSON.parse(JSON.stringify(value));
const date='2026-10-29T12:00:00.000Z';
const label=(key='work',name='Work',extra={})=>({key,name,color:'#123456',ordinal:'',sidebar:'show',messageList:true,...extra});
const account=(id='source',extra={})=>({id,type:'imap',host:'imap.gmail.com',user:'person@gmail.com',...extra});
const message=(messageId='one@example.invalid',extra={})=>({account:'source',folder:'INBOX',messageId,labels:['work'],ref:'native:'+messageId,...extra});
const snapshot=(extra={})=>({labels:[label()],accounts:[account()],messages:[message()],...extra});
const create=(value=snapshot())=>plain(scope.labelBackupCreate(value,date));
const backup=()=>create().backup;
const plan=(value=backup(),target=snapshot())=>plain(scope.labelBackupPlan(value,target));
const parse=value=>plain(scope.labelBackupParse(typeof value==='string'?value:JSON.stringify(value)));

test('one portable file preserves definitions, hierarchy, visibility and exact message bindings without bodies or credentials',()=>{
 const source=snapshot({labels:[label('nested','Work/Study',{sidebar:'unread',messageList:false,ordinal:'007'})],messages:[message('<OriginalCase@EXAMPLE.invalid>',{labels:['nested'],subject:'PRIVATE SUBJECT',body:'PRIVATE BODY',password:'PRIVATE PASSWORD'})]});
 const result=create(source);
 assert.equal(result.backup.format,'thunder-g-label-backup');assert.equal(result.backup.version,1);
 assert.deepEqual(result.backup.labels,source.labels);
 assert.deepEqual(result.backup.assignments,[{account:'source',folder:'INBOX',messageId:'OriginalCase@EXAMPLE.invalid',labels:['nested']}]);
 assert.deepEqual(result.counts,{labels:1,accounts:1,assignments:1,skippedMissingIds:0,skippedAmbiguous:0,skippedUnlabelled:0});
 const text=JSON.stringify(result.backup);assert.ok(!text.includes('PRIVATE'));assert.ok(!text.includes('native:'));
 assert.deepEqual(parse(text),result.backup);
});

test('export is deterministic and excludes unlabelled, unidentified and same-folder ambiguous messages',()=>{
 const source=snapshot({accounts:[account(),account('unused',{user:'other@gmail.com'})],messages:[message('z@example.invalid'),message('a@example.invalid'),message('',{labels:['work']}),message('unlabelled@example.invalid',{labels:[]}),message('dup@example.invalid'),message('<dup@example.invalid>')]});
 const result=create(source);
 assert.equal(result.backup.assignments.length,2);assert.deepEqual(result.backup.assignments.map(row=>row.messageId),['a@example.invalid','z@example.invalid']);
 assert.equal(result.counts.skippedMissingIds,1);assert.equal(result.counts.skippedUnlabelled,1);assert.equal(result.counts.skippedAmbiguous,2);
 assert.equal(result.backup.accounts.length,1,'do not disclose accounts with no exported assignments');
 assert.deepEqual(create({...source,messages:[...source.messages].reverse()}).backup,result.backup);
});

test('a fresh profile restores stable keys and adds tags without removing existing message labels',()=>{
 const target=snapshot({labels:[label('personal','Personal')],accounts:[account('new-native-id')],messages:[message('one@example.invalid',{account:'new-native-id',ref:'new-folder-uri#42',labels:['personal']})]});
 const result=plan(backup(),target);
 assert.deepEqual(result.labelsToCreate,[label()]);assert.equal(result.counts.create,1);assert.equal(result.counts.restore,1);
 assert.deepEqual(result.assignmentsToApply,[{ref:'new-folder-uri#42',keys:['work'],account:'new-native-id',folder:'INBOX',messageId:'one@example.invalid'}]);
 assert.deepEqual(target.messages[0].labels,['personal']);assert.deepEqual(target.labels,[label('personal','Personal')],'planning never mutates target state');
});

test('identical names under a different key map explicitly while preserving local colors, ordering and visibility',()=>{
 const target=snapshot({labels:[label('existing-key','Work',{color:'#abcdef',ordinal:'05',sidebar:'hide',messageList:false})],messages:[message('one@example.invalid',{labels:['unrelated']})]});
 const result=plan(backup(),target);
 assert.equal(result.counts.reuse,1);assert.equal(result.counts.conflict,0);assert.equal(result.labelsToCreate.length,0);
 assert.equal(result.labelRows[0].targetKey,'existing-key');assert.equal(result.labelRows[0].keptLocalMetadata,true);
 assert.match(result.labelRows[0].reason,/different local key/);assert.deepEqual(result.assignmentsToApply[0].keys,['existing-key']);
});

test('same-key different-name and normalized-name collisions are reported without silently overwriting labels',()=>{
 for(const labels of [[label('work','Personal')],[label('other','work')],[label('a','Work'),label('b','Work')]]){
  const result=plan(backup(),snapshot({labels,messages:[message('one@example.invalid',{labels:[]})]}));
  assert.equal(result.counts.conflict,1);assert.equal(result.counts.blocked,1);assert.equal(result.assignmentsToApply.length,0);assert.equal(result.labelsToCreate.length,0);
 }
 const value=backup();value.labels.push(label('second','WORK'));
 const result=plan(value,snapshot({labels:[],messages:[]}));assert.equal(result.counts.conflict,2);
});

test('restoration is idempotent and never reassigns a tag already present',()=>{
 const result=plan();assert.equal(result.counts.alreadyApplied,1);assert.equal(result.counts.matched,1);assert.equal(result.assignmentsToApply.length,0);
 const value=backup();value.labels.push(label('study','Study'));value.assignments[0].labels.push('study');
 const next=plan(value,snapshot());assert.deepEqual(next.assignmentsToApply[0].keys,['study']);assert.equal(next.counts.tagApplications,1);
});

test('accounts must match exactly before Message-ID lookup; host or non-Gmail username differences never fall back',()=>{
 for(const changed of [{host:'other.example.invalid'},{user:'other@gmail.com'}]){
  const result=plan(backup(),snapshot({accounts:[account('source',changed)],messages:[message('one@example.invalid',{labels:[]})]}));
  assert.equal(result.counts.missing,1);assert.equal(result.counts.matched,0);assert.equal(result.assignmentsToApply.length,0);
 }
 const source=snapshot({accounts:[account('source',{host:'mail.example.invalid',user:'CaseSensitive'})]});
 assert.equal(plan(create(source).backup,snapshot({accounts:[account('source',{host:'mail.example.invalid',user:'casesensitive'})]})).counts.missing,1);
 const gmail=plan(backup(),snapshot({accounts:[account('new',{host:'IMAP.GOOGLEMAIL.COM.',user:'PERSON@gmail.com'})],messages:[message('one@example.invalid',{account:'new',labels:[]})]}));
 assert.equal(gmail.counts.matched,1);assert.equal(gmail.counts.restore,1);
});

test('same IDs in another account or folder cannot satisfy a missing message; native UIDs are not identifiers',()=>{
 const result=plan(backup(),snapshot({messages:[message('different@example.invalid',{ref:'native:1',labels:[]}),message('one@example.invalid',{folder:'Archive',labels:[]}),message('one@example.invalid',{account:'different-account',labels:[]})]}));
 assert.equal(result.counts.missing,1);assert.equal(result.counts.restore,0);
 const changedCase=plan(backup(),snapshot({messages:[message('One@example.invalid',{labels:[]})]}));
 assert.equal(changedCase.counts.missing,1,'do not case-fold a Message-ID local part');
});

test('duplicate accounts or same-folder Message-IDs are ambiguous and never first-match',()=>{
 const duplicateAccounts=plan(backup(),snapshot({accounts:[account('a'),account('b')],messages:[message('one@example.invalid',{account:'a',labels:[]})]}));
 assert.equal(duplicateAccounts.counts.ambiguous,1);assert.equal(duplicateAccounts.counts.restore,0);
 const duplicateMessages=plan(backup(),snapshot({messages:[message('one@example.invalid',{ref:'a',labels:[]}),message('<one@example.invalid>',{ref:'b',labels:[]})]}));
 assert.equal(duplicateMessages.counts.ambiguous,1);assert.equal(duplicateMessages.counts.restore,0);
});

test('Gmail copies in different labelled folders remain independent, valid scoped assignments',()=>{
 const source=snapshot({messages:[message('one@example.invalid'),message('one@example.invalid',{folder:'Work'})]});
 const result=create(source);assert.equal(result.counts.assignments,2);assert.equal(result.counts.skippedAmbiguous,0);
 const target=snapshot({messages:[message('one@example.invalid',{labels:[]}),message('one@example.invalid',{folder:'Work',ref:'work-copy',labels:[]})]});
 assert.equal(plan(result.backup,target).counts.restore,2);
});

test('strict versioned validation rejects malformed, orphaned, duplicated and extra fields',()=>{
 const mutations=[
  value=>value.version=2,value=>value.format='another-app',value=>value.createdAt='today',
  value=>value.createdAt='2026-02-30T00:00:00.000Z',value=>value.accounts[0].password='secret',
  value=>value.labels[0].color='url(x)',value=>value.labels[0].messageList='yes',value=>value.labels[0].sidebar='execute',
  value=>value.labels[0].name='Work//Study',value=>value.labels[0].name=' Work',value=>value.labels[0].key='with space',
  value=>value.assignments[0].account='unknown',value=>value.assignments[0].labels=['unknown'],value=>value.assignments[0].messageId='',
  value=>value.assignments[0].labels=['work','work'],value=>value.assignments.push({...value.assignments[0]}),
  value=>value.labels.push({...value.labels[0]}),value=>value.accounts.push({...value.accounts[0]}),
  value=>value.labels[0].name='bad\ud800',value=>value.assignments[0].folder='bad\u0000folder',
 ];
 for(const mutate of mutations){const value=backup();mutate(value);assert.throws(()=>parse(value),/backup|version/);}
 for(const text of ['null','[]','{','{}'])assert.throws(()=>parse(text),/backup/);
});

test('label keys are IMAP-safe atoms, never system flags or raw protocol syntax',()=>{
 const unsafe=['\\Deleted','\\Seen','\\Flagged','\\deleted','\\sEeN','WORK','Work',')','(','bad"tag','bad\\tag','bad[tag','bad]tag','bad{tag','bad}tag','bad%tag','bad*tag','bad tag','bad\ttag','café','研究'];
 for(const key of unsafe){
  const value=backup();value.labels[0].key=key;value.assignments[0].labels=[key];
  assert.throws(()=>parse(value),/Invalid label backup/);
  assert.throws(()=>create(snapshot({labels:[label(key)],messages:[message('one@example.invalid',{labels:[key]})]})),/Invalid label backup/,'export rejects unsafe native keys too');
  assert.throws(()=>plan(backup(),snapshot({labels:[label(key)],messages:[message('one@example.invalid',{labels:[]})]})),/Invalid label backup/,'unsafe target keys never reach native sinks');
 }
 for(const key of ['$label1','&ao8-','&x-moz-00112233445566778899aabbccddeeff','project=20notes','folder/name_with:legacy+syntax','legacy'.repeat(60)]){
  const value=backup();value.labels[0].key=key;value.assignments[0].labels=[key];
  assert.equal(parse(value).labels[0].key,key);
  const result=plan(value,snapshot({labels:[],messages:[message('one@example.invalid',{labels:[]})]}));assert.deepEqual(result.assignmentsToApply[0].keys,[key]);
 }
});

test('prototype-looking values are inert and prototype properties in records are rejected',()=>{
 const value=backup();value.labels[0].key='__proto__';value.labels[0].name='constructor';value.assignments[0].labels=['__proto__'];
 const result=plan(parse(value),snapshot({labels:[],messages:[message('one@example.invalid',{labels:[]})]}));
 assert.equal(result.counts.create,1);assert.deepEqual(result.assignmentsToApply[0].keys,['__proto__']);assert.equal({}.polluted,undefined);
 const text=JSON.stringify(backup()).replace('"version":1','"version":1,"__proto__":{"polluted":true}');
 assert.throws(()=>parse(text),/backup/);assert.equal({}.polluted,undefined);
 const path=backup();path.assignments[0].folder='../../private';assert.equal(plan(path,snapshot()).counts.missing,1,'paths are compared as opaque mailbox identities, never opened');
});

test('file and record limits bound hostile inputs, including multibyte JSON',()=>{
 assert.throws(()=>parse(' '.repeat(16*1024*1024+1)),/too large/);
 assert.throws(()=>parse('é'.repeat(8*1024*1024+1)),/too large/);
 for(const [field,length] of [['labels',10001],['accounts',101],['assignments',200001]]){
  const value=backup();value[field]=Array(length).fill(value[field][0]);assert.throws(()=>scope.labelBackupValidate(value),/Too many/);
 }
 const value=backup();value.assignments[0].labels=Array(1001).fill('work');assert.throws(()=>parse(value),/Too many/);
});

test('preview fingerprints detect metadata, membership and tag changes but ignore native UID rebuilds and unrelated mail',()=>{
 const target=snapshot({messages:[message('one@example.invalid',{labels:[]})]});
 const fingerprint=value=>scope.labelBackupFingerprint(scope.labelBackupPlan(backup(),value));
 const original=fingerprint(target);
 assert.notEqual(fingerprint({...target,labels:[label('work','Work',{color:'#ffffff'})]}),original);
 assert.notEqual(fingerprint({...target,messages:[message('one@example.invalid')]}),original);
 assert.notEqual(fingerprint({...target,messages:[]}),original);
 assert.equal(fingerprint({...target,messages:[{...target.messages[0],ref:'new-native-uid#5432'}]}),original);
 assert.equal(fingerprint({...target,messages:[message('unrelated@example.invalid'),...target.messages].reverse()}),original);
});
