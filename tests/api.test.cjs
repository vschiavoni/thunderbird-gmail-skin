const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'), fs=require('node:fs'), path=require('node:path');

test('native keyword notifications refresh open conversations and unsubscribe on shutdown',async()=>{
  let listener, windows, cleanup, refreshed=0, disposed=0, removed;
  const mail={mfn:{addListener(value,flags){listener=value;assert.equal(flags,8)},removeListener(value){removed=value}}};
  const support={registerWindowListener(id,value){windows=value},unregisterWindowListener(){}};
  const scope=require('./localization-context.cjs').createContext({ChromeUtils:{importESModule:()=>({
    ExtensionCommon:{ExtensionAPI:class{},EventManager:class{api(){return {}}}},ExtensionSupport:support,MailServices:mail,ExtensionParent:{}})},
    Services:{prefs:{addObserver(){},removeObserver(){}}},
    Ci:{nsIDOMWindowUtils:{USER_SHEET:1},nsIMsgFolderNotificationService:{msgPropertyChanged:8}},
    sentReplyLabelTrackers:new Set(),GMAIL_SKIN_CSS:'',GMAIL_CONVERSATIONS_CSS:'',
    installGmailSearchStatus:()=>({close(){}}),installGmailSearch:()=>({close(){}}),
    createSnoozeOrder:()=>({close(){}}),
    createNativeSnooze:()=>({close(){}}),
    installConversationLabelInheritance:()=>({close(){}}),
    createComposeAutosave:()=>({set(enabled,minutes){assert.equal(enabled,true);assert.equal(minutes,1)},close(){}}),
    installMailZoom:()=>({close(){}}),
    installConversationStyle:()=>({refresh(){refreshed++},close(){disposed++}})});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/label-menu.js'),'utf8'),scope);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/experiments/api.js'),'utf8'),scope);
  const api=new scope.inlineLabels().getAPI({extension:{id:'test'},callOnClose(value){cleanup=value}});
  await api.inlineLabels.start();
  const sheets=new Set(['data:text/css;charset=utf-8,']),events=new Map();
  const win={windowUtils:{loadSheetUsingURIString(uri){if(sheets.has(uri))throw {result:0x80070057};sheets.add(uri)},removeSheetUsingURIString(uri){sheets.delete(uri)}},addEventListener(name,fn){events.set(name,fn)},removeEventListener(name){events.delete(name)}};
  win.top=win;
  let todayPaneWrites=0;
  const pane={setVisible(){todayPaneWrites++}};
  win.TodayPane={updateDisplay(){todayPaneWrites++},updateSplitterState(){todayPaneWrites++}};
  win.document={documentURI:'chrome://conversations/content/experiment-api/stub.html',defaultView:win,
    getElementById:id=>id==='today-pane-panel'?pane:null,querySelectorAll:()=>[]};
  windows.onLoadWindow(win);
  assert.equal(todayPaneWrites,0,"attaching the skin preserves the native Today Pane preference");
  const originalSheets=sheets.size;
  events.get("activate")();events.get("activate")();
  assert.equal(sheets.size,originalSheets,"repeated activation does not duplicate styles");
  windows.onUnloadWindow(win);assert.equal(events.size,0);assert.equal(sheets.size,0);
  windows.onLoadWindow(win);assert.equal(sheets.size,originalSheets,"a reopened window receives the skin again");
  await api.inlineLabels.setHideTodayPane(true);
  assert.equal(sheets.size,originalSheets+1,'option adds a separate reversible stylesheet');
  await api.inlineLabels.setHideTodayPane(true);
  assert.equal(sheets.size,originalSheets+1,'reapplying does not duplicate sheets');
  await api.inlineLabels.setHideTodayPane(false);
  assert.equal(sheets.size,originalSheets,'turning off the option restores presentation');
  await api.inlineLabels.setHideTodayPane(true);
  assert.equal(todayPaneWrites,0,'setting changes never write native visibility');
  listener.msgPropertyChanged({},'keywords','ta','');assert.equal(refreshed,1);
  listener.msgPropertyChanged({},'label',1,0);assert.equal(refreshed,2);
  listener.msgPropertyChanged({},'junkscore','0','100');assert.equal(refreshed,2);
  cleanup.close();assert.equal(todayPaneWrites,0,"disabling the skin does not change calendar settings");assert.equal(removed,listener);assert.equal(disposed,2);assert.equal(sheets.size,0,"disable unloads all styles, including the Today Pane option");
  listener.msgPropertyChanged({},'keywords','ta','');assert.equal(refreshed,2);
});

