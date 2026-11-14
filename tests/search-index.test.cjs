const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function context(){const scope=vm.createContext({console,Map,Set,AbortController,Date});for(const file of ['search-query.js','search-index.js','search-native.js'])vm.runInContext(fs.readFileSync('thunder-g/'+file,'utf8'),scope);return scope;}
function header(key,folder='mailbox://Inbox'){return {messageId:'id'+key,messageKey:key,folder:{URI:folder},isRead:false};}
function fixture(options={}){
 const scope=context(),queries=[],hits=[],progress=[];let done=0,errors=0;
 const environment={pageSize:2,sort:[],accept:h=>h.folder.URI==='mailbox://Inbox',reportError(){errors++},
 createCollection(text,limit,listener){const collection={listener,explicit:false,becomeExplicit(){this.explicit=true}};queries.push({text,limit,listener,collection});return collection;},...options};
 const view=scope.createGmailIndexedView('"meeting"',environment);view.subscribeProgress(p=>progress.push(p));
 const listener={onNewSearch(){hits.length=0},onSearchHit:h=>hits.push(h),onSearchDone(){done++}};
 return {scope,view,queries,hits,progress,listener,get done(){return done},get errors(){return errors},start(){view.search(listener)}};
}
test('only supported positive text conjunctions use the index',()=>{
 const s=context(),eligible=q=>s.gmailIndexedText(s.parseGmailSearch(q));
 assert.equal(eligible('meeting project'),'"meeting" "project"');assert.equal(eligible('"project meeting"'),'"project meeting"');
 for(const query of ['label:subtest','meeting label:subtest','meeting OR project','-meeting','is:unread','filename:report','AI','meeting AI','NEAR'])assert.equal(eligible(query),null,query);
 assert.equal(eligible('中'),'"中"');
});
test('indexed matches stream progressively, deduplicate physical copies and preserve live headers',()=>{
 const f=fixture();f.start();const q=f.queries[0],one=header(1);q.listener.onItemsAdded([{folderMessage:one},{folderMessage:one}]);assert.deepEqual(f.hits,[one]);assert.equal(f.progress.at(-1),true);assert.equal(f.hits[0].isRead,false);q.listener.onQueryCompleted();assert.equal(f.done,1);assert.equal(f.progress.at(-1),false);assert.equal(f.view.getMsgHdrForMessageID('id1'),one);assert.equal(q.collection.listener,null);assert.equal(q.collection.explicit,true);
});
test('one extra indexed result exposes truncation and Load more raises only the instance limit',()=>{
 const f=fixture();f.start();assert.equal(f.queries[0].limit,3);f.queries[0].listener.onItemsAdded([1,2,3].map(n=>({folderMessage:header(n)})));assert.equal(f.hits.length,2);assert.equal(f.view.loadMore(),false,'cannot page while searching');f.queries[0].listener.onQueryCompleted();assert.equal(f.view.getSearchInfo().hasMore,true);assert.equal(f.view.loadMore(),true);f.start();assert.equal(f.queries[1].limit,5);f.queries[1].listener.onItemsAdded([1,2,3].map(n=>({folderMessage:header(n)})));f.queries[1].listener.onQueryCompleted();assert.equal(f.hits.length,3);assert.equal(f.view.getSearchInfo().hasMore,false);assert.equal(f.view.loadMore(),false);
});
test('deleted or excluded indexed items do not appear and are never treated as proof of exhaustion',()=>{
 const f=fixture();f.start();const q=f.queries[0];q.listener.onItemsAdded([{folderMessage:null},{folderMessage:header(1,'mailbox://Trash')},{folderMessage:header(2)}]);q.listener.onQueryCompleted();assert.equal(f.hits.length,0);assert.equal(f.view.getSearchInfo().hasMore,true,'paging remains possible even if an early ranked batch is excluded');
});
test('cancel and a replacement query detach listeners and ignore stale asynchronous batches',()=>{
 const f=fixture();f.start();const old=f.queries[0];f.view.abortSearch();old.listener.onItemsAdded([{folderMessage:header(1)}]);old.listener.onQueryCompleted();assert.equal(f.hits.length,0);assert.equal(old.collection.listener,null);assert.equal(f.done,1);f.start();old.listener.onItemsAdded([{folderMessage:header(2)}]);f.queries[1].listener.onItemsAdded([{folderMessage:header(3)}]);assert.deepEqual(f.hits.map(h=>h.messageKey),[3]);
});
test('synchronous completion releases the returned collection without leaving a stale listener',()=>{
 let collection;const f=fixture({createCollection(text,limit,listener){collection={listener,becomeExplicit(){}};listener.onItemsAdded([{folderMessage:header(1)}]);listener.onQueryCompleted();return collection}});f.start();assert.equal(f.done,1);assert.equal(collection.listener,null);assert.equal(f.hits.length,1);
});
test('empty indexed results do not trigger a hidden full-mailbox fallback scan',()=>{
 const f=fixture();f.start();f.queries[0].listener.onQueryCompleted();assert.equal(f.hits.length,0);assert.equal(f.queries.length,1);assert.match(f.view.getSearchInfo().note,/may not be indexed/);
});
test('query construction failures finish once and display an explicit error state',()=>{
 const f=fixture({createCollection(){throw Error('database unavailable')}});f.start();assert.equal(f.errors,1);assert.equal(f.done,1);assert.equal(f.progress.at(-1),false);assert.match(f.view.getSearchInfo().note,/failed/);
});
function integration({enabled=true,available=true}={}){
 const s=context();let handler,opened,imports=0,prefWrites=0,limitObserved;
 const bar={isConnected:true,addEventListener(n,fn){handler=fn},removeEventListener(){}};
 const pane={performance:{now:()=>0}};const win={AbortController,setTimeout,MutationObserver:class{observe(){}disconnect(){}},Services:{prefs:{getBoolPref:()=>enabled},prompt:{alert(){}}},document:{documentElement:{},querySelectorAll:()=>[bar],getElementById:id=>id==='tabmail'?{currentAbout3Pane:pane,openTab(){throw Error('unexpected tab')}}:null}};
 s.installInPlaceSearch=()=>({open(view){opened=view;return true},reset(){},close(){}});
 const mail={filters:{addCustomTerm(){}},accounts:{allFolders:[{URI:'mailbox://Inbox',isServer:false,flags:0,isSpecialFolder:()=>false}]}};
 const Ci={nsMsgFolderFlags:{Virtual:1,Junk:2,Trash:4},nsMsgViewSortType:{byDate:1},nsMsgViewSortOrder:{descending:2}};
 function Searcher(listener,text){this.text=text;this.buildFulltextQuery=()=>{limitObserved=this.retrievalLimit;return {getCollection:listener=>({listener,becomeExplicit(){}})}};}
 Object.defineProperty(Searcher.prototype,'retrievalLimit',{get(){return 400}});
 const modules={importESModule(path){
  if(path.includes('GlodaMsgSearcher')){imports++;if(!available)throw Error('missing');return {GlodaMsgSearcher:Searcher};}
  return {GlodaSyntheticView:{prototype:{DEFAULT_COLUMN_STATES:{subjectCol:{visible:true}}}}};
 }};
 const ui=s.installGmailSearch(win,mail,Ci,{},modules,{enabled:()=>true});
 return {submit(text){handler({detail:text,preventDefault(){},stopImmediatePropagation(){}});return opened},get imports(){return imports},get limit(){return limitObserved},ui};
}
test('plain search selects the indexed adapter and its request limit without modifying global preferences',()=>{
 const f=integration(),view=f.submit('meeting project');assert.equal(view.backend,'index');view.search({onNewSearch(){},onSearchHit(){},onSearchDone(){}});assert.equal(f.limit,201);assert.equal(f.imports,1);f.ui.close();
});
test('disabled or unavailable index visibly falls back to local scanning; advanced queries never import the index',()=>{
 for(const options of [{enabled:false},{available:false}]){const f=integration(options),view=f.submit('meeting');assert.match(view.getSearchInfo().note,/using local/);f.ui.close();}
 const f=integration();f.submit('label:subtest -is:read');assert.equal(f.imports,0);f.ui.close();
});

