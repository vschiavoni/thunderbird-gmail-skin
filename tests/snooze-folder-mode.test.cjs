const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('Snoozed folder mode toggles, remembers visibility, discovers new account folders and cleans up',()=>{
  function element(){return {children:[],attrs:{},events:{},append(child){child.remove?.();child.parentNode=this;this.children.push(child)},insertBefore(child){this.append(child)},replaceChildren(){for(const child of [...this.children])child.remove?.();this.children=[]},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},addEventListener(k,v){this.events[k]=v},removeEventListener(k){delete this.events[k]},remove(){this.removed=true;if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(child=>child!==this);this.parentNode=null}};}
  const menu=element(),tree=element(),head=element(),separator=element();
  const doc={head,createElement:element,createXULElement:element,getElementById:id=>({folderTree:tree,folderModesContextMenuPopup:menu,separatorAfterFolderModes:separator}[id])};
  let active=['all'],saved=true,callback,unsubscribed=false;
  const pane={_modes:{all:{}},get activeModes(){return [...active]},set activeModes(values){active=values;const mode=this._modes.gmSnoozed;if(values.includes('gmSnoozed')){if(!mode.active){mode.containerHeader={querySelector:()=>element()};mode.containerList=element();mode.init();}mode.active=true;}else mode.active=false;},_createFolderRow:(_name,folder,style)=>Object.assign(element(),{uri:folder.URI,modeName:_name,style}),updateContextCheckedFolderMode(){},toggleFolderMode(event){this.activeModes=event.target.enabled?['all','gmSnoozed']:['all']}};
  const folders=[{URI:'imap://a/snoozed'}],mail={accounts:{allServers:[{rootFolder:{containsChildNamed:()=>true,getChildNamed:()=>folders[0]}}]}};
  const prefs={getBoolPref:()=>saved,setBoolPref:(_key,value)=>saved=value};
  const scope=vm.createContext({gmText:text=>text});vm.runInContext(fs.readFileSync('thunder-g/snooze-ui.js','utf8'),scope);
  const install=()=>scope.installSnoozedFolderMode({document:doc,folderPane:pane},{unifiedFolder:()=>({URI:'mailbox://smart/Snoozed'}),subscribe(fn){callback=fn;return()=>unsubscribed=true}},mail,prefs);
  let controller=install();assert.deepEqual([...active],['all','gmSnoozed']);assert.equal(pane._modes.gmSnoozed.containerList.children[0].uri,'mailbox://smart/Snoozed');
  mail.accounts.allServers.push({rootFolder:{containsChildNamed:()=>true,getChildNamed:()=>({URI:'imap://b/snoozed'})}});callback();assert.equal(pane._modes.gmSnoozed.containerList.children.length,1);
  const item=menu.children[0];item.events.command({target:{enabled:false}});assert.equal(saved,false);
  controller.close();assert.equal(unsubscribed,true);assert.equal(pane._modes.gmSnoozed,undefined);assert.deepEqual([...active],['all']);
  controller=install();assert.deepEqual([...active],['all']);controller.close();
});