test('startup waits for a complete mail pane and cancels retries when its window closes',()=>{
  const scope=require('./localization-context.cjs').createContext({ChromeUtils:{importESModule:()=>({ExtensionCommon:{ExtensionAPI:class{}}})}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/label-menu.js'),'utf8'),scope);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/experiments/api.js'),'utf8'),scope);
  const tasks=new Map();let sequence=0,unload,attached=0;
  const win={setTimeout(fn){tasks.set(++sequence,fn);return sequence},clearTimeout(id){tasks.delete(id)},
    addEventListener(name,fn){unload=fn},removeEventListener(){}};
  const doc={defaultView:win,readyState:'loading',getElementById:()=>({})};
  const step=()=>{const [id,fn]=tasks.entries().next().value;tasks.delete(id);fn()};
  scope.waitForMailPane(doc,()=>attached++);step();assert.equal(attached,0);
  doc.readyState='complete';step();assert.equal(attached,0,'DOM alone is insufficient before threadPane exists');
  win.threadPane={};step();assert.equal(attached,1);assert.equal(tasks.size,0);
  doc.readyState='loading';scope.waitForMailPane(doc,()=>attached++);
  unload();assert.equal(tasks.size,0,'unload cancels pending startup');assert.equal(attached,1);
});

test('mail-window startup uses the packaged logo, runs once and closes on unload or disable',async()=>{
  let windows,cleanup;const startups=[];
  const scope=require('./localization-context.cjs').createContext({ChromeUtils:{importESModule:()=>({
    ExtensionCommon:{ExtensionAPI:class{},EventManager:class{api(){return {}}}},
    ExtensionSupport:{registerWindowListener(id,value){windows=value},unregisterWindowListener(){}},
    MailServices:{mfn:{addListener(){},removeListener(){}}}})},
    Services:{prefs:{addObserver(){},removeObserver(){}}},Ci:{nsIDOMWindowUtils:{USER_SHEET:1},nsIMsgFolderNotificationService:{msgPropertyChanged:1}},
    sentReplyLabelTrackers:new Set(),GMAIL_SKIN_CSS:'',GMAIL_CONVERSATIONS_CSS:'',
    installGmailSearchStatus:()=>({close(){}}),installGmailSearch:()=>({close(){}}),
    createSnoozeOrder:()=>({close(){}}),
    createNativeSnooze:()=>({close(){}}),
    installConversationLabelInheritance:()=>({close(){}}),
    createComposeAutosave:()=>({set(){},close(){}}),installMailZoom:()=>({close(){}}),
    installStartupSplash(win,options){const record={win,options,closed:0,refreshed:0};startups.push(record);return {close(){record.closed++},refresh(){record.refreshed++}}}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/label-menu.js'),'utf8'),scope);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/experiments/api.js'),'utf8'),scope);
  const api=new scope.inlineLabels().getAPI({extension:{id:'test',baseURI:{resolve:path=>'moz-extension://test/'+path}},callOnClose(value){cleanup=value}});
  await api.inlineLabels.start();
  const makeWindow=()=>({document:{documentURI:'chrome://messenger/content/messenger.xhtml',querySelectorAll:()=>[],getElementById:()=>null},
    windowUtils:{loadSheetUsingURIString(){},removeSheetUsingURIString(){}},addEventListener(){},removeEventListener(){}});
  const first=makeWindow();windows.onLoadWindow(first);windows.onLoadWindow(first);
  assert.equal(startups.length,1);assert.equal(startups[0].options.logoURI,'moz-extension://test/icons/thunder-g.svg');
  assert.equal(startups[0].options.isStyled({}),false,'a pane cannot dismiss splash before controllers attach');
  windows.onUnloadWindow(first);assert.equal(startups[0].closed,1);
  const second=makeWindow();windows.onLoadWindow(second);assert.equal(startups.length,2);
  cleanup.close();assert.equal(startups[1].closed,1);assert.equal(startups[0].closed,1);
});

