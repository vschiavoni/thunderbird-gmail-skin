const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const catalogs=Object.fromEntries(['en','it'].map(language=>[language,JSON.parse(fs.readFileSync(path.join(__dirname,`../thunder-g/_locales/${language}/messages.json`),'utf8'))]));
const scope=require('./localization-context.cjs').createContext({THUNDER_G_CATALOGS:catalogs});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/startup.js'),'utf8'),scope);

function fixture({rows=0,complete=false,rendered=false,styled=true,offline=false,reduced=false,locale='it',language=locale}={}) {
  scope.gmSetLanguage(language);
  let now=0,sequence=0;
  const tasks=new Map(),frames=new Map(),events=new Map();
  function element(tag) {
    const classes=new Set();
    return {tag,children:[],attributes:{},textContent:'',hidden:false,
      classList:{add(...names){names.forEach(n=>classes.add(n))},remove(...names){names.forEach(n=>classes.delete(n))},
        contains:n=>classes.has(n),toggle(n,on){if(on)classes.add(n);else classes.delete(n)}},
      setAttribute(n,v){this.attributes[n]=v},
      append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n)}},
      remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this)},
      addEventListener(n,fn){this[n]=fn},removeEventListener(n){delete this[n]}};
  }
  const body=element('body'),status={value:''};
  const tree={getBoundingClientRect:()=>({width:900,height:500}),querySelector:()=>rendered?{}:null};
  const pane={document:{readyState:'complete',getElementById:()=>tree},
    gDBView:{rowCount:rows},dbViewWrapperListener:{allMessagesLoaded:complete},
    gFolder:{server:{key:'server1'}},gViewWrapper:{isFolderLoading:()=>false},paneLayout:{accountCentralVisible:false}};
  const tabmail={currentAbout3Pane:pane,currentTabInfo:{mode:{name:'mail3PaneTab'}}};
  const doc={body,documentElement:body,createElementNS:(ns,tag)=>element(tag),
    getElementById:id=>id==='tabmail'?tabmail:id==='statusText'?status:null};
  const activities={addListener(fn){this.listener=fn},removeListener(fn){assert.equal(this.listener,fn);delete this.listener}};
  const win={document:doc,Services:{locale:{appLocaleAsBCP47:locale},io:{offline}},MsgStatusFeedback:{_meteorsSpinning:false},
    setTimeout(fn,delay){tasks.set(++sequence,{fn,at:now+delay});return sequence},clearTimeout:id=>tasks.delete(id),
    requestAnimationFrame(fn){frames.set(++sequence,fn);return sequence},cancelAnimationFrame:id=>frames.delete(id),
    matchMedia:()=>({matches:reduced}),addEventListener:(n,fn)=>events.set(n,fn),removeEventListener:n=>events.delete(n)};
  const controller=scope.installStartupSplash(win,{logoURI:'logo.svg',isStyled:()=>styled,activityManager:activities});
  const root=body.children.find(n=>n.id==='gm-startup'),card=root.children[0];
  function advance(ms){
    const end=now+ms;
    for(;;){
      const next=[...tasks].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!next)break;
      tasks.delete(next[0]);now=next[1].at;next[1].fn();
    }
    now=end;
  }
  function paint(){const pending=[...frames];frames.clear();for(const [,fn]of pending)fn()}
  return {controller,root,card,pane,tree,tabmail,win,body,status,tasks,frames,events,activities,advance,paint,
    render(value=true){rendered=value},style(value=true){styled=value},
    reveal(){paint();paint();advance(reduced?0:300)},
    assertClean(){assert.equal(body.children.length,0);assert.equal(tasks.size,0);assert.equal(frames.size,0);assert.equal(events.size,0);assert.equal(activities.listener,undefined);assert.equal(scope.gmLanguageListeners.size,0)}};
}

test('startup waits for styled, visible rows, then ends even if native background sync stays busy',()=>{
  const f=fixture({rows:10,styled:false});
  f.win.MsgStatusFeedback._meteorsSpinning=true;
  f.pane.gViewWrapper.isFolderLoading=()=>true;
  f.pane.gViewWrapper.searching=true;
  f.status.value='Connected to outlook.office365.com…';
  assert.equal(f.card.children[0].src,'logo.svg');assert.equal(f.card.children[1].textContent,'Thunder-G');
  assert.equal(f.card.children[3].textContent,'Caricamento della posta…');
  f.controller.refresh();assert.equal(f.frames.size,0,'rowCount without rendering is insufficient');
  f.render();f.controller.refresh();assert.equal(f.frames.size,0,'skin installation must finish too');
  f.style();f.controller.refresh();assert.equal(f.frames.size,1);
  f.paint();assert.equal(f.root.classList.contains('gm-startup-fading'),false,'native list gets a paint first');
  f.paint();assert.equal(f.root.classList.contains('gm-startup-fading'),true);
  f.advance(300);
  f.assertClean();
  assert.equal(f.root.classList.contains('gm-startup-status'),false,'ready mail never turns into a floating update card');
  f.advance(60000);f.controller.refresh();f.assertClean();
});

test('a completed empty folder and Account Central both dismiss startup',()=>{
  for(const accountCentral of [false,true]){
    const f=fixture({complete:!accountCentral});
    f.pane.paneLayout.accountCentralVisible=accountCentral;f.controller.refresh();f.reveal();f.assertClean();
  }
});

