const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const scope=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../inline-labels/conversation.js'),'utf8'),scope);
test('conversation styles reach nested open components, track additions, and clean up without touching mail iframes',async()=>{
  function root(){return {hosts:[],styles:[],queries:0,querySelectorAll(selector){this.queries++;assert.ok(!selector.includes('iframe'));return this.hosts},
    append(style){style.parent=this;this.styles.push(style)}}}
  const doc=root(),outer=root(),inner=root();
  doc.hosts=[{shadowRoot:outer}];outer.hosts=[{shadowRoot:inner}];
  doc.createElement=()=>({remove(){this.parent.styles=this.parent.styles.filter(s=>s!==this)}});
  let callback,disconnected=false;const observed=[];
  const win={document:doc,MutationObserver:class{constructor(fn){callback=fn}observe(r){observed.push(r)}disconnect(){disconnected=true}},
    customElements:{whenDefined:async()=>{}},addEventListener(){},removeEventListener(){}};
  const controller=scope.installConversationStyle(win,'.subject { font-size:22px }');
  await Promise.resolve();
  assert.equal(outer.styles.length,1);assert.equal(inner.styles.length,1);
  callback([{addedNodes:[]}]);assert.equal(outer.styles.length,1,'updates do not duplicate styles');
  const documentQueries=doc.queries;
  const late=root();const inserted={shadowRoot:late,querySelectorAll:()=>[],matches:()=>true};inner.hosts.push(inserted);callback([{addedNodes:[inserted]}]);
  assert.equal(late.styles.length,1);assert.equal(doc.queries,documentQueries,'a subtree insertion does not rescan the document');assert.equal(observed.length,4);
  controller.close();assert.equal(disconnected,true);
  assert.equal(outer.styles.length+inner.styles.length+late.styles.length,0);
  callback([{addedNodes:[]}]);assert.equal(outer.styles.length,0,'closed controller cannot add styles');
});

test('lazy Conversations browser is styled on creation, navigation, and replacement; listeners stop on close',()=>{
  let current=null,changed,disconnected=false;const seen=[];
  function browser(uri){return {contentDocument:{documentURI:uri},events:{},
    addEventListener(name,fn){this.events[name]=fn},removeEventListener(name){delete this.events[name]}}}
  const win={document:{getElementById:()=>current},MutationObserver:class{
    constructor(fn){changed=fn}observe(){}disconnect(){disconnected=true}}};
  const watcher=scope.watchConversationBrowser(win,doc=>seen.push(doc.documentURI));
  current=browser('chrome://conversations/content/experiment-api/stub.html');changed();
  assert.equal(seen.length,1,'lazy browser content is discovered');
  current.events.load();assert.equal(seen.length,2,'later navigation is observed');
  const old=current;current=browser('about:blank');changed();
  assert.equal(old.events.load,undefined,'replaced browser listener is removed');
  watcher.close();assert.equal(disconnected,true);assert.equal(current.events.load,undefined);
  changed();assert.equal(seen.length,3,'closed watcher cannot reattach');
});

test('conversation title tags aggregate by key, preserve names and ignore invalid lists',()=>{
  const list=tags=>({getAttribute:()=>tags});
  const result=scope.conversationTitleLabels([
    list('[{"key":"a","name":"Project <A>","color":"#ff0000"}]'),
    list('[{"key":"a","name":"Project <A>"},{"key":"b","name":"Work"}]'),
    list('invalid'),list('{}')]);
  assert.equal(result.length,2);assert.equal(result[0].name,'Project <A>');
  assert.equal(result[1].key,'b');
});

test('message chips use native assignments for the exact Conversations ID, including removal',()=>{
  let attributes={msgid:'42',tags:'[]'}, callback, focus;
  const list={matches:s=>s==='ul[is="message-tags"]',querySelectorAll:()=>[],
    getAttribute:n=>attributes[n]??null,setAttribute:(n,v)=>{attributes[n]=v},removeAttribute:n=>delete attributes[n]};
  const doc={querySelectorAll:s=>s==='ul[is="message-tags"]'?[list]:[]};
  let labels=[{key:'ta',name:'TA',color:'#ff0088'}];
  const win={document:doc,MutationObserver:class{constructor(fn){callback=fn}observe(){}disconnect(){}},
    customElements:{whenDefined:()=>new Promise(()=>{})},
    addEventListener:(n,fn)=>{if(n==='focus')focus=fn},removeEventListener(){}};
  const controller=scope.installConversationStyle(win,'',id=>{assert.equal(id,42);return labels});
  assert.equal(JSON.parse(attributes.tags)[0].name,'TA');
  labels=[];focus();assert.equal(attributes.tags,'[]','removed native tags disappear');
  attributes.msgid='invalid';attributes.tags='[]';callback([{type:'attributes',attributeName:'msgid',target:list}]);
  assert.equal(attributes.tags,'[]','invalid IDs cannot borrow tags from another message');
  controller.close();
});

test('expanded message renders its own chips below recipients, updates and cleans up',()=>{
  function element(){return {children:[],events:{},addEventListener(n,fn){this.events[n]=fn},style:{setProperty(){}},setAttribute(){},append(node){node.parentNode=this;this.children.push(node)},remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this)}}}
  const header=element(),classes=new Set();
  const attrs={expanded:'true',msgid:'7',tags:'[{"key":"ta","name":"TA","color":"#ff0088"}]'};
  const list={matches:s=>s==='ul[is="message-tags"]',getAttribute:n=>attrs[n]??null,setAttribute:(n,v)=>attrs[n]=v,
    querySelectorAll:()=>[],closest:()=>({querySelector:()=>header}),classList:{add:n=>classes.add(n),remove:n=>classes.delete(n)}};
  const doc={createElement:element,querySelectorAll:s=>s==='ul[is="message-tags"]'?[list]:[]};
  let changed;
  const win={document:doc,MutationObserver:class{constructor(fn){changed=fn}observe(){}disconnect(){}},customElements:{whenDefined:()=>new Promise(()=>{})},addEventListener(){},removeEventListener(){}};
  const controller=scope.installConversationStyle(win,'');
  assert.equal(header.children[0].children[0].textContent,'TA');
  let removed=0;
  const originalQuery=list.querySelectorAll;
  list.querySelectorAll=selector=>selector==='li' ? [
    {getAttribute:()=> 'other',querySelector:()=>({click(){throw new Error('wrong tag')}})},
    {getAttribute:()=> 'ta',querySelector:()=>({click(){removed++}})}
  ] : [];
  const remove=header.children[0].children[0].children[0];
  remove.events.click({preventDefault(){},stopPropagation(){}});
  assert.equal(removed,1,'remove delegates only to the matching tag on this message');
  list.querySelectorAll=originalQuery;
  changed([{type:'attributes',attributeName:'tags',target:list}]);
  assert.equal(header.children.length,1,'no duplicate chips');
  attrs.tags='[]';changed([{type:'attributes',attributeName:'tags',target:list}]);
  assert.equal(header.children.length,0,'removing the tag removes the message chip');
  controller.close();assert.equal(classes.size,0);
});