test('optional settings failures do not prevent permanent companion startup',async()=>{
  for (const fail of [false,true]) {
    const calls=[];
    const scope=require('./localization-context.cjs').createContext({console:{warn(){},error(){}},browser:{
      storage:{local:{async get(){if(fail)throw Error('unavailable');return {hideTodayPane:true}}},onChanged:{addListener(){}}},
      inlineLabels:{onDkimRequest:{addListener(){}},async setCompactConversations(){},async setIndependentReader(value){assert.equal(value,false)},async setBimiEnabled(value){assert.equal(value,false)},async setInlineReplyEnabled(value){assert.equal(value,false)},async setInlineNewMessageEnabled(value){assert.equal(value,false)},async setComposeAutosave(enabled,minutes){assert.equal(enabled,true);assert.equal(minutes,1)},async setMessagesPerPage(){},async setHideTodayPane(value){calls.push(value)},async start(){calls.push('started')}}}});
    await vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/background.js'),'utf8'),scope);
    assert.deepEqual(calls,[!fail,'started']);
  }
});

test('independent reader is opt-in, restored at startup and propagated on preference changes',async()=>{
  let changed;const calls=[];
  const scope=require('./localization-context.cjs').createContext({console,browser:{
    storage:{local:{async get(){return {independentReader:true,hideTodayPane:false,composeAutosave:true,composeAutosaveMinutes:1,messagesPerPage:0}}},onChanged:{addListener(fn){changed=fn}}},
    inlineLabels:{onDkimRequest:{addListener(){}},async setCompactConversations(){},async setIndependentReader(value){calls.push(value)},async setHideTodayPane(){},async setComposeAutosave(){},async setMessagesPerPage(){},async start(){calls.push('started')}}}});
  await vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/background.js'),'utf8'),scope);
  assert.deepEqual(calls,[true,'started']);
  changed({independentReader:{newValue:false}},'local');assert.deepEqual(calls,[true,'started',false]);
  changed({independentReader:{newValue:true}},'sync');assert.equal(calls.length,3);
});

test('optional compose and BIMI preferences load once and retain explicit opt-in values',async()=>{
  let reads=0;const calls=[];
  const scope=require('./localization-context.cjs').createContext({console,browser:{
    storage:{local:{async get(){reads++;return {bimiEnabled:true,inlineReplyEnabled:true,inlineNewMessageEnabled:true}}},onChanged:{addListener(){}}},
    inlineLabels:{onDkimRequest:{addListener(){}},async setHideTodayPane(){},async setComposeAutosave(){},async setMessagesPerPage(){},async setCompactConversations(){},async setIndependentReader(){},
      async setBimiEnabled(value){calls.push(['bimi',value])},async setInlineReplyEnabled(value){calls.push(['reply',value])},async setInlineNewMessageEnabled(value){calls.push(['new',value])},async start(){calls.push('started')}}}});
  await vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/background.js'),'utf8'),scope);
  assert.equal(reads,1,'a later optional storage read cannot interrupt startup');
  assert.deepEqual(calls,[['bimi',true],['reply',true],['new',true],'started']);
});