test('stale index entries whose header lookup throws do not break valid results',()=>{
 const f=fixture({pageSize:10});f.start();const q=f.queries[0];q.listener.onItemsAdded([{get folderMessage(){throw Error('folder deleted')}},{folderMessage:header(7)}]);q.listener.onQueryCompleted();assert.deepEqual(f.hits.map(h=>h.messageKey),[7]);assert.equal(f.done,1);
});
test('the status shows Load more only after completion and refreshes the same native view',()=>{
 const scope=context(),nodes=[];let update,moreCalls=0,refreshed=0,removed=0;
 const view={loadMore(){moreCalls++;return true},getSearchInfo(){return {backend:'index',hasMore:true,note:'Indexed results: 200 (more available).'}},subscribeProgress(fn){update=fn;fn(false);return ()=>removed++}};
 const doc={querySelector:()=>({append(node){nodes.push(node)}}),createElement(){return {style:{},events:{},setAttribute(){},addEventListener(n,fn){this.events[n]=fn},remove(){this.removed=true}}}};
 const ui=scope.installGmailSearchStatus({document:doc,gViewWrapper:{_syntheticView:view,refresh(){refreshed++}}});assert.equal(nodes[1].hidden,false);nodes[1].events.click();assert.equal(moreCalls,1);assert.equal(refreshed,1);assert.equal(nodes[1].hidden,true);ui.close();assert.equal(removed,1);assert.ok(nodes.every(n=>n.removed));
});
test('hybrid planner requires labels and preserves OR and negated-text semantics',()=>{
 const s=context(),plan=q=>s.gmailIndexedPlan(s.parseGmailSearch(q));
 assert.equal(plan('school AND label:cuso').text,'"school"');
 assert.equal(plan('school label:test/subtest').filter.children[0].value,'test/subtest');
 for(const q of ['school OR label:cuso','-school label:cuso','AI label:cuso','school is:unread'])assert.equal(plan(q),null,q);
 assert.ok(plan('school -label:cuso'));
});
test('label filtering precedes index queries, batches IDs, and never queries unrelated mail',async()=>{
 const s=context(),calls=[],hits=[];let finished=false,filterDone=false;
 const candidates=Array.from({length:501},(_,n)=>({...header(n),getUint32Property(){return n+32}}));
 s.gmailLabelFirstCollection('"school"',201,{onItemsAdded:items=>hits.push(...items),onQueryCompleted(){finished=true}},{AbortController,
 async filter(signal,hit){for(const h of candidates)hit(h);filterDone=true;},accept:()=>true,
 query(text,ids,limit,events){assert.equal(filterDone,true);assert.ok(ids.length<=250);assert.equal(limit,201);calls.push(ids);events.onItemsAdded(ids.map(id=>({id})));events.onQueryCompleted();return {listener:events,becomeExplicit(){}};}});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(finished,true);assert.equal(calls.length,3);assert.equal(hits.length,501);assert.equal(hits[500].folderMessage,candidates[500]);
});
test('empty or unindexed label candidates avoid full-text queries; cancellation ignores late candidates',async()=>{
 const s=context();let queries=0,done=0;
 const env={AbortController,filter:async(signal,hit)=>hit({...header(1),getUint32Property:()=>0}),accept:()=>true,query(){queries++}};
 s.gmailLabelFirstCollection('"school"',201,{onQueryCompleted(){done++}},env);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(queries,0);assert.equal(done,1);
 let complete;const c=s.gmailLabelFirstCollection('"school"',201,{onQueryCompleted(){done++}},{...env,filter:()=>new Promise(resolve=>complete=resolve)});
 c.becomeExplicit();complete();await new Promise(resolve=>setImmediate(resolve));assert.equal(done,1);assert.equal(queries,0);
});
test('hybrid index errors report failure rather than successful empty results',async()=>{
 const s=context();let error;
 s.gmailLabelFirstCollection('"school"',2,{onError:e=>error=e},{AbortController,filter:async()=>{throw Error('filter failed')}});
 await new Promise(resolve=>setImmediate(resolve));assert.match(error.message,/filter failed/);
});
test('documented query examples select their documented execution path',()=>{
 const s=context();
 for(const q of ['school','school project','"winter school" label:cuso','school label:cuso is:unread after:2026/01/01','school (label:cuso OR label:teaching)','school -label:cuso'])assert.ok(s.gmailIndexedPlan(s.parseGmailSearch(q)),q);
 for(const q of ['label:cuso is:unread','school OR project','(school OR project) label:cuso','school OR label:cuso','-school label:cuso','AI label:cuso','school AI label:cuso','school is:unread','school from:alice@example.org','school label:cuso filename:pdf','subject:school label:cuso'])assert.equal(s.gmailIndexedPlan(s.parseGmailSearch(q)),null,q);
});