test('unified folder searches all account storage folders and updates its scope without moving messages',()=>{
  let created=0,saved=0,scope='',closed=0;
  const virtual={URI:'mailbox://smart/Snoozed',flags:1,msgDatabase:{close(){closed++}}};
  const smart={rootFolder:{containsChildNamed:()=>created>0,getChildNamed:()=>virtual}};
  const account=id=>({rootFolder:{containsChildNamed:()=>true,getChildNamed:()=>({URI:'imap://'+id+'/Thunder-G Snoozed'})}});
  const mail={accounts:{allServers:[account('a'),account('b')],saveVirtualFolders(){saved++}}};
  const helper={createNewVirtualFolder(name,parent,folders,terms,online){
    assert.equal(name,'Snoozed');assert.equal(parent,smart.rootFolder);assert.equal(terms,'ALL');assert.equal(online,false);
    created++;scope=folders.map(f=>f.URI).join('|');return {virtualFolder:virtual};
  },wrapVirtualFolder(){return {get searchFolderURIs(){return scope},set searchFolders(folders){scope=folders.map(f=>f.URI).join('|')},set onlineSearch(value){assert.equal(value,false)}}}};
  const vmScope=vm.createContext({});vm.runInContext(fs.readFileSync('thunder-g/snooze-ui.js','utf8'),vmScope);
  const ensure=vmScope.createUnifiedSnoozedFolder(mail,helper,smart,{Virtual:1});
  assert.equal(ensure(),virtual);assert.equal(scope.split('|').length,2);ensure();assert.equal(created,1);assert.equal(saved,0);
  mail.accounts.allServers.push(account('c'));ensure();assert.equal(scope.split('|').length,3);assert.equal(saved,1);assert.equal(closed,0,'scope updates must not close a live virtual-folder database');
  mail.accounts.allServers.splice(0,1);ensure();assert.equal(scope.split('|').length,2);assert.equal(saved,2);
  const restart=vmScope.createUnifiedSnoozedFolder(mail,helper,smart,{Virtual:1});assert.equal(restart(),virtual);assert.equal(created,1);assert.equal(saved,2);
});
test('technical rows are hidden in account modes and restored when Snoozed is disabled',()=>{
  function node(){return {children:[],attrs:{},events:{},append(x){x.remove?.();x.parentNode=this;this.children.push(x)},insertBefore(x){this.append(x)},replaceChildren(){for(const child of [...this.children])child.remove?.();this.children=[]},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},toggleAttribute(k,on){if(on)this.attrs[k]='';else delete this.attrs[k]},addEventListener(k,v){this.events[k]=v},removeEventListener(k){delete this.events[k]},remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(child=>child!==this);this.parentNode=null},querySelector(){return node()}}}
  const physical=Object.assign(node(),{uri:'imap://a/Thunder-G Snoozed',modeName:'all'}),ordinary=Object.assign(node(),{uri:'imap://a/Inbox',modeName:'all'});
  const tree=node();tree.querySelectorAll=selector=>selector==='li'?[physical,ordinary]:[physical].filter(row=>'data-gm-snooze-storage' in row.attrs);
  const menu=node(),head=node();const doc={head,createElement:node,createXULElement:node,getElementById:id=>id==='folderTree'?tree:id==='folderModesContextMenuPopup'?menu:null};
  let active=['smart','all'],migrated,mutated;
  const smartList=node();
  const pane={_modes:{smart:{active:true,containerList:smartList}},get activeModes(){return active},set activeModes(v){active=v;const mode=this._modes.gmSnoozed;mode.active=v.includes('gmSnoozed');if(mode.active){mode.container=node();mode.containerHeader=node();mode.containerList=node();mode.init()}},_createFolderRow:(_name,folder)=>Object.assign(node(),{uri:folder.URI,modeName:_name}),updateContextCheckedFolderMode(){},toggleFolderMode(){this.activeModes=['all']}};
  const mail={accounts:{allServers:[{rootFolder:{containsChildNamed:()=>true,getChildNamed:()=>({URI:physical.uri})}}]}};
  const scope=vm.createContext({gmText:x=>x,console});vm.runInContext(fs.readFileSync('thunder-g/snooze-ui.js','utf8'),scope);
  const controller=scope.installSnoozedFolderMode({document:doc,folderPane:pane,gFolder:{URI:physical.uri},displayFolder(uri){migrated=uri},MutationObserver:class{constructor(callback){mutated=callback}observe(){}disconnect(){}}},{unifiedFolder:()=>({URI:'mailbox://smart/Snoozed'}),subscribe:()=>()=>{}},mail,{getBoolPref:()=>true,setBoolPref(){}});
  assert.equal('data-gm-snooze-storage' in physical.attrs,true);assert.equal('data-gm-snooze-storage' in ordinary.attrs,false);assert.equal(migrated,'mailbox://smart/Snoozed');
  assert.equal(smartList.children.length,1);assert.equal(pane._modes.gmSnoozed.containerList.children.length,0);
  assert.equal('data-gm-snooze-integrated' in pane._modes.gmSnoozed.container.attrs,true);
  pane._modes.smart.active=false;mutated();assert.equal(smartList.children.length,0);assert.equal(pane._modes.gmSnoozed.containerList.children.length,1);
  pane._modes.smart.active=true;mutated();assert.equal(smartList.children.length,1);assert.equal(pane._modes.gmSnoozed.containerList.children.length,0);mutated();assert.equal(smartList.children.length,1);
  menu.children[0].events.command({});assert.equal(smartList.children.length,0);assert.equal('data-gm-snooze-storage' in physical.attrs,false);controller.close();
});

test('re-entering an already open unified folder never closes its active database',()=>{
  const folder={URI:'mailbox://smart/Snoozed',flags:1,get msgDatabase(){throw Error('active view database must not be closed')}};
  const mail={accounts:{allServers:[{rootFolder:{containsChildNamed:()=>true,getChildNamed:()=>({URI:'imap://a/Thunder-G Snoozed'})}}],saveVirtualFolders(){}}};
  let wraps=0;const helper={wrapVirtualFolder(){wraps++;return {searchFolderURIs:'imap://a/Thunder-G Snoozed'}}};
  const scope=vm.createContext({});vm.runInContext(fs.readFileSync('thunder-g/snooze-ui.js','utf8'),scope);
  for(let i=0;i<20;i++){
    const ensure=scope.createUnifiedSnoozedFolder(mail,helper,{rootFolder:{containsChildNamed:()=>true,getChildNamed:()=>folder}},{Virtual:1});
    assert.equal(ensure(),folder);assert.equal(ensure(),folder);
  }
  assert.equal(wraps,20);
});
