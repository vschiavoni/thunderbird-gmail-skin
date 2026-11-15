const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function scope(){const s=vm.createContext({Map,Set,Date,JSON});vm.runInContext(fs.readFileSync('thunder-g/label-suggestions.js','utf8'),s);return s;}
const tags=[{key:'ml',tag:'Teaching/Machine learning'},{key:'travel',tag:'Travel'}];
const record=(key,extra={})=>({key,account:'account',id:key+'@example.test',references:[],labels:[],people:['alice@example.test'],subject:'Neural seminar schedule',...extra});
function training(){return [record('train1',{labels:['ml']}),record('train2',{labels:['ml']}),record('other1',{labels:['travel'],people:['bob@example.test'],subject:'Flight booking itinerary'}),record('other2',{labels:['travel'],people:['bob@example.test'],subject:'Flight booking itinerary'})];}
function analyze(s,rows,selected=['target'],extra={}){return s.analyzeLabelSuggestions(rows,new Set(selected),tags,{yieldControl:async()=>{},...extra});}
test('learns only existing labels from separate conversations, leaves all input assignments unchanged',async()=>{
 const s=scope(),rows=[...training(),record('target')],before=JSON.stringify(rows),report=await analyze(s,rows);
 assert.equal(report.results.length,1);assert.equal(report.results[0].status,'suggested');assert.equal(report.results[0].labelKey,'ml');
 assert.equal(report.results[0].examples,2);assert.equal(JSON.stringify(rows),before);
});
test('any labeled member of a selected conversation prevents a proposal, including Sent copies and legacy tags',async()=>{
 const s=scope(),target=record('target'),sent=record('sent',{id:target.id,labels:['travel']}),reply=record('reply',{references:[target.id]});
 const report=await analyze(s,[...training(),target,sent,reply],['target','reply']);assert.equal(report.results.length,1);assert.equal(report.results[0].status,'skipped');assert.match(report.results[0].reason,/already/);
});
test('References connect siblings across folders but subjects and participants never define conversation membership',async()=>{
 const s=scope(),a=record('target',{references:['root@external']}),b=record('sibling',{references:['root@external'],labels:['travel']}),unrelated=record('separate');
 const report=await analyze(s,[...training(),a,b,unrelated],['target','separate']);assert.equal(report.results.length,2);
 assert.equal(report.results.find(r=>r.messageKeys.includes('target')).status,'skipped');assert.equal(report.results.find(r=>r.messageKeys.includes('separate')).status,'suggested');
});
test('accounts are isolated even for identical IDs and identical subjects',async()=>{
 const s=scope(),rows=[...training(),record('target'),record('copy',{account:'different',id:'target@example.test',labels:['travel']})];
 const report=await analyze(s,rows);assert.equal(report.results[0].labelKey,'ml');
 const other=await analyze(s,[...training(),record('target',{account:'different'})]);assert.equal(other.results[0].status,'skipped');
});
test('missing IDs, unknown evidence, single-example labels and ambiguous matches abstain',async()=>{
 const s=scope();
 for(const rows of [[...training(),record('target',{id:''})],[...training(),record('target',{people:['unknown@other'],subject:'Unrelated potato'})],[record('train1',{labels:['ml']}),record('target')],[...training().map(r=>({...r,labels:['ml','travel']})),record('target')]]){
  const report=await analyze(s,rows);assert.equal(report.results[0].status,'skipped');
 }
});
test('training counts unique conversations rather than message copies and excludes selected examples',async()=>{
 const s=scope(),one=record('train1',{labels:['ml']}),copy=record('copy',{id:one.id,labels:['ml']});
 const report=await analyze(s,[one,copy,record('target')]);assert.equal(report.training,1);assert.equal(report.results[0].status,'skipped');
 const selected=await analyze(s,[...training(),record('target')],['target','train1']);assert.equal(selected.results.find(r=>r.messageKeys.includes('target')).status,'skipped');
});
test('dry-run makes zero persistent writes and Run stores only separate tentative proposals',async()=>{
 const s=scope(),report=await analyze(s,[...training(),record('target')]),writes=[];
 const prefs={setStringPref:(...args)=>writes.push(args)};
 const dry=s.saveLabelSuggestionReport(prefs,report,true);assert.equal(dry.proposals.length,1);assert.equal(writes.length,0);
 s.saveLabelSuggestionReport(prefs,report,false);assert.equal(writes.length,1);assert.equal(writes[0][0],'extensions.thunderg.experimentalLabelSuggestions');
 const saved=JSON.parse(writes[0][1]);assert.equal(saved.version,1);assert.equal(saved.proposals[0].labelKey,'ml');assert.equal(saved.proposals[0].subject,undefined);
});
test('cancellation is checked during scanning and analysis, which yield to the UI',async()=>{
 const s=scope();let yields=0;const signal={aborted:false};
 const rows=Array.from({length:500},(_,i)=>record('row'+i));
 await assert.rejects(()=>analyze(s,rows,['row499'],{signal,yieldControl:async()=>{yields++;signal.aborted=true}}),/canceled/);assert.equal(yields,1);
});
function fixture(){
 const s=scope(),account={URI:'account'},folder={URI:'folder',rootFolder:account,flags:0},values=[];
 const header=(n,extra={})=>({folder,messageKey:n,messageId:'id'+n,numReferences:0,label:0,mime2DecodedAuthor:'Alice <alice@example.test>',mime2DecodedSubject:'Neural seminar schedule',getStringProperty:()=>'',...extra});
 values.push(header(1),header(2));folder.messages=values;
 const mail={tags:{getAllTags:()=>tags},accounts:{allFolders:[folder],allIdentities:[]},headerParser:{extractHeaderAddressMailboxes:()=> 'alice@example.test'}};
 const environment={signal:{aborted:false},maxHeaders:1000,virtualFlag:32,yieldControl:async()=>{},progress(){}};
 return {s,folder,values,header,mail,environment};
}
test('native snapshot reads headers only, includes legacy labels, excludes other accounts and virtual folders',async()=>{
 const f=fixture();f.values[0].label=1;f.mail.tags.getAllTags=()=>[...tags,{key:'$label1',tag:'Legacy'}];
 f.mail.accounts.allFolders.push({URI:'other',rootFolder:{URI:'other-account'},get messages(){throw Error('must not read other accounts')}},{URI:'virtual',rootFolder:f.folder.rootFolder,flags:32,get messages(){throw Error('must not read virtual')}});
 const snapshot=await f.s.collectLabelSuggestionRecords([f.values[0]],f.mail,f.environment);
 assert.equal(snapshot.records.length,2);assert.deepEqual(Array.from(snapshot.records[0].labels),['$label1']);
 assert.equal(f.values[0].label,1);assert.equal(snapshot.records[0].body,undefined);
});
test('unavailable folders and bounded header limits fail closed rather than claiming an unlabeled conversation',async()=>{
 const f=fixture();f.mail.accounts.allFolders.push({URI:'missing',rootFolder:f.folder.rootFolder,get messages(){throw Error('offline summary')}});
 await assert.rejects(()=>f.s.collectLabelSuggestionRecords([f.values[0]],f.mail,f.environment),/could not be read/);
 f.mail.accounts.allFolders.pop();f.environment.maxHeaders=1;
 await assert.rejects(()=>f.s.collectLabelSuggestionRecords([f.values[0]],f.mail,f.environment),/limit/);
});
test('training feature size is bounded and signatures/banners cannot enter header-only features',()=>{
 const s=scope(),features=s.labelSuggestionFeatures([record('long',{subject:Array.from({length:500},(_,n)=>'token'+n).join(' '),body:'secret signature marker'})]);
 assert.ok(features.size<=64);assert.equal(features.has('word:secret'),false);
 const own=s.labelSuggestionFeatures([record('own')],new Set(['alice@example.test']));assert.equal(own.has('person:alice@example.test'),false);
});
test('malformed referenced members are retained and make the selected conversation ineligible',async()=>{
 const s=scope(),target=record('target'),malformed=record('broken',{id:'',references:[target.id]});
 const report=await analyze(s,[...training(),target,malformed]);assert.equal(report.results[0].status,'skipped');assert.match(report.results[0].reason,/incomplete/);
});
test('oversized conversation and recipients are bounded and cannot produce misleading proposals',async()=>{
 const s=scope(),target=record('target');
 const rows=[...training(),target,...Array.from({length:1001},(_,i)=>record('copy'+i,{references:[target.id]}))];
 const report=await analyze(s,rows);assert.equal(report.results[0].status,'skipped');assert.match(report.results[0].reason,/1,000/);
 const features=s.labelSuggestionFeatures([record('many',{people:Array.from({length:1000},(_,i)=>'person'+i+'@example.test')})]);assert.equal(features.size,64);
});
test('only the experimental preference writer exists; native tag APIs are never invoked',async()=>{
 const f=fixture();let writes=0;
 f.mail.tags.addTag=()=>{throw Error('must not create labels')};f.folder.addKeywordsToMessages=()=>{throw Error('must not assign labels')};
 f.values[0].setStringProperty=()=>{throw Error('must not modify native properties')};
 f.values[0].getStringProperty=()=>{return 'ml'};
 const snapshot=await f.s.collectLabelSuggestionRecords([f.values[1]],f.mail,f.environment);
 const before=JSON.stringify(snapshot.records);
 const report=await f.s.analyzeLabelSuggestions(snapshot.records,new Set([snapshot.records[1].key]),snapshot.tags,{yieldControl:async()=>{}});
 f.s.saveLabelSuggestionReport({setStringPref(){writes++}},report,true);assert.equal(writes,0);assert.equal(JSON.stringify(snapshot.records),before);
});
test('training evidence scores do not use participants or label examples from another account',async()=>{
 const s=scope(),base=[...training(),record('target')],first=await analyze(s,base);
 const extra=Array.from({length:50},(_,i)=>record('otherAccount'+i,{account:'other',labels:['travel']}));
 const second=await analyze(s,[...base,...extra]);assert.equal(first.results[0].score,second.results[0].score);assert.equal(first.results[0].labelKey,second.results[0].labelKey);
});

