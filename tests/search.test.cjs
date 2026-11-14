const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const scope=vm.createContext({Date,Map,Set,AbortController,GM_STAR_MARKERS:[['yellow-star'],['blue-star']]});
for(const file of ['search-query.js','search-native.js'])
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g',file),'utf8'),scope);
const parse=source=>scope.parseGmailSearch(source,new Date(2026,10,4,12));
const atoms=source=>Array.from(scope.gmailSearchAtoms(parse(source)));
test('common combined Gmail query parses exclusions, relative dates and quoted nested labels',()=>{
  const query=parse('from:me label:"teaching/os 26" has:attachment newer_than:6m -subject:cancelled');
  assert.equal(query.type,'and');
  const terms=Array.from(scope.gmailSearchAtoms(query));
  assert.deepEqual(terms.map(term=>term.field),['from','label','has','newer_than','subject']);
  assert.equal(terms[1].value,'teaching/os 26');
  assert.equal(query.children[4].type,'not');
  assert.equal(new Date(terms[3].time).getMonth(),4);
});
test('groups and boolean set operations retain same-message conjunction semantics',()=>{
  const query=parse('{from:alice from:bob} subject:(meeting -cancelled)');
  const terms=Array.from(scope.gmailSearchAtoms(query));
  const matches=new Map([
    [terms[0],new Map([['a',1],['b',2]])],[terms[1],new Map([['c',3]])],
    [terms[2],new Map([['a',1],['c',3]])],[terms[3],new Map([['c',3]])],
  ]);
  assert.deepEqual(Array.from(scope.combineGmailSearch(query,matches,new Map([['a',1],['b',2],['c',3]])).keys()),['a']);
});
test('query validation rejects malformed expressions and unsupported Gmail-specific features',()=>{
  for(const query of ['from:','(from:alice','"missing','from:a OR','category:primary','is:important',
    'has:drive','after:2026/02/30','larger:bad','newer_than:many']){
    assert.throws(()=>parse(query),undefined,query);
  }
  assert.equal(atoms('larger:10M')[0].bytes,10485760);
  assert.equal(atoms('subject:"a \\"quoted\\" phrase"')[0].value,'a "quoted" phrase');
});
test('metadata matching resolves me, nested labels, flags, byte sizes and dates',()=>{
  const header={mime2DecodedAuthor:'Alice <alice@example.com>',mime2DecodedSubject:'Report',
    isRead:false,isFlagged:true,messageSize:1024,dateInSeconds:new Date(2026,10,3).getTime()/1000,
    getStringProperty:name=>name==='keywords'?'project':'blue-star'};
  const context={identities:new Set(['alice@example.com']),addresses:()=>['alice@example.com'],
    tags:[{key:'project',tag:'teaching/os26'}]};
  const match=query=>scope.gmailMetadataMatch(atoms(query)[0],header,context);
  assert.equal(match('from:me'),true);
  assert.equal(match('label:teaching/os26'),true);
  assert.equal(match('is:unread'),true);
  assert.equal(match('has:blue-star'),true);
  assert.equal(match('size:1K'),true);
  assert.equal(match('smaller:1K'),false);
  assert.equal(match('after:2026/11/01'),true);
});
test('synthetic search displays complete exact results, filters attachment names, and finishes',async()=>{
  const header={folder:{URI:'mailbox://inbox'},messageKey:1,messageId:'one'};
  const other={folder:header.folder,messageKey:2};
  let finished=0;
  const hits=[];
  const view=scope.createGmailSearchView('filename:pdf',parse('filename:pdf'),{
    AbortController,folders:[],sort:[],searchAtom:async()=>[header,other],attachmentNames:async message=>message===header?['Report.PDF']:['image.png'],
    yieldControl:async()=>{},reportError:error=>{throw error},
  });
  view.search({onNewSearch(){},onSearchHit:message=>hits.push(message),onSearchDone(){finished++}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(hits,[header]);assert.equal(finished,1);
  assert.equal(view.getMsgHdrForMessageID('one'),header);
});
test('closing results cancels outstanding work and prevents late hits or dialogs',async()=>{
  let resolveSearch,errors=0,done=0;
  const view=scope.createGmailSearchView('from:a',parse('from:a'),{
    AbortController,folders:[],sort:[],searchAtom:(_atom,_folders,signal)=>new Promise(resolve=>{
      resolveSearch=resolve;signal.addEventListener('abort',()=>resolve([]));
    }),reportError:()=>errors++,yieldControl:async()=>{},
  });
  view.search({onNewSearch(){},onSearchHit(){throw Error('late hit')},onSearchDone(){done++}});
  view.abortSearch();resolveSearch([]);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(done,1);assert.equal(errors,0);
});

test('native result columns are available before Thunderbird creates its view wrapper',()=>{
  const view=scope.createGmailSearchView('',parse('is:unread'),{sort:[]});
  const columns={subjectCol:{visible:true}};
  view.getDefaultSetting=name=>name==='columns'?columns:undefined;
  assert.equal(view.getPersistedSetting('columns'),columns);
});

test('native integration reuses one custom term and cleans matchers without unsupported removal APIs',async()=>{
  let custom,handler,view;
  const header={mime2DecodedSubject:'known subject',folder:{URI:'mailbox://test/inbox'},messageKey:1};
  const session={createTerm(){return {value:{}}},appendTerm(term){this.term=term},addScopeTerm(){},
    registerListener(observer){this.observer=observer},unregisterListener(){},
    search(){assert.equal(custom.match(header,this.term.value.str),true);this.observer.onSearchHit(header);this.observer.onSearchDone(0)},interruptSearch(){}};
  const bar={isConnected:true,addEventListener(_name,fn){handler=fn},removeEventListener(){}};
  const columns={subjectCol:{visible:true}};
  const win={AbortController,setTimeout,MutationObserver:class{observe(){}disconnect(){}},
    document:{documentElement:{},querySelectorAll:()=>[bar],getElementById:id=>id==='tabmail'?{openTab(_type,args){view=args.syntheticView}}:null},
    Services:{prompt:{alert(){throw Error('Unexpected alert')}}}};
  const mail={filters:{addCustomTerm(value){assert.equal(custom,undefined);custom=value}},
    tags:{getAllTags:()=>[]},accounts:{allIdentities:[],allFolders:[{isServer:false,flags:0,isSpecialFolder:()=>false}]},headerParser:{}};
  const interfaces={nsMsgFolderFlags:{Virtual:1,Junk:2,Trash:4},nsMsgMessageFlags:{Attachment:1},
    nsMsgViewSortType:{byDate:1},nsMsgViewSortOrder:{descending:2},nsMsgSearchOp:{Is:1},
    nsMsgSearchAttrib:{Custom:2},nsMsgSearchScope:{offlineMail:1},nsIMsgSearchSession:{allNotifications:7}};
  const install=scope.installGmailSearch(win,mail,interfaces,{'@mozilla.org/messenger/searchSession;1':{createInstance:()=>session}},
    {importESModule:()=>({GlodaSyntheticView:{prototype:{DEFAULT_COLUMN_STATES:columns}}})});
  for(let n=0;n<2;n++){
    handler({detail:'subject:known',preventDefault(){},stopImmediatePropagation(){}});
    const hits=[];view.search({onNewSearch(){},onSearchHit:h=>hits.push(h),onSearchDone(){}});
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(hits,[header]);
    assert.equal(custom.match(header,session.term.value.str),false);
  }
  install.close();
});

 test('quoted boolean words stay literal and explicit AND takes precedence inside alternatives',()=>{
  assert.equal(atoms('subject:"OR"')[0].value,'OR');
  assert.equal(atoms('"AROUND"')[0].value,'AROUND');
  const query=parse('{from:a from:b AND subject:c}');
  assert.equal(query.type,'or');assert.equal(query.children[1].type,'and');
  assert.equal(query.children[1].children.length,2);
});

function streamingFixture(query){
  const jobs=[],hits=[],states=[];
  const view=scope.createGmailSearchView(query,parse(query),{
    AbortController,folders:[],sort:[],yieldControl:async()=>{},reportError:error=>{throw error},
    searchAtom:(atom,_folders,_signal,onHit)=>new Promise(resolve=>jobs.push({atom,onHit,resolve})),
    searchAll:(_folders,_signal,onHit)=>new Promise(resolve=>jobs.push({universe:true,onHit,resolve})),
  });
  view.subscribeProgress(active=>states.push(active));
  view.search({onNewSearch(){},onSearchHit:header=>hits.push(header),onSearchDone(){}});
  return {view,jobs,hits,states};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const streamHeader=key=>({folder:{URI:'mailbox://inbox'},messageKey:key,messageId:String(key)});
test('single-term hits appear before completion, without duplicates, and searching clears on completion',async()=>{
  const f=streamingFixture('label:project'),header=streamHeader(1);
  f.jobs[0].onHit(header);f.jobs[0].onHit(header);
  assert.deepEqual(f.hits,[header]);assert.equal(f.states.at(-1),true);
  f.jobs[0].resolve([header]);await settle();
  assert.deepEqual(f.hits,[header]);assert.equal(f.states.at(-1),false);
});
test('AND never displays a partial match; OR can display a proven match immediately',async()=>{
  const header=streamHeader(1),other=streamHeader(2);
  const f=streamingFixture('from:alice label:project');
  f.jobs[0].onHit(header);f.jobs[0].onHit(other);assert.deepEqual(f.hits,[]);
  f.jobs[0].resolve([]);await settle();
  f.jobs[1].onHit(header);assert.deepEqual(f.hits,[header]);
  f.jobs[1].resolve([]);await settle();assert.deepEqual(f.hits,[header]);
  const g=streamingFixture('from:alice OR label:project');
  g.jobs[0].onHit(other);assert.deepEqual(g.hits,[other]);g.view.abortSearch();
});
test('exclusions wait until absence is proven and negative-only searches stream universe hits',async()=>{
  const header=streamHeader(1),excluded=streamHeader(2);
  const f=streamingFixture('from:alice -label:project');
  f.jobs[0].onHit(header);f.jobs[0].onHit(excluded);assert.deepEqual(f.hits,[]);
  f.jobs[0].resolve([]);await settle();f.jobs[1].onHit(excluded);
  assert.deepEqual(f.hits,[]);f.jobs[1].resolve([]);await settle();
  assert.deepEqual(f.hits,[header]);f.jobs[2].resolve([]);await settle();
  const g=streamingFixture('-label:project');g.jobs[0].onHit(excluded);g.jobs[0].resolve([]);await settle();
  g.jobs[1].onHit(excluded);g.jobs[1].onHit(header);assert.deepEqual(g.hits,[header]);
  g.view.abortSearch();g.jobs[1].onHit(streamHeader(3));assert.deepEqual(g.hits,[header]);
  assert.equal(g.states.at(-1),false);
});
test('search status is initially visible, hides on completion, and unsubscribes on teardown',()=>{
  let notify,unsubscribed=false,removed=false,appended=false;
  const status={setAttribute(){},style:{},remove(){removed=true}};
  const ui=scope.installGmailSearchStatus({gViewWrapper:{_syntheticView:{subscribeProgress(fn){notify=fn;fn(true);return ()=>unsubscribed=true}}},
    document:{querySelector:()=>({append(){appended=true}}),createElement:()=>status}});
  assert.equal(appended,true);assert.equal(status.textContent,'Searching…');assert.equal(status.hidden,false);
  notify(false);assert.equal(status.hidden,true);ui.close();assert.equal(unsubscribed,true);assert.equal(removed,true);
});

test('label search matches exact leaf names across parents and exact full paths',()=>{
 const context={tags:[{key:'a',tag:'test/subtest'},{key:'b',tag:'other/subtest'},{key:'c',tag:'subtest'},{key:'d',tag:'test/subtesting'},{key:'e',tag:'test/branch/subtest'}]};
 const match=(query,key)=>scope.gmailMetadataMatch(atoms(query)[0],{getStringProperty:()=>key},context);
 for(const key of ['a','b','c','e'])assert.equal(match('label:subtest',key),true);
 assert.equal(match('label:SUBTEST','a'),true);assert.equal(match('label:subtest','d'),false);
 assert.equal(match('label:test/subtest','a'),true);for(const key of ['b','c','d','e'])assert.equal(match('label:test/subtest',key),false);
 assert.equal(match('label:test','a'),false,'a parent is not implicitly assigned to its child');
});
test('compiled label matcher resolves definitions once and honors legacy labels',()=>{
 let definitionsRead=0;const context={tags:[{key:'$label1',get tag(){definitionsRead++;return 'test/subtest'}}]};
 const match=scope.compileGmailMetadataMatch(parse('label:subtest'),context);
 for(let i=0;i<10000;i++)assert.equal(match({label:1,getStringProperty:()=>''}),true);
 assert.equal(definitionsRead,1);assert.equal(match({label:0,getStringProperty:()=>'$label1'}),true);assert.equal(match({getStringProperty:()=>''}),false);
});
test('compiled metadata booleans preserve nested negation and same-message conjunction',()=>{
 const context={tags:[{key:'tag',tag:'test/subtest'}]};
 const match=scope.compileGmailMetadataMatch(parse('(label:subtest OR subject:meeting) -is:read'),context);
 assert.equal(match({isRead:false,mime2DecodedSubject:'other',getStringProperty:()=> 'tag'}),true);
 assert.equal(match({isRead:true,mime2DecodedSubject:'meeting',getStringProperty:()=> ''}),false);
 assert.equal(match({isRead:false,mime2DecodedSubject:'other',getStringProperty:()=> ''}),false);
});
test('metadata-only queries stream through one native scan without per-atom or universe scans',async()=>{
 let scans=0,done=0,progress=[];const hits=[],header={messageId:'one',folder:{URI:'mailbox://Inbox'},messageKey:1};
 const view=scope.createGmailSearchView('label:subtest -is:read',parse('label:subtest -is:read'),{
  AbortController,folders:[],sort:[],yieldControl:async()=>{},searchCombined:async(ast,folders,signal,onHit)=>{scans++;onHit(header);return [header]},
  searchAtom(){throw Error('redundant atom scan')},searchAll(){throw Error('redundant universe scan')},reportError(error){throw error}
 });
 view.subscribeProgress(value=>progress.push(value));view.search({onNewSearch(){},onSearchHit:h=>hits.push(h),onSearchDone(){done++}});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(scans,1);assert.deepEqual(hits,[header]);assert.equal(done,1);assert.equal(progress.at(-1),false);
});
test('canceling a combined scan suppresses late results',async()=>{
 let publish,resolve;const hits=[];
 const view=scope.createGmailSearchView('label:subtest',parse('label:subtest'),{AbortController,folders:[],sort:[],searchCombined:(_ast,_folders,signal,onHit)=>new Promise(done=>{publish=onHit;resolve=done}),yieldControl:async()=>{},reportError(){}});
 view.search({onNewSearch(){},onSearchHit:h=>hits.push(h),onSearchDone(){}});view.abortSearch();publish({messageId:'late',folder:{URI:'mailbox://Inbox'},messageKey:1});resolve([]);await new Promise(resolve=>setImmediate(resolve));assert.equal(hits.length,0);
});
