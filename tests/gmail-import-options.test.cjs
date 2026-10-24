const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
class Element {
 constructor(){this.children=[];this.events={};this.dataset={};this.disabled=false;this.hidden=false;this.value='';this.checked=false;}
 append(...nodes){this.children.push(...nodes)} replaceChildren(...nodes){this.children=nodes}
 setAttribute(name,value){this[name]=value} addEventListener(name,fn){this.events[name]=fn}
 querySelectorAll(selector){const nodes=[];const walk=node=>{for(const child of node.children){if(selector==='input'&&child.type==='checkbox')nodes.push(child);walk(child)}};walk(this);return nodes}
}
function fixture(){
 const els=new Map(),writes=[],actions=[];let selected=[],root,token=0;
 const el=id=>{if(!els.has(id))els.set(id,new Element());return els.get(id)};
 el('gmail-root').value='GMAIL-Labels';el('gmail-dry-run').checked=true;
 const labels=[{id:'a',name:'Work'},{id:'b',name:'Work/Project'}];
 const api=async(action,json)=>{
  actions.push(action);const data=JSON.parse(json);
  if(action==='status')return JSON.stringify({connected:false,labels:[]});
  if(action==='connect')return JSON.stringify({connected:true,email:'verified@example.invalid',labels,systemLabelsExcluded:7});
  if(action==='preview'){selected=data.selected;root=data.root;return JSON.stringify({email:'verified@example.invalid',previewToken:String(++token),counts:{create:selected.length?selected.length+1:0,skip:0,conflict:0},rows:selected.map(id=>({path:root+'/'+labels.find(l=>l.id===id).name,status:'create'}))})}
  if(action==='import'){writes.push(...selected);return JSON.stringify({created:selected,skipped:[],failed:[]})}
  return '{}';
 };
 const scope=vm.createContext({document:{getElementById:el,createElement:()=>new Element()},window:{addEventListener(){}},browser:{inlineLabels:{gmailLabelImport:async(...args)=>JSON.stringify({ok:true,result:JSON.parse(await api(...args))})}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../inline-labels/gmail-import-options.js'),'utf8'),scope);
 return {el:id=>el('gmail-'+id),writes,actions};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('settings are dormant by default; connecting auto-previews and dry-run prevents creation',async()=>{
 const f=fixture();await tick();assert.deepEqual(f.actions,['status']);assert.equal(f.el('import').disabled,true);
 await f.el('connect').events.click();assert.deepEqual(f.actions,['status','connect','preview']);
 assert.match(f.el('account').textContent,/verified@example.invalid/);assert.equal(f.el('import').disabled,true);assert.equal(f.writes.length,0);
 await f.el('import').events.click();assert.equal(f.writes.length,0,'even a dispatched click cannot import with dry run checked');
 f.el('dry-run').checked=false;f.el('dry-run').events.change();assert.equal(f.el('import').disabled,false);
 await f.el('import').events.click();assert.deepEqual(f.writes,['a','b']);assert.equal(f.el('dry-run').checked,true);assert.equal(f.el('import').disabled,true);
});
test('branch deselection, root changes, and cancel invalidate the preview and never create labels',async()=>{
 const f=fixture();await tick();await f.el('connect').events.click();
 const parent=f.el('remote-labels').children[0].children[0];parent.checked=false;parent.events.change();
 assert.equal(f.el('remote-labels').children[1].children[0].checked,false,'excluding a parent excludes descendants');
 assert.equal(f.el('import').disabled,true);await f.el('preview').events.click();
 assert.match(f.el('summary').textContent,/0 labels to create/);
 f.el('root').value='Other';f.el('root').events.input();assert.equal(f.el('preview-table').hidden,true);
 await f.el('cancel').events.click();assert.match(f.el('feedback').textContent,/No labels were created/);assert.equal(f.writes.length,0);
});
test('untrusted label strings are rendered as text and source credentials are not persisted',async()=>{
 const f=fixture();await tick();f.el('client-secret').value='session-only';await f.el('connect').events.click();
 assert.equal(f.el('client-secret').value,'');assert.equal(f.el('preview-rows').children[0].children[0].textContent,'GMAIL-Labels/Work');
 assert.equal(f.el('preview-rows').children[0].children[0].innerHTML,undefined);
 await f.el('disconnect').events.click();assert.equal(f.el('import-controls').hidden,true);assert.equal(f.el('remote-labels').children.length,0);
});