test('thread guide preference defaults on, preserves opt-out and updates live from local storage',async()=>{
 for(const initial of [undefined,false]){
  let changed;const calls=[];
  const scope=require('./localization-context.cjs').createContext({console,browser:{storage:{local:{async get(defaults){return {...defaults,...(initial===undefined?{}:{threadGuides:initial})}}},onChanged:{addListener(fn){changed=fn}}},
  inlineLabels:{onDkimRequest:{addListener(){}},async setThreadGuides(value){calls.push(value)},async setHideTodayPane(){},async setComposeAutosave(){},async setMessagesPerPage(){},async setCompactConversations(){},async setIndependentReader(){},async start(){}}}});
  await vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/background.js'),'utf8'),scope);
  assert.deepEqual(calls,[initial!==false]);
  changed({threadGuides:{newValue:false}},'local');changed({threadGuides:{newValue:true}},'local');
  assert.deepEqual(calls,[initial!==false,false,true]);
  changed({threadGuides:{newValue:false}},'sync');assert.equal(calls.length,3);
 }
});

test('column headers default hidden, restore explicit choice and respond only to local changes',async()=>{
  for (const saved of [undefined,true,false]) {
    const calls=[];let changed;
    const noop=async()=>{};
    const scope=require('./localization-context.cjs').createContext({console,browser:{runtime:{},storage:{local:{get:async()=>({showColumnHeaders:saved})},onChanged:{addListener(fn){changed=fn}}},inlineLabels:{
      onDkimRequest:{addListener(){}},setShowColumnHeaders:async value=>calls.push(value),
      setHideTodayPane:noop,setComposeAutosave:noop,setMessagesPerPage:noop,setCompactConversations:noop,setIndependentReader:noop,start:noop
    }}});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/background.js'),'utf8'),scope);
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(calls,[saved===true]);
    changed({showColumnHeaders:{newValue:true}},'sync');assert.equal(calls.length,1);
    changed({showColumnHeaders:{newValue:true}},'local');
    changed({showColumnHeaders:{newValue:false}},'local');
    changed({showColumnHeaders:{}},'local');
    assert.deepEqual(calls,[saved===true,true,false,false]);
  }
});

test('mail tab watcher scans existing and newly opened search browsers and cleans listeners',()=>{
 const scope=require('./localization-context.cjs').createContext({console});const source=fs.readFileSync(path.join(__dirname,'../thunder-g/experiments/api.js'),'utf8');
 vm.runInContext(source.slice(source.indexOf('function watchMailTabs'),source.indexOf('var inlineLabels = class')),scope);
 const scans=[],listeners=new Map();let monitor,removed;
 const browser={contentDocument:{name:'existing search'},addEventListener(name,fn){listeners.set(this,fn)},removeEventListener(){listeners.delete(this)}};
 const tabmail={tabInfo:[{chromeBrowser:browser}],registerTabMonitor(value){monitor=value},unregisterTabMonitor(value){removed=value}};
 const watcher=scope.watchMailTabs({document:{getElementById:()=>tabmail}},doc=>scans.push(doc));
 assert.equal(scans.length,1);
 const next={addEventListener(name,fn){listeners.set(this,fn)},removeEventListener(){listeners.delete(this)}};
 const tab={chromeBrowser:next};monitor.onTabOpened(tab);
 const doc={nodeType:9,name:'new search'};next.contentDocument=doc;listeners.get(next)({target:next});assert.equal(scans.at(-1),doc);
 next.contentDocument=doc;monitor.onTabSwitched(tab);assert.equal(scans.at(-1),doc);assert.equal(listeners.size,2);
 monitor.onTabClosing(tab);assert.equal(listeners.size,1);
 watcher.close();assert.equal(removed,monitor);assert.equal(listeners.size,0);
});