test('hybrid search uses the mail-window AbortController when the experiment global lacks it',async()=>{
 const s=context();vm.runInContext('delete globalThis.AbortController',s);
 let signal,done=0;
 const collection=s.gmailLabelFirstCollection('"school"',201,{onQueryCompleted(){done++}},{AbortController,
   async filter(received){signal=received;},query(){assert.fail('empty label filter must not query the index')}});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(done,1);assert.equal(signal.aborted,false);
 collection.becomeExplicit();assert.equal(signal.aborted,true);
 assert.match(fs.readFileSync('thunder-g/search-native.js','utf8'),/hybrid=\{AbortController:win\.AbortController/);
});
test('wildcard labels use the same live label filter before full-text indexing',()=>{
 const s=context(),ast=s.parseGmailSearch('school AND label:bcca*'),plan=s.gmailIndexedPlan(ast);
 assert.equal(plan.text,'"school"');assert.equal(plan.filter.children[0].value,'bcca*');
 const matches=s.compileGmailMetadataMatch(plan.filter,{tags:[{key:'a',tag:'confs/bcca25'},{key:'b',tag:'bcca26'},{key:'c',tag:'other'}]});
 for(const key of ['a','b'])assert.equal(matches({getStringProperty:()=>key}),true);
 assert.equal(matches({getStringProperty:()=> 'c'}),false);
});
