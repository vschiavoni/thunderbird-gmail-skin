const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const scope=vm.createContext({Intl,gmText:text=>text});vm.runInContext(fs.readFileSync('thunder-g/snooze-ui.js','utf8'),scope);
function fixture(hours=8,minutes=17){
  const doc={activeElement:null,defaultView:{innerWidth:1280,innerHeight:800}};
  function element(tag){return {localName:tag,children:[],attributes:{},dataset:{},style:{},events:{},isConnected:true,offsetTop:0,offsetHeight:32,clientHeight:160,
    append(...nodes){for(const node of nodes){node.parent=this;node.offsetTop=this.children.length*32;this.children.push(node);}},
    replaceChildren(){this.children=[]},setAttribute(name,value){this.attributes[name]=String(value)},getAttribute(name){return this.attributes[name]},
    addEventListener(name,callback){(this.events[name]||=[]).push(callback)},focus(){doc.activeElement=this},scrollIntoView(){},
    contains(target){return target===this||this.children.some(child=>child.contains(target))},
    showPopover(){this.open=true},hidePopover(){this.open=false},
    getBoundingClientRect(){return this.className==='gm-snooze-time-trigger'?{left:700,top:300,bottom:356,width:248,height:56}:{width:248,height:252}},
    emit(name,properties={}){const event={...properties,preventDefault(){this.prevented=true},stopPropagation(){this.stopped=true}};for(const callback of this.events[name]||[])callback(event);return event;},
  };}
  doc.createElement=element;doc.createElementNS=(_ns,tag)=>element(tag);
  const panel=element('dialog');let changed=0;
  const picker=scope.createSnoozeTimePicker(doc,panel,new Date(2026,10,3,hours,minutes),'en',()=>changed++);panel.append(picker.element);
  const [input,trigger,popup]=picker.element.children;
  return {picker,panel,input,trigger,popup,doc,get changed(){return changed},lists:()=>popup.children.slice(0,2).map(column=>column.children[1])};
}
test('time picker offers real hour/minute selections and retains exact minutes',()=>{
  const f=fixture();assert.equal(f.trigger.localName,'button');f.trigger.onclick();assert.equal(f.popup.hidden,false);assert.equal(f.trigger.getAttribute('aria-expanded'),'true');
  const [hours,minutes]=f.lists();assert.equal(hours.children.length,24);assert.equal(minutes.children.length,60);
  hours.children[15].onclick();minutes.children[42].onclick();assert.equal(f.picker.getTime().hours,15);assert.equal(f.picker.getTime().minutes,42);assert.equal(f.changed,2);
  assert.equal(hours.children[15].getAttribute('aria-selected'),'true');assert.equal(minutes.children[42].getAttribute('aria-selected'),'true');
  f.popup.children[2].onclick();assert.equal(f.popup.hidden,true);assert.equal(f.doc.activeElement,f.trigger);
  f.trigger.onclick();assert.equal(f.doc.activeElement,f.lists()[0].children[15]);assert.equal(f.picker.getTime().minutes,42);
});
test('hour/minute lists support keyboard navigation, rollover and Escape without closing the parent',()=>{
  const f=fixture(23,59);f.trigger.emit('keydown',{key:'ArrowDown'});const [hours,minutes]=f.lists();
  hours.children[23].emit('keydown',{key:'ArrowDown'});assert.equal(f.picker.getTime().hours,0);assert.equal(f.doc.activeElement,hours.children[0]);
  minutes.children[59].emit('keydown',{key:'ArrowDown'});assert.equal(f.picker.getTime().minutes,0);
  minutes.children[0].emit('keydown',{key:'End'});assert.equal(f.picker.getTime().minutes,59);
  const event=f.popup.emit('keydown',{key:'Escape'});assert.equal(event.prevented,true);assert.equal(event.stopped,true);assert.equal(f.popup.hidden,true);
  assert.equal(f.trigger.getAttribute('aria-expanded'),'false');assert.equal(f.doc.activeElement,f.trigger);
});
test('clicking outside or closing the parent releases the time popover',()=>{
  const f=fixture();f.trigger.onclick();f.panel.emit('pointerdown',{target:f.lists()[0].children[8]});assert.equal(f.popup.hidden,false);
  f.panel.emit('pointerdown',{target:f.panel});assert.equal(f.popup.hidden,true);
  f.trigger.onclick();f.panel.emit('close');assert.equal(f.popup.hidden,true);
});

test('manual time entry and picker selection stay synchronized, with invalid input rejected',()=>{
  const f=fixture();f.input.value='23:47';f.input.emit('input');
  assert.equal(f.picker.getTime().hours,23);assert.equal(f.picker.getTime().minutes,47);
  f.trigger.onclick();assert.equal(f.lists()[0].children[23].getAttribute('aria-selected'),'true');
  assert.equal(f.lists()[1].children[47].getAttribute('aria-selected'),'true');
  f.lists()[1].children[12].onclick();assert.match(f.input.value,/11:12 PM/);
  f.input.value='12:05 AM';assert.equal(f.picker.getTime().hours,0);
  for(const invalid of ['25:00','12:60','0:15 PM','abc','']){f.input.value=invalid;assert.equal(f.picker.getTime(),null);}
});