test('search lists use the complete native result set once, only after results are ready and while enabled',()=>{
 const scope=require('./localization-context.cjs').createContext({console});const source=fs.readFileSync(path.join(__dirname,'../thunder-g/experiments/api.js'),'utf8');
 vm.runInContext(source.slice(source.indexOf('function installSearchListDefault'),source.indexOf('var inlineLabels = class')),scope);
 let enabled=true,closed=0,opened=0,loaded=0;const events={};
 const tab={},tabmail={currentTabInfo:tab,closeTab(value){assert.equal(value,tab);closed++}};
 const context={tab,rootWin:{document:{getElementById:()=>tabmail}},activeSet:null,initialBuild(){loaded++;this.activeSet=[]},showActiveSetInTab(){opened++;assert.equal(this.activeSet.length,23)}};
 const original=context.initialBuild;
 const win={FacetContext:context,addEventListener(name,fn){events[name]=fn},removeEventListener(name){delete events[name]}};
 const controller=scope.installSearchListDefault(win,()=>enabled);controller.refresh();assert.equal(opened,0);
 enabled=false;context.activeSet=Array(23).fill({});controller.refresh();assert.equal(opened,0);
 enabled=true;tabmail.currentTabInfo={};controller.refresh();assert.equal(opened,0,'background searches do not steal focus');
 tabmail.currentTabInfo=tab;controller.refresh();controller.refresh();assert.equal(opened,1);assert.equal(closed,1);
 controller.close();assert.equal(context.initialBuild,original);assert.equal(events.unload,undefined);
 const next=scope.installSearchListDefault(win,()=>false);context.initialBuild();assert.equal(loaded,1);assert.equal(opened,1);next.close();
});
test('search-list preference defaults on and live opt-out is preserved',async()=>{
 for(const initial of [undefined,false]){
  let changed;const calls=[];
  const scope=require('./localization-context.cjs').createContext({console,browser:{storage:{local:{async get(defaults){return {...defaults,...(initial===undefined?{}:{searchResultsAsList:initial})}}},onChanged:{addListener(fn){changed=fn}}},inlineLabels:{onDkimRequest:{addListener(){}},async setSearchResultsAsList(value){calls.push(value)},async setHideTodayPane(){},async setComposeAutosave(){},async setMessagesPerPage(){},async setCompactConversations(){},async setIndependentReader(){},async start(){}}}});
  await vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/background.js'),'utf8'),scope);
  assert.deepEqual(calls,[initial!==false]);changed({searchResultsAsList:{newValue:false}},'local');assert.equal(calls.at(-1),false);changed({searchResultsAsList:{newValue:undefined}},'local');assert.equal(calls.at(-1),true);
 }
});

test('search startup waits for late page scripts, wraps native completion and cancels startup on close',()=>{
 const scope=require('./localization-context.cjs').createContext({console});const source=fs.readFileSync(path.join(__dirname,'../thunder-g/experiments/api.js'),'utf8');
 vm.runInContext(source.slice(source.indexOf('function installSearchListDefault'),source.indexOf('var inlineLabels = class')),scope);
 const timers=new Map();let sequence=0,opened=0,closed=0;
 const tab={},tabmail={currentTabInfo:tab,closeTab(){closed++}};
 const win={addEventListener(){},removeEventListener(){},setTimeout(fn){timers.set(++sequence,fn);return sequence},clearTimeout(id){timers.delete(id)}};
 const controller=scope.installSearchListDefault(win,()=>true);controller.refresh();assert.equal(timers.size,1);
 const original=function(){this.activeSet=[1,2,3]};win.FacetContext={tab,rootWin:{document:{getElementById:()=>tabmail}},activeSet:null,initialBuild:original,showActiveSetInTab(){opened++;assert.equal(this.activeSet.length,3)}};
 const [id,tick]=timers.entries().next().value;timers.delete(id);tick();assert.notEqual(win.FacetContext.initialBuild,original);
 win.FacetContext.initialBuild();assert.equal(opened,1);assert.equal(closed,1);assert.equal(timers.size,0);controller.close();
 delete win.FacetContext;const pending=scope.installSearchListDefault(win,()=>true);pending.refresh();assert.equal(timers.size,1);pending.close();assert.equal(timers.size,0);
});
test('tab watcher observes nested search browser loads whose event targets are frame elements',()=>{
 const scope=require('./localization-context.cjs').createContext({console});const source=fs.readFileSync(path.join(__dirname,'../thunder-g/experiments/api.js'),'utf8');vm.runInContext(source.slice(source.indexOf('function watchMailTabs'),source.indexOf('// Reuse Thunderbird')),scope);
 const listeners=new Map(),scans=[];
 const frame=()=>({addEventListener(_name,fn){listeners.set(this,fn)},removeEventListener(){listeners.delete(this)}});
 const outer=frame(),inner=frame(),tab={iframe:outer};let monitor;
 const tabmail={tabInfo:[tab],registerTabMonitor(value){monitor=value},unregisterTabMonitor(){}};
 const watcher=scope.watchMailTabs({document:{getElementById:()=>tabmail}},doc=>scans.push(doc));
 outer.contentDocument={querySelectorAll:()=>[inner]};listeners.get(outer)({target:outer});assert.ok(listeners.has(inner));
 inner.contentDocument={name:'facet results'};listeners.get(inner)({target:inner});assert.equal(scans.at(-1),inner.contentDocument);
 monitor.onTabClosing(tab);assert.equal(listeners.size,0);watcher.close();
});

