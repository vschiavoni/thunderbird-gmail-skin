const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('Snoozed folder mode toggles, remembers visibility, discovers new account folders and cleans up',()=>{
  function element(){return {children:[],attrs:{},events:{},append(child){this.children.push(child)},insertBefore(child){this.append(child)},replaceChildren(){this.children=[]},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},addEventListener(k,v){this.events[k]=v},removeEventListener(k){delete this.events[k]},remove(){this.removed=true}};}
  const menu=element(),tree=element(),head=element(),separator=element();
  const doc={head,createElement:element,createXULElement:element,getElementById:id=>({folderTree:tree,folderModesContextMenuPopup:menu,separatorAfterFolderModes:separator}[id])};
  let active=['all'],saved=true,callback,unsubscribed=false;
  const pane={_modes:{all:{}},get activeModes(){return [...active]},set activeModes(values){active=values;const mode=this._modes.gmSnoozed;if(values.includes('gmSnoozed')){if(!mode.active){mode.containerHeader={querySelector:()=>element()};mode.containerList=element();mode.init();}mode.active=true;}else mode.active=false;},_createFolderRow:(_name,folder,style)=>({uri:folder.URI,style}),updateContextCheckedFolderMode(){},toggleFolderMode(event){this.activeModes=event.target.enabled?['all','gmSnoozed']:['all']}};
  const folders=[{URI:'imap://a/snoozed'}],mail={accounts:{allServers:[{rootFolder:{containsChildNamed:()=>true,getChildNamed:()=>folders[0]}}]}};
  const prefs={getBoolPref:()=>saved,setBoolPref:(_key,value)=>saved=value};
  const scope=vm.createContext({gmText:text=>text});vm.runInContext(fs.readFileSync('thunder-g/snooze-ui.js','utf8'),scope);
  const install=()=>scope.installSnoozedFolderMode({document:doc,folderPane:pane},{subscribe(fn){callback=fn;return()=>unsubscribed=true}},mail,prefs);
  let controller=install();assert.deepEqual([...active],['all','gmSnoozed']);assert.equal(pane._modes.gmSnoozed.containerList.children[0].uri,folders[0].URI);
  mail.accounts.allServers.push({rootFolder:{containsChildNamed:()=>true,getChildNamed:()=>({URI:'imap://b/snoozed'})}});callback();assert.equal(pane._modes.gmSnoozed.containerList.children.length,2);
  const item=menu.children[0];item.events.command({target:{enabled:false}});assert.equal(saved,false);
  controller.close();assert.equal(unsubscribed,true);assert.equal(pane._modes.gmSnoozed,undefined);assert.deepEqual([...active],['all']);
  controller=install();assert.deepEqual([...active],['all']);controller.close();
});