test('a slow empty mailbox releases the full overlay after eight seconds and recovers when ready',()=>{
  const f=fixture();f.advance(7900);assert.equal(f.frames.size,0);
  f.advance(100);f.reveal();
  assert.equal(f.root.classList.contains('gm-startup-status'),true);
  assert.equal(f.card.children[3].textContent,'Connessione alla casella…');
  assert.match(f.card.children[4].textContent,/un’altra cartella/);
  f.win.MsgStatusFeedback._meteorsSpinning=true;
  f.pane.dbViewWrapperListener.allMessagesLoaded=true;f.advance(400);f.assertClean();
});

test('offline startup releases navigation immediately and respects reduced motion',()=>{
  const f=fixture({offline:true,reduced:true});f.reveal();
  assert.equal(f.root.classList.contains('gm-startup-static'),true);
  assert.match(f.card.children[3].textContent,/offline/);
  f.pane.gDBView.rowCount=1;f.render();f.pane.dbViewWrapperListener.allMessagesLoaded=true;
  f.advance(400);f.assertClean();
});

test('native warnings are scoped to this account, render literally and can be dismissed',()=>{
  const f=fixture();const listener=f.activities.listener;
  listener.onAddedActivity(1,{bindingName:'activity-warning-item',contextObj:{key:'other'},displayText:'unrelated'});
  assert.equal(f.frames.size,0);
  listener.onAddedActivity(2,{id:2,bindingName:'activity-warning-item',contextObj:f.pane.gFolder.server,displayText:'Server <error>'});
  f.reveal();assert.equal(f.card.children[4].textContent,'Server <error>');
  assert.equal(f.root.classList.contains('gm-startup-static'),true);
  f.card.children[5].click();f.assertClean();
});

test('switching to another tab, closing or skipping cancels every pending callback',()=>{
  for(const action of ['tab','unload','skip','disable']){
    const f=fixture({rows:3,rendered:true});
    if(action==='tab'){f.tabmail.currentTabInfo.mode.name='calendar';f.controller.refresh()}
    if(action==='unload')f.events.get('unload')();
    if(action==='skip')f.card.children[5].click();
    if(action==='disable')f.controller.close();
    f.assertClean();f.controller.close();
  }
});

test('readiness is checked again before fading, and a later slow fallback is retained',()=>{
  const f=fixture({rows:3,rendered:true});f.paint();f.render(false);f.paint();
  assert.equal(f.root.classList.contains('gm-startup-fading'),false);
  f.advance(8000);f.reveal();assert.equal(f.root.classList.contains('gm-startup-status'),true);
  f.controller.close();f.assertClean();
});

test('a hidden list does not count as usable; English is the default outside Italian',()=>{
  const f=fixture({rows:1,rendered:true,complete:true,locale:'en-US'});
  f.tree.getBoundingClientRect=()=>({width:0,height:0});f.paint();f.paint();
  assert.equal(f.root.classList.contains('gm-startup-fading'),false);
  assert.equal(f.card.children[3].textContent,'Loading your mail…');
  f.controller.close();f.assertClean();
});

test('splash respects the interface override and updates live without copying global connection status',()=>{
  const f=fixture({locale:'en-US',language:'it'});
  assert.equal(f.card.children[3].textContent,'Caricamento della posta…');
  scope.gmSetLanguage('en');
  assert.equal(f.card.children[3].textContent,'Loading your mail…');
  assert.equal(f.card.children[5].textContent,'Show mail');
  f.advance(8000);f.reveal();
  f.status.value='Native status text';scope.gmSetLanguage('it');
  assert.equal(f.card.children[3].textContent,'Connessione alla casella…');
  assert.match(f.card.children[4].textContent,/un’altra cartella/);
  assert.equal(f.card.children[5].textContent,'Chiudi');
  f.controller.close();f.assertClean();
});

test('an earlier account warning cannot keep startup open after messages become usable',()=>{
  const f=fixture();
  f.activities.listener.onAddedActivity(1,{id:1,bindingName:'activity-warning-item',contextObj:f.pane.gFolder.server,displayText:'Connection failed'});
  f.reveal();
  f.pane.gDBView.rowCount=1;f.render();f.controller.refresh();f.assertClean();
});

test('optional window work waits for readiness and a paint, and cancels on unload',()=>{
  const tasks=new Map(),frames=new Map(),idle=new Map(),events=new Map();let id=0,ready=false,runs=0;
  const win={setTimeout(fn){tasks.set(++id,fn);return id},clearTimeout:id=>tasks.delete(id),
    requestAnimationFrame(fn){frames.set(++id,fn);return id},cancelAnimationFrame:id=>frames.delete(id),
    requestIdleCallback(fn){idle.set(++id,fn);return id},cancelIdleCallback:id=>idle.delete(id),
    addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
  const step=map=>{const [id,fn]=map.entries().next().value;map.delete(id);fn()};
  const work=scope.deferMailWindowWork(win,()=>ready,()=>runs++);
  step(tasks);assert.equal(frames.size,0);assert.equal(tasks.size,1);
  ready=true;step(tasks);step(frames);assert.equal(runs,0);step(frames);
  assert.equal(runs,0);step(idle);assert.equal(runs,1);assert.equal(events.size,0);
  work.close();assert.equal(runs,1);
  for(const stage of ['timer','firstFrame','secondFrame','idle']){
    scope.deferMailWindowWork(win,()=>true,()=>runs++);
    if(stage!=='timer')step(tasks);
    if(['secondFrame','idle'].includes(stage))step(frames);
    if(stage==='idle')step(frames);
    events.get('unload')();
    assert.equal(tasks.size+frames.size+idle.size+events.size,0,stage+' is cancelled');
    assert.equal(runs,1);
  }
});