test('a 100-conversation selection is fully analyzed rather than silently ignored',async()=>{
 const s=scope(),targets=Array.from({length:100},(_,i)=>record('selected'+i));let yields=0;
 const report=await analyze(s,[...training(),...targets],targets.map(row=>row.key),{yieldControl:async()=>{yields++}});
 assert.equal(report.results.length,100);assert.ok(report.results.every(row=>row.status==='suggested'));assert.ok(yields>=100);
});
function reviewFixture(){
 const f=fixture();f.values[1].numReferences=1;f.values[1].getStringReference=()=>f.values[0].messageId;
 const sets=new Map(f.values.map(header=>[header.messageKey,new Set()]));for(const header of f.values)header.getStringProperty=()=>[...sets.get(header.messageKey)].join(' ');
 f.folder.msgDatabase={getMsgHdrForKey:key=>f.values.find(header=>header.messageKey===key)};
 const proposal={account:'account',conversationKey:'previous-root',labelKey:'ml',labelName:'Teaching/Machine learning',messageIds:['id1','id2'],messageKeys:f.values.map(header=>f.s.labelSuggestionHeaderKey(header))};
 const writes=[];const write=(headers,key,add)=>{writes.push({headers,key,add});for(const header of headers){const values=sets.get(header.messageKey);if(add)values.add(key);else values.delete(key);}};
 return {...f,sets,proposal,writes,write,async prepare(){const map=await f.s.prepareLabelSuggestionConfirmations([proposal],f.mail,f.environment);return map.get(f.s.labelSuggestionProposalKey(proposal));}};
}
test('confirmation prepares the full current References conversation including newly arrived replies',async()=>{
 const f=reviewFixture(),next=f.header(3,{numReferences:1,getStringReference:()=> 'id1',getStringProperty:()=>''});f.values.push(next);f.sets.set(3,new Set());
 const prepared=await f.prepare();assert.equal(prepared.status,'ready');assert.equal(prepared.records.length,3);assert.equal(f.writes.length,0);
 const outcome=f.s.confirmPreparedLabelSuggestion(prepared,f.mail,f.write);assert.equal(outcome.status,'confirmed');assert.equal(f.writes.length,1);assert.equal(f.writes[0].headers.length,3);
 for(const values of f.sets.values())assert.equal(values.has('ml'),true);
});
test('confirmation never overwrites labels already present or added after the snapshot',async()=>{
 const f=reviewFixture();f.sets.get(2).add('travel');const blocked=await f.prepare();assert.equal(blocked.status,'skipped');assert.match(blocked.reason,/already/);assert.equal(f.writes.length,0);
 f.sets.get(2).clear();const prepared=await f.prepare();f.sets.get(1).add('travel');
 const outcome=f.s.confirmPreparedLabelSuggestion(prepared,f.mail,f.write);assert.equal(outcome.status,'skipped');assert.equal(f.writes.length,0);assert.equal(f.sets.get(1).has('travel'),true);
});
test('deleted labels, unavailable messages, reused native keys and split conversations fail closed',async()=>{
 const f=reviewFixture();const prepared=await f.prepare();f.mail.tags.getAllTags=()=>[];
 assert.equal(f.s.confirmPreparedLabelSuggestion(prepared,f.mail,f.write).status,'skipped');assert.equal(f.writes.length,0);
 f.mail.tags.getAllTags=()=>tags;f.values[1].messageId='unrelated';assert.throws(()=>f.s.confirmPreparedLabelSuggestion(prepared,f.mail,f.write),/moved or changed/);assert.equal(f.writes.length,0);
 const split=await f.prepare();assert.equal(split.status,'skipped');
});
test('Undo removes only the confirmed keyword from its exact physical members, preserving internal and later user labels',async()=>{
 const f=reviewFixture(),prepared=await f.prepare(),outcome=f.s.confirmPreparedLabelSuggestion(prepared,f.mail,f.write);
 f.sets.get(1).add('travel');f.sets.get(1).add('$Junk');f.values[0].label=1;
 f.s.undoConfirmedLabelSuggestion(outcome.receipt,f.mail,f.write);
 assert.equal(f.sets.get(1).has('ml'),false);assert.equal(f.sets.get(1).has('travel'),true);assert.equal(f.sets.get(1).has('$Junk'),true);assert.equal(f.values[0].label,1);assert.equal(f.sets.get(2).has('ml'),false);
});
test('partial native failures expose an Undo receipt without silently removing any existing label',async()=>{
 const f=reviewFixture(),prepared=await f.prepare();
 const result=f.s.confirmPreparedLabelSuggestion(prepared,f.mail,(headers,key)=>{f.sets.get(headers[0].messageKey).add(key);throw Error('folder write failed')});
 assert.equal(result.status,'failed');assert.match(result.reason,/Some messages may/);assert.ok(result.receipt);assert.equal(f.sets.get(1).has('ml'),true);
 f.s.undoConfirmedLabelSuggestion(result.receipt,f.mail,f.write);assert.equal(f.sets.get(1).has('ml'),false);assert.equal(f.writes[0].headers.length,1);
});
test('discard cleanup removes only the chosen saved proposal and never creates a saved report for dry-run rows',()=>{
 const s=scope(),a={account:'a',conversationKey:'c1',labelKey:'ml'},b={account:'a',conversationKey:'c2',labelKey:'travel'};let value=null,writes=0;
 const prefs={getStringPref:()=>value,setStringPref(_key,next){writes++;value=next}};
 s.removeSavedLabelSuggestions(prefs,[a]);assert.equal(writes,0);
 value=JSON.stringify({version:1,createdAt:42,proposals:[a,b]});s.removeSavedLabelSuggestions(prefs,[a]);
 assert.equal(writes,1);assert.equal(JSON.parse(value).createdAt,42);assert.deepEqual(JSON.parse(value).proposals,[b]);
});
