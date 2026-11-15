const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 const doc={activeElement:null};
 class Node{
  constructor(tag){this.tag=tag;this.children=[];this.listeners=new Map();this.attributes=new Map();this.style={};this.className='';this.classList={contains:value=>this.className.split(' ').includes(value)};this.textContent='';this.disabled=false;this.parentNode=null;}
  append(...nodes){for(const node of nodes){node.remove?.();this.children.push(node);node.parentNode=this;}}
  prepend(node){node.remove?.();this.children.unshift(node);node.parentNode=this;}
  after(node){node.remove?.();const parent=this.parentNode,index=parent.children.indexOf(this);parent.children.splice(index+1,0,node);node.parentNode=parent;}
  remove(){if(this.parentNode){const index=this.parentNode.children.indexOf(this);if(index>=0)this.parentNode.children.splice(index,1);this.parentNode=null;}}
  replaceChildren(...nodes){for(const child of [...this.children])child.remove();this.append(...nodes);}
  setAttribute(name,value){this.attributes.set(name,value);}
  addEventListener(type,fn){this.listeners.set(type,fn)}removeEventListener(type){this.listeners.delete(type)}
  fire(type,extra={}){return this.listeners.get(type)?.({target:this,...extra});}
  focus(){doc.activeElement=this;}
  matches(selector){return ['button','input'].includes(selector)?this.tag===selector:selector==='tr.table-layout'?this.tag==='tr'&&this.className==='table-layout':selector.startsWith('.')?this.className.split(' ').includes(selector.slice(1)):selector==='[role="status"]'?this.attributes.get('role')==='status':false;}
  querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 }
 doc.createElement=tag=>new Node(tag);doc.documentElement=new Node('html');
 const toolbar=new Node('div'),settings=new Node('button'),tree=new Node('table');settings.className='gm-inbox-settings';toolbar.append(settings);const pane=new Node('section'),bulkToolbar=new Node('div');bulkToolbar.className='gm-reading-toolbar';bulkToolbar.hidden=true;pane.append(tree,bulkToolbar);doc.documentElement.append(toolbar,pane);
 doc.querySelector=selector=>doc.documentElement.querySelector(selector);doc.getElementById=id=>id==='threadTree'?tree:id==='threadPane'?pane:null;
 const keywordSet=new Set(),folder={URI:'mailbox://Inbox',rootFolder:{URI:'account'},flags:0};
 const header={folder,messageKey:4,messageId:'id',getStringProperty:()=>[...keywordSet].join(' ')},row=new Node('tr'),line=new Node('span');row.className='table-layout';row.index=0;line.className='subject-line';row.append(line);tree.append(row);
 const observers=[];let selected=[header],observer,closedObserver=false,frames=new Map(),nextFrame=0,listener,removed=false;const values=new Map(),writes=[],seen=[];
 const prefs={getStringPref:(key,fallback)=>values.get(key)||fallback,setStringPref(key,value){values.set(key,value);writes.push([key,value])},prefHasUserValue:key=>values.has(key),clearUserPref:key=>values.delete(key),addObserver(){},removeObserver(){}};
 folder.msgDatabase={getMsgHdrForKey:key=>key===4?header:null};folder.messages=[header];
 const labelWrites=[];
 const mail={tags:{getAllTags:()=>[{key:'label',tag:'Research'}]},accounts:{allIdentities:[],allFolders:[folder]},mfn:{addListener(value){listener=value},removeListener(value){assert.equal(value,listener);removed=true}}};
 const windowEvents=new Map();
 const win={addEventListener:(type,fn)=>windowEvents.set(type,fn),removeEventListener:type=>windowEvents.delete(type),document:doc,AbortController,setTimeout,requestAnimationFrame(fn){frames.set(++nextFrame,fn);return nextFrame},cancelAnimationFrame:id=>frames.delete(id),MutationObserver:class{constructor(fn){observer=fn;observers.push(fn)}observe(){}disconnect(){closedObserver=true}},gDBView:{getSelectedMsgHdrs:()=>selected,getMsgHdrAt:()=>header}};
 const scope=vm.createContext({Map,Set,Date,JSON,Ci:{nsIMsgFolderNotificationService:{msgAdded:1,msgsDeleted:2,msgsMoveCopyCompleted:4,msgPropertyChanged:8},nsMsgFolderFlags:{Virtual:32}},assignedTags:()=>[]});
 for(const file of ['labels.js','label-suggestions.js','label-suggestions-ui.js'])vm.runInContext(fs.readFileSync('thunder-g/'+file,'utf8'),scope);
 scope.collectLabelSuggestionRecords=async selection=>{seen.push(selection);return {records:[],tags:[]}};
 scope.analyzeLabelSuggestions=async()=>({messages:10,training:4,results:[{status:'suggested',subject:'Research seminar',conversationKey:'conversation',account:'account',messageKeys:[JSON.stringify([header.folder.URI,4])],messageIds:['id'],labelKey:'label',labelName:'Research',strength:'Review carefully',examples:3,evidence:['word:seminar']}]});
 scope.prepareLabelSuggestionConfirmations=async proposals=>new Map(proposals.map(proposal=>[scope.labelSuggestionProposalKey(proposal),{status:'ready',labelKey:'label',labelName:'Research',records:[{key:JSON.stringify([folder.URI,4]),id:'id',account:'account'}]}]));
 scope.applyConversationLabel=(headers,key,add,_win,_refresh,options)=>{assert.equal(options.exactScope,true);labelWrites.push({headers,key,add});for(const header of headers){if(add)keywordSet.add(key);else keywordSet.delete(key);}listener.msgPropertyChanged(header,'keywords');};
 const installed=scope.installLabelSuggestions(win,mail,prefs);
 const find=caption=>doc.documentElement.querySelectorAll('button').find(button=>button.textContent===caption);
 return {labelWrites,keywordSet,values,windowEvents,pane,bulkToolbar,get toolbarObserver(){return observers[0]},doc,settings,toolbar,tree,row,line,win,scope,installed,mail,prefs,writes,seen,header,find,get listener(){return listener},setSelected:items=>selected=items,flush(){const queued=[...frames.values()];frames.clear();for(const fn of queued)fn()},get observer(){return observer},get removed(){return removed},get closedObserver(){return closedObserver}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('experimental action is beside Settings and dry-run uses current folder/search selection without writing or chips',async()=>{
 const f=fixture(),button=f.doc.querySelector('.gm-label-suggestions-button');assert.equal(f.toolbar.children[1],button);
 f.setSelected([f.header]);button.fire('click');f.find('Dry run').fire('click');await settle();
 assert.equal(f.seen.length,1);assert.equal(f.seen[0][0],f.header);assert.equal(f.writes.length,0);assert.equal(f.line.children.length,0);
 const status=f.doc.documentElement.querySelector('[role="status"]');assert.match(status.textContent,/Dry run complete/);assert.match(status.textContent,/nothing saved/);
 assert.ok(f.doc.documentElement.querySelector('.gm-label-suggestions-results').children.length);
 f.installed.close();assert.equal(f.removed,true);assert.equal(f.closedObserver,true);assert.equal(f.doc.querySelector('.gm-label-suggestions-button'),null);
});
test('Run persists only separate tentative proposals and draws dashed Suggested chips; mail changes remove them',async()=>{
 const f=fixture();f.doc.querySelector('.gm-label-suggestions-button').fire('click');f.find('Run · save suggestions').fire('click');await settle();
 assert.equal(f.writes.length,1);assert.equal(f.writes[0][0],'extensions.thunderg.experimentalLabelSuggestions');
 assert.equal(f.line.querySelector('.gm-label-suggestion-chip').textContent,'Suggested: Research');
 f.observer();f.flush();assert.equal(f.line.children.length,1,'rendering is idempotent on recycled list updates');
 f.listener.msgPropertyChanged(f.header,'preview');assert.equal(f.line.children.length,1,'preview cache updates do not invalidate label evidence');
 f.listener.msgPropertyChanged(f.header,'keywords');assert.equal(f.line.children.length,0);f.installed.close();
});
test('mail changes during analysis abort saving a stale report',async()=>{
 const f=fixture();let finish;
 f.scope.analyzeLabelSuggestions=()=>new Promise(resolve=>finish=resolve);
 f.doc.querySelector('.gm-label-suggestions-button').fire('click');f.find('Run · save suggestions').fire('click');await settle();
 f.listener.msgAdded();finish({messages:1,training:0,results:[]});await settle();assert.equal(f.writes.length,0);
 assert.match(f.doc.documentElement.querySelector('[role="status"]').textContent,/changed during analysis/);f.installed.close();
});
test('Cancel and pane unload stop pending analysis without writes; zero/oversize selections cannot start',async()=>{
 const f=fixture();let signal;
 f.scope.collectLabelSuggestionRecords=(_selected,_mail,environment)=>new Promise((_resolve,reject)=>{signal=environment.signal;signal.addEventListener('abort',()=>reject(Error('canceled')))});
 f.doc.querySelector('.gm-label-suggestions-button').fire('click');f.find('Run · save suggestions').fire('click');f.find('Cancel analysis').fire('click');await settle();
 assert.equal(signal.aborted,true);assert.equal(f.writes.length,0);f.installed.close();
 for(const count of [0,501]){const g=fixture();g.setSelected(Array(count).fill(g.header));g.doc.querySelector('.gm-label-suggestions-button').fire('click');assert.equal(g.find('Dry run').disabled,true);g.find('Run · save suggestions').fire('click');await settle();assert.equal(g.seen.length,0);g.installed.close();}
});

test('modal report blocks numeric label commands and L only while open and restores routing on close',()=>{
 const f=fixture(),guard=f.windowEvents.get('keydown');
 function event(key){return {key,preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true}};}
 const before=event('1');guard(before);assert.equal(before.stopped,undefined);
 f.doc.querySelector('.gm-label-suggestions-button').fire('click');
 for(const key of ['0','1','2','3','4','5','6','7','8','9','l','L']){const e=event(key);guard(e);assert.equal(e.stopped,true);assert.equal(e.prevented,true);}
 const tab=event('Tab');guard(tab);assert.equal(tab.stopped,undefined);
 f.find('Close').fire('click');const after=event('1');guard(after);assert.equal(after.stopped,undefined);
 f.installed.close();assert.equal(f.windowEvents.size,0);
});

