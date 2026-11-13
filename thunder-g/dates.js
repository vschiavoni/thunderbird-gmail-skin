/* Presentation only: never changes stored dates, sorting, or message metadata. */
function compactMessageDate(timestamp, now = new Date(), locale, formatters = new Map()) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime()) || timestamp <= 0) return null;
  const today = date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  const kind=today?'time':date.getFullYear()===now.getFullYear()?'day':'year';
  function format(key,options) {
    if(!formatters.has(key))formatters.set(key,new Intl.DateTimeFormat(locale,options));
    return formatters.get(key).format(date);
  }
  return {
    short: format(kind,today?{hour:'numeric',minute:'2-digit'}:
      kind==='day'?{month:'short',day:'numeric'}:{year:'numeric',month:'short',day:'numeric'}),
    full: format('full',{weekday:'long', year:'numeric', month:'long',
      day:'numeric', hour:'numeric', minute:'2-digit', second:'2-digit', timeZoneName:'short'})
  };
}

function installCompactDates(win) {
  const doc = win.document;
  let closed = false, prototype, original, wrapped, timer;
  // Detached virtual rows must be collectable while scrolling through folders.
  let saved = new WeakMap();
  const formatters = new Map();
  const snooze=typeof thunderGSnooze!=='undefined'?thunderGSnooze:null;
  let locale = gmLocale() || win.Services?.locale?.appLocalesAsBCP47 || win.navigator.languages;
  function returnedNotice(row,notice){
    const existing=row.querySelector('.gm-snooze-returned');
    if(!notice){existing?.remove?.();return;}
    const line=row.querySelector('.subject-line');
    if(!line?.append)return;
    const node=existing||doc.createElement('span');node.className='gm-snooze-returned';
    node.textContent=node.title=notice.text;
    if(!existing){const actions=line.querySelector('.gm-row-actions');if(actions)line.insertBefore(node,actions);else line.append(node);}
  }
  function render(row, nativeFill = false) {
    returnedNotice(row,null);
    const cell = row.querySelector('.datecol-column');
    if (!cell) return;
    if (nativeFill || !saved.has(cell)) saved.set(cell, {
      text:cell.textContent, title:cell.getAttribute('title'),
      args:cell.getAttribute('data-l10n-args'),snooze:saved.has(cell)?saved.get(cell).snooze:cell.getAttribute('data-gm-snoozed')
    });
    cell.removeAttribute('data-gm-snoozed');
    if ((row.dataset.properties || '').split(' ').includes('dummy')) return;
    function clearDate(){
      cell.textContent='';cell.removeAttribute('title');
      const id=cell.getAttribute('data-l10n-id');
      if(id)doc.l10n.setAttributes(cell,id,{title:''});
      else cell.removeAttribute('data-l10n-args');
    }
    try {
      const view=win.gDBView;
      if((row.view&&row.view!==view)||!view||(Number.isInteger(view.rowCount)&&row.index>=view.rowCount)){clearDate();return;}
      const hdr = view.getMsgHdrAt(row.index);
      if (!hdr){clearDate();return;}
      const headers=[hdr];
      if(snooze&&win.gDBView?.viewFlags&&(win.gDBView.viewFlags&Ci.nsMsgViewFlagsType.kThreadedDisplay)){
        const thread=win.gDBView.getThreadContainingMsgHdr(hdr);
        for(let i=0;i<thread.numChildren;i++)headers.push(thread.getChildHdrAt(i));
      }
      const reminder=typeof snoozeDisplayReminder==='function'?snoozeDisplayReminder(snooze,headers):null;
      if(reminder)cell.setAttribute('data-gm-snoozed',reminder.state);else cell.removeAttribute('data-gm-snoozed');
      const returned=!reminder&&win.gFolder&&typeof Ci!=='undefined'&&(win.gFolder.flags&Ci.nsMsgFolderFlags.Inbox)&&typeof snoozeReturnedNotice==='function'?snoozeReturnedNotice(headers):null;
      returnedNotice(row,returned);
      const timestamp = reminder?.due || (hdr.dateInSeconds ? hdr.dateInSeconds * 1000 : hdr.date / 1000);
      const formatted = compactMessageDate(timestamp, new Date(), locale, formatters);
      if (!formatted){clearDate();return;}
      if(reminder)formatted.full=snoozeReminderText(reminder,locale);
      if(cell.textContent!==formatted.short)cell.textContent = formatted.short;
      if(cell.title!==formatted.full)cell.title = formatted.full;
      // Native Fluent translation runs asynchronously; give it the full tooltip
      // too so it cannot later replace it with the shortened display string.
      const id = cell.getAttribute('data-l10n-id');
      if (id && cell.getAttribute('data-l10n-args')!==JSON.stringify({title:formatted.full}))
        doc.l10n.setAttributes(cell, id, {title:formatted.full});
    } catch (error) { clearDate();console.error(gmText("Compact message dates:"), error); }
  }
  function refresh() {
    if (closed) return;
    // Pick up locale or system timezone changes after returning to the app.
    locale=gmLocale() || win.Services?.locale?.appLocalesAsBCP47 || win.navigator.languages;
    formatters.clear();
    for (const row of doc.querySelectorAll('#threadTree tr.table-layout, #threadTree tr.card-layout')) render(row);
  }
  function midnight() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1);
    timer = win.setTimeout(() => { refresh(); midnight(); }, next-now+100);
  }
  win.customElements.whenDefined('thread-row').then(() => {
    if (closed) return;
    prototype = win.customElements.get('thread-row').prototype;
    original = prototype.fillRow;
    wrapped = function(...args) {
      const result = original.apply(this, args);
      render(this, true);
      return result;
    };
    prototype.fillRow = wrapped;
    refresh(); midnight();
  });
  const stopSnooze=snooze?.subscribe(refresh);
  const returnedTimer=win.setInterval?.(refresh,60000);
  win.addEventListener('focus', refresh);
  function close() {
    if (closed) return;
    closed = true;
    stopSnooze?.();
    if(returnedTimer!==undefined)win.clearInterval(returnedTimer);
    win.clearTimeout(timer);
    win.removeEventListener('focus', refresh);
    win.removeEventListener('unload', close);
    if (prototype?.fillRow === wrapped) prototype.fillRow = original;
    for (const row of doc.querySelectorAll('#threadTree tr.table-layout, #threadTree tr.card-layout')) {
      returnedNotice(row,null);
      const cell=row.querySelector('.datecol-column'),state=saved.get(cell);
      if(!state)continue;
      cell.textContent = state.text;
      for (const [name, value] of [['title',state.title],['data-l10n-args',state.args],['data-gm-snoozed',state.snooze]]) {
        if (value === null) cell.removeAttribute(name); else cell.setAttribute(name, value);
      }
    }
    saved=new WeakMap();formatters.clear();
  }
  win.addEventListener('unload', close, {once:true});
  return {refresh, close};
}
