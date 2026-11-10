function deferMailWindowWork(win, ready, run) {
  let closed=false,timer=null,frame=null,idle=null;
  function close(){
    if(closed)return;closed=true;
    if(timer!==null)win.clearTimeout(timer);
    if(frame!==null)win.cancelAnimationFrame(frame);
    if(idle!==null)win.cancelIdleCallback(idle);
    win.removeEventListener('unload',close);
  }
  function finish(){
    if(closed)return;
    close();run();
  }
  function isReady(){
    try{return ready();}catch(_){return false;} // A pane may be changing tabs.
  }
  function check(){
    timer=null;
    if(closed || win.closed){close();return;}
    if(!isReady()){timer=win.setTimeout(check,100);return;}
    // Give the styled native window a paint before optional native work.
    frame=win.requestAnimationFrame(()=>{
      frame=win.requestAnimationFrame(()=>{
        frame=null;
        if(closed)return;
        if(!isReady()){timer=win.setTimeout(check,100);return;}
        if(win.requestIdleCallback)idle=win.requestIdleCallback(()=>{idle=null;finish();},{timeout:500});
        else timer=win.setTimeout(()=>{timer=null;finish();},0);
      });
    });
  }
  win.addEventListener('unload',close,{once:true});
  timer=win.setTimeout(check,0);
  return {close};
}

// One startup presentation per mail window. Read native state rather than
// replacing DB-view callbacks (other controllers also use those callbacks).
function startupMailState(win, isStyled) {
  const tabmail = win.document.getElementById('tabmail');
  const tab = tabmail?.currentTabInfo;
  if (tab?.mode?.name && tab.mode.name !== 'mail3PaneTab') return {otherTab:true};
  const pane = tabmail?.currentAbout3Pane;
  const doc = pane?.document;
  if (!doc || doc.readyState !== 'complete' || !isStyled(doc)) return {};
  // Account Central is usable too, including installations without accounts.
  if (pane.paneLayout?.accountCentralVisible) return {usable:true, complete:true, pane};
  const tree = doc.getElementById('threadTree');
  const view = pane.gDBView;
  if (!tree || !view) return {pane};
  const rect = tree.getBoundingClientRect();
  const complete = pane.dbViewWrapperListener?.allMessagesLoaded === true;
  const rendered = tree.querySelector('tr.table-layout, tr.card-layout');
  // An empty but completed view is ready. A non-empty view must have actually
  // rendered a row; rowCount alone can become available before the list paints.
  const usable = rect.width > 0 && rect.height > 0 &&
    (view.rowCount > 0 ? !!rendered : complete);
  return {usable, pane, complete};
}

