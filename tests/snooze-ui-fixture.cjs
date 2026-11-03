// Small DOM harness for dialog lifetime and background-operation contracts.
module.exports=function uiFixture(){
  const timers=new Map(),doc={activeElement:null,modals:new Set()},win={document:doc,innerWidth:1280,innerHeight:800,setTimeout(fn){timers.set(timers.size+1,fn);return timers.size;},clearTimeout(id){timers.delete(id)}};doc.defaultView=win;
  function element(tag){
    const attrs={},events={},classes=new Set();let text='';
    const node={localName:tag,children:[],parent:null,dataset:{},style:{},disabled:false,hidden:false,tabIndex:0,
      get isConnected(){return this===doc.documentElement||!!this.parent?.isConnected},
      set textContent(value){text=String(value);this.children=[];},get textContent(){return text+this.children.map(child=>child.textContent).join('')},
      setAttribute(name,value){attrs[name]=String(value)},getAttribute(name){return name==='tabindex'?String(this.tabIndex):attrs[name]},
      append(...children){for(const child of children){child.remove();child.parent=this;this.children.push(child);}},
      replaceChildren(...children){for(const child of [...this.children])child.remove();text='';this.append(...children);},
      remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);this.parent=null;},
      addEventListener(name,callback){(events[name]||=[]).push(callback)},
      emit(name,event={}){for(const callback of events[name]||[])callback(event);},
      contains(target){return this===target||this.children.some(child=>child.contains(target));},
      focus(){doc.activeElement=this},select(){},scrollIntoView(){},
      showModal(){this.open=true;doc.modals.add(this)},close(){this.open=false;doc.modals.delete(this);this.emit('close')},
      showPopover(){this.popoverOpen=true},hidePopover(){this.popoverOpen=false},
      getBoundingClientRect(){return {left:400,bottom:100,top:60,width:264,height:224}},
      matches(selector){
        if(selector===':popover-open')return !!this.popoverOpen;
        const tag=selector.match(/^[a-z]+/)?.[0];if(tag&&tag!==this.localName)return false;
        const names=new Set((this.className||'').split(/\s+/).concat([...classes]));
        for(const match of selector.matchAll(/(?<!:not\()\.([\w-]+)/g))if(!names.has(match[1]))return false;
        for(const [,name,value] of selector.matchAll(/\[([^=\]]+)="([^"]*)"\]/g))if(this.getAttribute(name)!==value)return false;
        if(selector.includes(':not(:disabled)')&&this.disabled)return false;
        if(selector.includes(':not(.gm-snooze-outside)')&&names.has('gm-snooze-outside'))return false;
        return true;
      },
      querySelectorAll(selector){const selectors=selector.split(',').map(value=>value.trim()),result=[];function visit(parent){for(const child of parent.children){if(selectors.some(selector=>child.matches(selector)))result.push(child);visit(child)}}visit(this);return result;},
      querySelector(selector){return this.querySelectorAll(selector)[0]||null},
      click(){if(!this.disabled)this.onclick?.();},
    };
    node.classList={toggle(name,on){if(on)classes.add(name);else classes.delete(name)}};
    return node;
  }
  doc.createElement=element;doc.createElementNS=(_namespace,tag)=>element(tag);doc.documentElement=element('html');
  doc.querySelector=selector=>doc.documentElement.querySelector(selector);doc.getElementById=()=>null;
  return {doc,win};
};