test('timed-out mail panes release pending state and can attach on a later activation',()=>{
 const scope=require('./localization-context.cjs').createContext({console:{warn(){}},ChromeUtils:{importESModule:()=>({ExtensionCommon:{ExtensionAPI:class{}}})}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/experiments/api.js'),'utf8'),scope);
 const tasks=new Map();let sequence=0,closed=0,attached=0;
 const win={setTimeout(fn){tasks.set(++sequence,fn);return sequence},clearTimeout(id){tasks.delete(id)},addEventListener(){},removeEventListener(){}};
 const doc={defaultView:win,readyState:'loading',getElementById:()=>({})};
 const step=()=>{const [id,fn]=tasks.entries().next().value;tasks.delete(id);fn()};
 scope.waitForMailPane(doc,()=>attached++,()=>closed++);
 for(let i=0;i<100;i++)step();
 assert.equal(tasks.size,0);assert.equal(closed,1);assert.equal(attached,0);
 doc.readyState='complete';win.threadPane={};
 const pending=scope.waitForMailPane(doc,()=>attached++,()=>closed++);step();
 assert.equal(attached,1);assert.equal(closed,2);pending.close();assert.equal(closed,2,'cleanup is idempotent');
});

test('compaction preference defaults on and live opt-out is preserved',async()=>{
 for(const initial of [undefined,false]){
  let changed;const calls=[];
  const scope=require('./localization-context.cjs').createContext({console,browser:{storage:{local:{async get(defaults){return {...defaults,...(initial===undefined?{}:{compactConversations:initial})}}},onChanged:{addListener(fn){changed=fn}}},inlineLabels:{onDkimRequest:{addListener(){}},async setCompactConversations(value){calls.push(value)},async setHideTodayPane(){},async setComposeAutosave(){},async setMessagesPerPage(){},async setIndependentReader(){},async start(){}}}});
  await vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/background.js'),'utf8'),scope);
  assert.deepEqual(calls,[initial!==false]);changed({compactConversations:{newValue:false}},'local');assert.equal(calls.at(-1),false);changed({compactConversations:{newValue:undefined}},'local');assert.equal(calls.at(-1),true);
 }
});

test('language overrides propagate from storage to Thunderbird UI independently of system language',async()=>{
 let changed;const calls=[];
 const scope=require('./localization-context.cjs').createContext({console,browser:{i18n:{getUILanguage:()=> 'en-US'},
 storage:{local:{get:async defaults=>defaults},onChanged:{addListener(fn){changed=fn}}},
 inlineLabels:{onDkimRequest:{addListener(){}},async setLanguage(language){calls.push(language)},async setCompactConversations(){},async setIndependentReader(){},async setHideTodayPane(){},async setComposeAutosave(){},async setMessagesPerPage(){},async start(){}}}});
 await vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/background.js'),'utf8'),scope);
 assert.deepEqual(calls,['en']);changed({interfaceLanguage:{newValue:'it'}},'local');assert.deepEqual(calls,['en','it']);
 changed({interfaceLanguage:{newValue:'en'}},'local');assert.equal(calls.at(-1),'en');
 changed({interfaceLanguage:{newValue:'auto'}},'local');assert.equal(calls.at(-1),'en');
});

test('Gmail label icons default off and follow live local preference changes',async()=>{
 for(const initial of [undefined,true]){
  let changed;const calls=[];
  const scope=require('./localization-context.cjs').createContext({console,browser:{storage:{local:{async get(defaults){return {...defaults,...(initial===undefined?{}:{gmailLabelIcons:initial})}}},onChanged:{addListener(fn){changed=fn}}},
  inlineLabels:{onDkimRequest:{addListener(){}},async setGmailLabelIcons(value){calls.push(value)},async setHideTodayPane(){},async setComposeAutosave(){},async setMessagesPerPage(){},async setCompactConversations(){},async setIndependentReader(){},async start(){}}}});
  await vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/background.js'),'utf8'),scope);
  assert.deepEqual(calls,[initial===true]);
  changed({gmailLabelIcons:{newValue:false}},'local');changed({gmailLabelIcons:{newValue:true}},'local');
  assert.deepEqual(calls,[initial===true,false,true]);
  changed({gmailLabelIcons:{newValue:false}},'sync');assert.equal(calls.length,3);
 }
});

test('New-message symbol defaults off and follow live local preference changes',async()=>{
 for(const initial of [undefined,true]){
  let changed;const calls=[];
  const scope=require('./localization-context.cjs').createContext({console,browser:{storage:{local:{async get(defaults){return {...defaults,...(initial===undefined?{}:{showNewMessageSymbol:initial})}}},onChanged:{addListener(fn){changed=fn}}},
  inlineLabels:{onDkimRequest:{addListener(){}},async setShowNewMessageSymbol(value){calls.push(value)},async setHideTodayPane(){},async setComposeAutosave(){},async setMessagesPerPage(){},async setCompactConversations(){},async setIndependentReader(){},async start(){}}}});
  await vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/background.js'),'utf8'),scope);
  assert.deepEqual(calls,[initial===true]);
  changed({showNewMessageSymbol:{newValue:false}},'local');changed({showNewMessageSymbol:{newValue:true}},'local');
  assert.deepEqual(calls,[initial===true,false,true]);
  changed({showNewMessageSymbol:{newValue:false}},'sync');assert.equal(calls.length,3);
 }
});


test('folder sizes default off across tabs and disabling restores the exact prior native setting',()=>{
 const s=require('./localization-context.cjs').createContext({ChromeUtils:{importESModule:()=>({ExtensionCommon:{ExtensionAPI:class{}}})}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/experiments/api.js'),'utf8'),s);
 for(const initial of [undefined,'true','false']){
  let value=initial,writes=0,updates=0;
  const store={hasValue:()=>value!==undefined,getValue:()=>value??'',setValue(uri,id,attribute,next){assert.equal(id,'folderPaneFolderSize');assert.equal(attribute,'visible');assert.equal(uri,'chrome://messenger/content/messenger.xhtml');writes++;value=next},removeValue(){value=undefined}};
  const controller=s.createFolderSizeDefault(store),pane=()=>({folderPane:{toggleFolderSizes(){updates++}}});
  const first=controller.attach(pane()),second=controller.attach(pane());
  assert.equal(value,'false');assert.equal(writes,1,'apply once, independent of the number of tabs');assert.equal(updates,2);
  first.close();assert.equal(value,'false','closing a tab does not restore sizes in other windows');
  controller.close();assert.equal(value,initial,'restore previous visibility, including absence');assert.equal(updates,3);
  second.close();controller.close();assert.equal(value,initial);
 }
});

test('native folder-size menu remains usable and newly opened tabs do not override a user choice',()=>{
 const s=require('./localization-context.cjs').createContext({ChromeUtils:{importESModule:()=>({ExtensionCommon:{ExtensionAPI:class{}}})}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/experiments/api.js'),'utf8'),s);
 let value='false',writes=0;
 const store={hasValue:()=>true,getValue:()=>value,setValue(_uri,_id,_attribute,next){writes++;value=next},removeValue(){assert.fail('must preserve user choice')}};
 const controller=s.createFolderSizeDefault(store);controller.attach({folderPane:{toggleFolderSizes(){}}});
 value='true';controller.attach({folderPane:{toggleFolderSizes(){}}});assert.equal(value,'true');assert.equal(writes,1);
 controller.close();assert.equal(value,'true','disable preserves a manual change made while the skin was active');
});

test('closing a settings API context leaves the background snooze runtime alive',async()=>{
  const cleanups=[];let stops=0,started=0;
  const service={closed:false,close(){this.closed=true;stops++},snooze(){if(this.closed)throw Error('Snooze closed');return 'accepted'}};
  const scope=require('./localization-context.cjs').createContext({ChromeUtils:{importESModule:()=>({
    ExtensionCommon:{ExtensionAPI:class{},EventManager:class{api(){return {}}}},
    ExtensionSupport:{registerWindowListener(){},unregisterWindowListener(){}},
    MailServices:{mfn:{addListener(){},removeListener(){}}}})},
    Services:{prefs:{addObserver(){},removeObserver(){}}},Ci:{nsIMsgFolderNotificationService:{msgPropertyChanged:1}},
    sentReplyLabelTrackers:new Set(),GMAIL_SKIN_CSS:'',GMAIL_CONVERSATIONS_CSS:'',
    createNativeSnooze(){started++;return service},createSnoozeOrder:()=>({close(){}}),
    installConversationLabelInheritance:()=>({close(){}}),createComposeAutosave:()=>({set(){},close(){}})});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/label-menu.js'),'utf8'),scope);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/experiments/api.js'),'utf8'),scope);
  const experiment=new scope.inlineLabels();
  const context=()=>({extension:{id:'test'},callOnClose(value){cleanups.push(value)}});
  const background=experiment.getAPI(context());await background.inlineLabels.start();
  experiment.getAPI(context());cleanups[1].close();
  assert.equal(stops,0,'closing settings must not close the shared service');
  assert.equal(scope.thunderGSnooze,service);
  assert.equal(service.snooze(),'accepted');
  assert.equal(started,1,'settings must not restart or replace the service');
  cleanups[0].close();assert.equal(stops,1,'background shutdown still closes the service');
  cleanups[0].close();assert.equal(stops,1,'cleanup is idempotent');
});

test('a late shutdown of an old background cannot close its replacement snooze service',async()=>{
  const cleanups=[],services=[],orders=[];
  const scope=require('./localization-context.cjs').createContext({ChromeUtils:{importESModule:()=>({
    ExtensionCommon:{ExtensionAPI:class{},EventManager:class{api(){return {}}}},
    ExtensionSupport:{registerWindowListener(){},unregisterWindowListener(){}},
    MailServices:{mfn:{addListener(){},removeListener(){}}}})},
    Services:{prefs:{addObserver(){},removeObserver(){}}},Ci:{nsIMsgFolderNotificationService:{msgPropertyChanged:1}},
    sentReplyLabelTrackers:new Set(),GMAIL_SKIN_CSS:'',GMAIL_CONVERSATIONS_CSS:'',
    createNativeSnooze(){const value={closed:0,close(){this.closed++}};services.push(value);return value},
    createSnoozeOrder(){const value={closed:0,close(){this.closed++}};orders.push(value);return value},
    installConversationLabelInheritance:()=>({close(){}}),createComposeAutosave:()=>({set(){},close(){}})});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/label-menu.js'),'utf8'),scope);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/experiments/api.js'),'utf8'),scope);
  const experiment=new scope.inlineLabels();
  const context=()=>({extension:{id:'test'},callOnClose(value){cleanups.push(value)}});
  await experiment.getAPI(context()).inlineLabels.start();await experiment.getAPI(context()).inlineLabels.start();
  cleanups[0].close();
  assert.equal(services[0].closed,1);assert.equal(services[1].closed,0);
  assert.equal(orders[0].closed,1);assert.equal(orders[1].closed,0);
  assert.equal(scope.thunderGSnooze,services[1]);assert.equal(scope.thunderGSnoozeOrder,orders[1]);
  cleanups[1].close();assert.equal(services[1].closed,1);assert.equal(orders[1].closed,1);
});