function installStartupSplash(win, {logoURI, isStyled, activityManager=null}) {
  const doc = win.document;
  const html = (tag, className) => {
    const node = doc.createElementNS('http://www.w3.org/1999/xhtml', tag);
    if (className) node.className = className;
    return node;
  };
  function translatedWords() {
    return {
      loading:gmText('Loading your mail…'), connecting:gmText('Connecting to your mailbox…'),
      waiting:gmText('Mail is not available yet. You can choose another folder while you wait.'),
      offline:gmText('You are offline. Downloaded mail is still available.'),
      open:gmText('Show mail'), close:gmText('Dismiss'), warning:gmText('Thunderbird reported a problem'),
    };
  }
  let words=translatedWords();
  let closed=false, revealed=false, fading=false, slow=false, warning=null;
  let timer=null, slowTimer=null, fadeTimer=null, frame=null, paintFrame=null;
  function readState() {
    try { return startupMailState(win,isStyled); }
    catch(error) {
      // A native view can disappear during tab/window teardown. Fail open.
      console.warn('Thunder-G: startup view is no longer available.',error);
      return {otherTab:true};
    }
  }
  const style=html('style');
  style.textContent=`
    #gm-startup { position:fixed; inset:0; z-index:2147483646; display:flex;
      align-items:center; justify-content:center; box-sizing:border-box;
      background:light-dark(#f6f8fc,#202124); color:light-dark(#202124,#e8eaed);
      font:14px/1.5 system-ui,sans-serif; color-scheme:inherit;
      opacity:1; transition:opacity 280ms ease; }
    #gm-startup[hidden] { display:none; }
    #gm-startup.gm-startup-fading { opacity:0; pointer-events:none; }
    #gm-startup .gm-startup-card { display:flex; flex-direction:column; align-items:center;
      text-align:center; gap:16px; padding:32px; max-width:360px; box-sizing:border-box; }
    #gm-startup img { width:112px; height:112px; object-fit:contain; }
    #gm-startup .gm-startup-name { font-size:26px; font-weight:550; letter-spacing:-.6px; }
    #gm-startup .gm-startup-text { margin:0; color:light-dark(#5f6368,#bdc1c6); }
    #gm-startup .gm-startup-track { width:180px; height:3px; overflow:hidden;
      border-radius:4px; background:light-dark(#dce5f5,#3c4043); }
    #gm-startup .gm-startup-track::after { content:''; display:block; width:45%; height:100%;
      border-radius:inherit; background:#4285f4; animation:gm-startup-progress 1.4s ease-in-out infinite; }
    #gm-startup button { font:inherit; color:light-dark(#185abc,#a8c7fa); background:transparent;
      border:0; border-radius:20px; padding:8px 16px; cursor:pointer; }
    #gm-startup button:hover { background:light-dark(#e8eef9,#303849); }
    #gm-startup button:focus-visible { outline:2px solid Highlight; outline-offset:2px; }
    #gm-startup.gm-startup-status { inset:auto 20px 20px auto; max-width:calc(100vw - 40px);
      border:1px solid light-dark(#dadce0,#5f6368); border-radius:16px;
      box-shadow:0 4px 24px #0002; pointer-events:none; }
    #gm-startup.gm-startup-status .gm-startup-card { padding:16px 20px; gap:8px; }
    #gm-startup.gm-startup-status img { width:32px; height:32px; }
    #gm-startup.gm-startup-status .gm-startup-name { display:none; }
    #gm-startup.gm-startup-status button { pointer-events:auto; }
    #gm-startup.gm-startup-static .gm-startup-track { display:none; }
    @keyframes gm-startup-progress { from { transform:translateX(-105%); } to { transform:translateX(325%); } }
    @media (prefers-reduced-motion:reduce) {
      #gm-startup { transition:none; }
      #gm-startup .gm-startup-track::after { animation:none; transform:translateX(60%); }
    }
    @media (forced-colors:active) {
      #gm-startup { background:Canvas; color:CanvasText; border-color:CanvasText; }
      #gm-startup .gm-startup-text { color:CanvasText; }
      #gm-startup .gm-startup-track::after { background:Highlight; }
    }
  `;
  const root=html('div'); root.id='gm-startup';
  const card=html('div','gm-startup-card');
  const logo=html('img'); logo.src=logoURI; logo.alt='';
  const name=html('div','gm-startup-name'); name.textContent='Thunder-G';
  const text=html('p','gm-startup-text'); text.textContent=words.loading;
  text.setAttribute('role','status'); text.setAttribute('aria-live','polite');
  const detail=html('p','gm-startup-text'); detail.hidden=true;
  const track=html('div','gm-startup-track'); track.setAttribute('aria-hidden','true');
  const button=html('button'); button.type='button'; button.textContent=words.open;
  card.append(logo,name,track,text,detail,button); root.append(card);

  function setText(node,value) { if(node.textContent!==value)node.textContent=value; }
  function updateStatus() {
    const offline=win.Services?.io?.offline === true;
    root.classList.add('gm-startup-status');
    root.classList.toggle('gm-startup-static',!!warning || offline);
    setText(text,warning ? words.warning : offline ? words.offline : words.connecting);
    const extra=warning?.displayText || words.waiting;
    setText(detail,extra); detail.hidden=!extra;
    button.textContent=words.close;
  }
  function fade() {
    if (fading || revealed) return;
    fading=true;
    // Let the native list paint before fading away the startup surface.
    frame=win.requestAnimationFrame(()=>{
      frame=null;
      paintFrame=win.requestAnimationFrame(()=>{
        paintFrame=null;
        if(closed)return;
        const current=readState();
        if(!current.usable && !current.otherTab && !slow && !warning) { fading=false; return; }
        win.clearTimeout(slowTimer); slowTimer=null;
        root.classList.add('gm-startup-fading');
        fadeTimer=win.setTimeout(()=>{
          fadeTimer=null; fading=false; revealed=true;
          root.classList.remove('gm-startup-fading');
          refresh();
        },win.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300);
      });
    });
  }
  function refresh() {
    if(closed)return;
    const state=readState();
    if(state.otherTab) { close(); return; }
    if(win.Services?.io?.offline === true)slow=true;
    if(!revealed) {
      if(state.usable || slow || warning)fade();
    // Readiness ends startup entirely. Thunderbird's global activity indicator
    // can stay busy for another account, calendar or a stalled connection.
    } else if(state.usable) {
      close(); return;
    } else updateStatus();
    if(timer===null)timer=win.setTimeout(()=>{timer=null;refresh();},revealed ? 400 : 100);
  }
  function onWarning(id,activity) {
    if(activity.bindingName!=='activity-warning-item')return;
    const server=readState().pane?.gFolder?.server;
    // Only associate a warning with this mailbox when native context agrees.
    if(!server || activity.contextObj!==server && (!server.key || activity.contextObj?.key!==server.key))return;
    warning=activity; refresh();
  }
  const activities={onAddedActivity:onWarning,onRemovedActivity(id){
    if(warning?.id===id){warning=null;refresh();}
  }};
  function close() {
    if(closed)return; closed=true;
    for(const id of [timer,slowTimer,fadeTimer])if(id!==null)win.clearTimeout(id);
    if(frame!==null)win.cancelAnimationFrame(frame);
    if(paintFrame!==null)win.cancelAnimationFrame(paintFrame);
    win.removeEventListener('unload',close);
    button.removeEventListener('click',close);
    unbindLanguage();
    activityManager?.removeListener(activities);
    root.remove(); style.remove();
  }
  button.addEventListener('click',close);
  const unbindLanguage=gmOnLanguageChange(()=>{
    words=translatedWords();
    if(!revealed){setText(text,words.loading);button.textContent=words.open;}
    refresh();
  });
  win.addEventListener('unload',close,{once:true});
  (doc.body || doc.documentElement).append(style,root);
  try { activityManager?.addListener(activities); }
  catch(_) { activityManager=null; /* Native error dialogs remain available. */ }
  slowTimer=win.setTimeout(()=>{slowTimer=null;slow=true;refresh();},8000);
  refresh();
  return {refresh,close};
}