test('same suggestion button stays reachable across folder/search bulk-selection toolbar transitions',async()=>{
 const f=fixture(),button=f.doc.querySelector('.gm-label-suggestions-button');
 assert.equal(button.parentNode,f.toolbar);
 for(let i=0;i<3;i++){
   f.pane.className='gm-bulk-selecting';f.bulkToolbar.hidden=false;f.toolbarObserver();
   assert.equal(button.parentNode,f.bulkToolbar,'selected-message actions own the button while the header is hidden');
   assert.equal(f.doc.documentElement.querySelectorAll('.gm-label-suggestions-button').length,1);
   f.pane.className='';f.bulkToolbar.hidden=true;f.toolbarObserver();assert.equal(button.parentNode,f.toolbar);
 }
 f.pane.className='gm-bulk-selecting';f.bulkToolbar.hidden=false;f.toolbarObserver();
 button.fire('click');f.find('Dry run').fire('click');await settle();assert.equal(f.seen.length,1);assert.equal(f.seen[0][0],f.header);assert.equal(f.writes.length,0);
 f.installed.close();assert.equal(f.bulkToolbar.children.includes(button),false);
});

test('100-message and 500-message folder/search selections enable dry-run and oversized selections explain the limit',async()=>{
 for(const count of [100,500]){
   const f=fixture();f.setSelected(Array.from({length:count},(_,i)=>({...f.header,messageKey:i})));
   f.doc.querySelector('.gm-label-suggestions-button').fire('click');
   assert.equal(f.find('Dry run').disabled,false);assert.equal(f.find('Run · save suggestions').disabled,false);
   assert.match(f.doc.documentElement.querySelector('[role="status"]').textContent,new RegExp('Ready to analyze '+count));
   f.find('Dry run').fire('click');await settle();assert.equal(f.seen[0].length,count);assert.equal(f.writes.length,0);f.installed.close();
 }
 const f=fixture();f.setSelected(Array(501).fill(f.header));f.doc.querySelector('.gm-label-suggestions-button').fire('click');
 assert.match(f.doc.documentElement.querySelector('[role="status"]').textContent,/Selected 501.*limit is 500/);assert.equal(f.find('Dry run').disabled,true);f.installed.close();
});
test('report text is selectable; Cmd/Ctrl+A selects the report and Copy remains native',()=>{
 const f=fixture();let selected;f.win.getSelection=()=>({selectAllChildren:node=>selected=node});
 f.doc.querySelector('.gm-label-suggestions-button').fire('click');
 const dialog=f.doc.querySelector('.gm-label-suggestions-panel'),shade=f.doc.querySelector('.gm-label-suggestions-shade');
 const style=f.doc.documentElement.children.find(node=>node.tag==='style');assert.match(style.textContent,/user-select:text!important/);
 for(const accel of ['metaKey','ctrlKey']){
   let prevented=false,stopped=false;
   shade.fire('keydown',{key:'a',[accel]:true,preventDefault(){prevented=true},stopImmediatePropagation(){stopped=true}});assert.equal(selected,dialog);assert.equal(prevented,true);assert.equal(stopped,true);
   let copiedStop=false;shade.fire('keydown',{key:'c',[accel]:true,stopPropagation(){copiedStop=true},preventDefault(){throw Error('must retain native Copy')}});assert.equal(copiedStop,false);
 }
 f.installed.close();
});
test('dry-run results are unchecked, explicit Confirm assigns the label, and per-row Undo preserves other labels',async()=>{
 const f=fixture();f.doc.querySelector('.gm-label-suggestions-button').fire('click');f.find('Dry run').fire('click');await settle();
 assert.equal(f.doc.documentElement.querySelector('input').checked,false);assert.equal(f.find('Confirm selected · assign labels').disabled,true);
 assert.equal(f.find('Confirm · assign label').disabled,false);assert.equal(f.labelWrites.length,0);assert.equal(f.writes.length,0);
 f.find('Confirm · assign label').fire('click');await settle();await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(f.labelWrites.length,1);assert.equal(f.labelWrites[0].add,true);assert.equal(f.labelWrites[0].headers[0],f.header);assert.equal(f.writes.length,0);
 assert.equal(f.find('Confirm · assign label'),undefined);assert.ok(f.find('Undo confirmation'));
 f.keywordSet.add('other-label');f.find('Undo confirmation').fire('click');
 assert.equal(f.labelWrites.length,2);assert.equal(f.labelWrites[1].add,false);assert.equal(f.keywordSet.has('label'),false);assert.equal(f.keywordSet.has('other-label'),true);f.installed.close();
});
test('Discard changes only the chosen proposal and never assigns labels; dry-run discard has no preference writes',async()=>{
 for(const dryRun of [true,false]){
   const f=fixture();f.doc.querySelector('.gm-label-suggestions-button').fire('click');f.find(dryRun?'Dry run':'Run · save suggestions').fire('click');await settle();
   f.find('Discard').fire('click');assert.equal(f.labelWrites.length,0);assert.equal(f.find('Discard'),undefined);
   assert.equal(f.writes.length,dryRun?0:2);assert.match(f.doc.documentElement.querySelector('[role="status"]').textContent,/discarded/);
   if(!dryRun)assert.equal(JSON.parse(f.writes.at(-1)[1]).proposals.length,0);f.installed.close();
 }
});
test('selected review controls act only on explicitly checked proposals',async()=>{
 const f=fixture();
 f.scope.analyzeLabelSuggestions=async()=>({messages:10,training:4,results:[1,2].map(i=>({status:'suggested',subject:'Subject '+i,conversationKey:'c'+i,account:'account',messageKeys:[JSON.stringify([f.header.folder.URI,4])],messageIds:['id'],labelKey:'label',labelName:'Research',strength:'Review carefully',examples:3,evidence:[]}))});
 f.doc.querySelector('.gm-label-suggestions-button').fire('click');f.find('Dry run').fire('click');await settle();
 const inputs=f.doc.documentElement.querySelectorAll('input');assert.equal(inputs.length,2);assert.ok(inputs.every(input=>input.checked===false));
 inputs[0].checked=true;inputs[0].fire('change');assert.equal(f.find('Discard selected').disabled,false);f.find('Discard selected').fire('click');
 assert.equal(f.doc.documentElement.querySelectorAll('input').length,1);assert.equal(f.labelWrites.length,0);assert.equal(f.writes.length,0);f.installed.close();
});
test('canceling fresh confirmation recheck performs no assignments',async()=>{
 const f=fixture();f.doc.querySelector('.gm-label-suggestions-button').fire('click');f.find('Dry run').fire('click');await settle();
 f.scope.prepareLabelSuggestionConfirmations=(_proposals,_mail,environment)=>new Promise((_resolve,reject)=>environment.signal.addEventListener('abort',()=>reject(Error('canceled'))));
 f.find('Confirm · assign label').fire('click');f.find('Cancel confirmation').fire('click');await settle();assert.equal(f.labelWrites.length,0);assert.match(f.doc.documentElement.querySelector('[role="status"]').textContent,/canceled/);f.installed.close();
});
test('Confirm selected sends only checked proposals to one fresh validation scan',async()=>{
 const f=fixture(),original=f.scope.analyzeLabelSuggestions;
 f.scope.analyzeLabelSuggestions=async()=>{const report=await original();report.results=[{...report.results[0],conversationKey:'first'},{...report.results[0],conversationKey:'second'}];return report;};
 const prepare=f.scope.prepareLabelSuggestionConfirmations,calls=[];f.scope.prepareLabelSuggestionConfirmations=(proposals,...rest)=>{calls.push(proposals);return prepare(proposals,...rest)};
 f.doc.querySelector('.gm-label-suggestions-button').fire('click');f.find('Dry run').fire('click');await settle();
 const inputs=f.doc.documentElement.querySelectorAll('input');inputs[1].checked=true;inputs[1].fire('change');f.find('Confirm selected · assign labels').fire('click');await settle();await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(calls.length,1);assert.equal(calls[0].length,1);assert.equal(calls[0][0].conversationKey,'second');assert.equal(f.labelWrites.length,1);
 assert.equal(f.doc.documentElement.querySelectorAll('input').length,1);assert.ok(f.find('Undo confirmation'));f.installed.close();
});
test('canceling a confirmation batch keeps completed rows undoable and does not apply remaining proposals',async()=>{
 const f=fixture(),original=f.scope.analyzeLabelSuggestions;let calls=0;
 f.scope.analyzeLabelSuggestions=async()=>{const report=await original();report.results=[{...report.results[0],conversationKey:'one'},{...report.results[0],conversationKey:'two'}];return report;};
 f.scope.confirmPreparedLabelSuggestion=()=>{calls++;f.find('Cancel confirmation').fire('click');return {status:'confirmed',receipt:{labelKey:'label',records:[]}}};
 f.doc.querySelector('.gm-label-suggestions-button').fire('click');f.find('Dry run').fire('click');await settle();f.find('Select all suggestions').fire('click');f.find('Confirm selected · assign labels').fire('click');await settle();await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(calls,1);assert.equal(f.doc.documentElement.querySelectorAll('input').length,1);assert.ok(f.find('Undo confirmation'));
 assert.match(f.doc.documentElement.querySelector('[role="status"]').textContent,/canceled.*1 conversations were confirmed/);f.installed.close();
});
test('historical saved proposals can be discarded but cannot assign a label without fresh analysis',()=>{
 const f=fixture();f.values.set('extensions.thunderg.experimentalLabelSuggestions',JSON.stringify({version:1,proposals:[{account:'account',conversationKey:'old',labelKey:'label',labelName:'Research',messageIds:['id']}]}));
 f.doc.querySelector('.gm-label-suggestions-button').fire('click');assert.equal(f.find('Confirm · assign label').disabled,true);f.find('Confirm · assign label').fire('click');assert.equal(f.labelWrites.length,0);
 f.find('Discard').fire('click');assert.equal(f.writes.length,1);assert.equal(JSON.parse(f.writes[0][1]).proposals.length,0);f.installed.close();
});

