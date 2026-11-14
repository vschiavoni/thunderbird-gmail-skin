const {test}=require('node:test');
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const scope=vm.createContext({console});vm.runInContext(fs.readFileSync('thunder-g/search-native.js','utf8'),scope);
function fixture(){
 const events=new Map(),buttons=[],folder={URI:'mailbox://Inbox'},selected={messageId:'selected'};let readerClosed=0,wrapperClosed=0,unsubscribed=0;
 const host={prepend(button){buttons.push(button)},append(){}},tree={addEventListener(n,fn){events.set(n,fn)},removeEventListener(n){events.delete(n)}};
 const node=()=>({style:{},events:{},setAttribute(){},addEventListener(n,fn){this.events[n]=fn},remove(){this.removed=true}});
 const pane={document:{getElementById:()=>tree,querySelector:()=>host,createElement:node},threadTree:{scrollTop:123,selectedIndex:2},
  gFolder:folder,gDBView:{hdrForFirstSelectedMessage:selected},gViewWrapper:{close(){wrapperClosed++}},
  paneLayout:{folderPaneSplitter:{isDisabled:false}},threadPane:{saveSelection(){}},messagePane:{clearAll(){}},
  addEventListener(n,fn){events.set('window:'+n,fn)},removeEventListener(n){events.delete('window:'+n)},
  folderPane:{handleEvent(){pane.gFolder=folder;pane.gDBView={rowCount:10,findIndexOfMsgHdr:h=>h===selected?2:-1};pane.gViewWrapper={close(){wrapperClosed++}}}},
  restoreState({syntheticView}){pane.gViewWrapper={_syntheticView:syntheticView,close(){wrapperClosed++}};pane.threadTree.scrollTop=0;}
 };
 function view(){return {aborts:0,abortSearch(){this.aborts++},subscribeProgress(fn){fn(true);return ()=>unsubscribed++}}}
 const adapter=scope.installInPlaceSearch(pane,()=>readerClosed++);
 return {pane,adapter,view,events,buttons,folder,selected,get readerClosed(){return readerClosed},get unsubscribed(){return unsubscribed}};
}
test('same-tab search replaces the native view and Back restores folder, selection and scroll',()=>{
 const f=fixture(),view=f.view();assert.equal(f.adapter.open(view,'from:alice'),true);assert.equal(f.pane.gFolder,null);assert.equal(f.pane.gViewWrapper._syntheticView,view);assert.equal(f.pane.paneLayout.folderPaneSplitter.isDisabled,false);
 f.buttons[0].events.click();assert.equal(f.pane.gFolder,f.folder);assert.equal(f.pane.threadTree.scrollTop,123);assert.equal(f.pane.threadTree.selectedIndex,2);assert.equal(f.unsubscribed,1);assert.equal(view.aborts,1);assert.equal(f.buttons[0].removed,true);
});
test('a replacement search cancels stale work and keeps the original return point',()=>{
 const f=fixture(),first=f.view(),second=f.view();f.adapter.open(first,'first');f.pane.threadTree.scrollTop=400;f.adapter.open(second,'second');assert.equal(first.aborts,1);assert.equal(f.unsubscribed,1);f.adapter.reset();assert.equal(second.aborts,1);assert.equal(f.pane.threadTree.scrollTop,123);
});
test('folder navigation cancels search before the native selection handler runs',()=>{
 const f=fixture(),view=f.view();f.adapter.open(view,'x');f.events.get('select')();assert.equal(view.aborts,1);assert.equal(f.pane.gViewWrapper,null);assert.equal(f.pane.gDBView,null);assert.equal(f.pane.threadTree.view,null);
 f.pane.folderPane.handleEvent({type:'select'});assert.equal(f.pane.gFolder,f.folder);
});
test('failed presentation restores native folder state and closing unsubscribes all listeners',()=>{
 const f=fixture(),view=f.view();f.pane.restoreState=()=>{throw Error('mount failed')};assert.throws(()=>f.adapter.open(view,'x'),/mount failed/);assert.equal(f.pane.gFolder,f.folder);assert.equal(view.aborts,1);f.adapter.close();assert.equal(f.events.size,0);
});
test('unload aborts work without opening a folder in a closing pane',()=>{
 const f=fixture(),view=f.view();f.adapter.open(view,'x');let reopened=0;f.pane.folderPane.handleEvent=()=>reopened++;f.events.get('window:unload')();assert.equal(reopened,0);assert.equal(view.aborts,1);assert.equal(f.events.size,0);
});
test('instrumentation preserves a single search, streaming order and callback semantics',()=>{
 let calls=0,time=10,finished=0;const hits=[],pane={},view={search(listener,callback){calls++;listener.onNewSearch();time=15;listener.onSearchHit('first','folder');time=19;listener.onSearchHit('second','folder');time=30;listener.onSearchDone(0);callback()}};
 scope.instrumentInPlaceSearch(view,pane,()=>time);view.search({onNewSearch(){},onSearchHit(h){hits.push(h)},onSearchDone(){finished++}},()=>finished++);assert.equal(calls,1);assert.deepEqual(hits,['first','second']);assert.equal(finished,2);assert.equal(pane._gmSearchMetrics.firstResultMs,5);assert.equal(pane._gmSearchMetrics.elapsedMs,20);assert.equal(pane._gmSearchMetrics.matches,2);
});
test('experimental mode remains off by default',()=>{
 const background=fs.readFileSync('thunder-g/background.js','utf8');assert.match(background,/inPlaceSearch:false/);assert.match(background,/setInPlaceSearch\?\.\(inPlaceSearch\)/);
});

test('opt-in routes plain searches to the existing pane; opting out retains native plain search',()=>{
 const local=vm.createContext({console,Date,Map,Set,AbortController});
 for(const file of ['search-query.js','search-native.js'])vm.runInContext(fs.readFileSync('thunder-g/'+file,'utf8'),local);
 let handler,enabled=true,opened=0,newTabs=0,prevented=0;
 const pane={},bar={isConnected:true,addEventListener(_name,fn){handler=fn},removeEventListener(){}};
 const win={AbortController,setTimeout,MutationObserver:class{observe(){}disconnect(){}},document:{documentElement:{},querySelectorAll:()=>[bar],getElementById:id=>id==='tabmail'?{currentAbout3Pane:pane,openTab(){newTabs++}}:null},Services:{prompt:{alert(_win,_title,error){throw Error(error)}}}};
 const mail={filters:{addCustomTerm(){}},accounts:{allFolders:[{isServer:false,flags:0,isSpecialFolder:()=>false}]}};
 const interfaces={nsMsgFolderFlags:{Virtual:1,Junk:2,Trash:4},nsMsgViewSortType:{byDate:1},nsMsgViewSortOrder:{descending:2}};
 local.installInPlaceSearch=()=>({open(){opened++;return true},reset(){},close(){}});
 const controller=local.installGmailSearch(win,mail,interfaces,{}, {importESModule:()=>({GlodaSyntheticView:{prototype:{DEFAULT_COLUMN_STATES:{subjectCol:{visible:true}}}}})},{enabled:()=>enabled});
 function submit(query){handler({detail:query,preventDefault(){prevented++},stopImmediatePropagation(){}})}
 submit('plain text');assert.equal(opened,1);assert.equal(newTabs,0);assert.equal(prevented,1);
 enabled=false;controller.settingsChanged();submit('plain text');assert.equal(opened,1);assert.equal(prevented,1,'native indexed search still receives ordinary text');
 submit('subject:meeting');assert.equal(newTabs,1,'advanced queries use the original tab path when experiment is off');controller.close();
});