test('confirmed results use conversation chip colors and shape while tentative and undone rows stay distinct',async()=>{
 const f=fixture(),tag={key:'label',tag:'Teaching/Research',color:'#008577'};f.mail.tags.getAllTags=()=>[tag];
 f.doc.querySelector('.gm-label-suggestions-button').fire('click');f.find('Dry run').fire('click');await settle();
 assert.equal(f.doc.querySelector('.gm-label-suggestion-confirmed'),null);assert.ok(f.doc.querySelector('.gm-label-suggestion-chip'));
 f.find('Confirm · assign label').fire('click');await settle();await new Promise(resolve=>setTimeout(resolve,5));
 const chip=f.doc.querySelector('.gm-label-suggestion-confirmed'),colors=f.scope.chipColors(tag.color);
 assert.ok(chip);assert.equal(chip.textContent,'Teaching/Research');assert.equal(chip.style.backgroundColor,colors.background);assert.equal(chip.style.color,colors.foreground);
 assert.match(chip.style.backgroundColor,/light-dark/);assert.equal(chip.className.includes('gm-label-suggestion-chip'),false);
 assert.equal(chip.attributes.get('aria-label'),'Confirmed label: Teaching/Research');
 f.find('Undo confirmation').fire('click');assert.equal(f.doc.querySelector('.gm-label-suggestion-confirmed'),null);f.installed.close();
});
