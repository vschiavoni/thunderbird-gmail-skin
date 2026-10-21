/* Native quick filters, cached previews, and row-scoped actions. */
function cachedMessagePreview(header) {
  try {
    return (header.getStringProperty?.('preview') || '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
  } catch (_) { return ''; }
}
function localMessagePreview(header) {
  const cached = cachedMessagePreview(header);
  if (cached) return cached;
  let stream;
  try {
    const folder = header.folder;
    if (!folder?.getMsgInputStream || !folder.getMsgTextFromStream) return '';
    // This API reads only the local store, including locally cached IMAP mail.
    stream = folder.getMsgInputStream(header);
    const text = folder.getMsgTextFromStream(stream, header.charset || '', 16384, 240, true, true, {});
    return cachedMessagePreview({getStringProperty:()=>text});
  } catch (_) { return ''; }
  finally { try { stream?.close(); } catch (_) {} }
}

function createPreviewQueue(win) {
  const cache = new Map(), jobs = new Map();
  let timer = null, closed = false;
  function schedule() {
    if (!closed && timer === null && jobs.size) timer = win.setTimeout(drain, 16);
  }
  function drain() {
    timer = null;
    if (closed) return;
    const [key, job] = jobs.entries().next().value || [];
    if (!key) return;
    jobs.delete(key);
    if (job.isCurrent()) {
      const text = localMessagePreview(job.header);
      if (cache.size >= 300) cache.delete(cache.keys().next().value);
      cache.set(key, {text, flags:job.header.flags, retryAt:Date.now()+30000});
      if (!closed && job.isCurrent()) job.ready();
    }
    schedule();
  }
  return {
    get(header, isCurrent, ready) {
      if (closed) return '';
      const native = cachedMessagePreview(header);
      if (native) return native;
      const key = header.folder?.URI && header.messageKey !== undefined
        ? header.folder.URI+'#'+header.messageKey : null;
      if (!key) return '';
      const found = cache.get(key);
      if (found && (found.text || (found.retryAt > Date.now() && found.flags === header.flags))) return found.text;
      // Keep the queue bounded when scrolling through many virtual rows.
      if (jobs.size >= 100 && !jobs.has(key)) jobs.delete(jobs.keys().next().value);
      jobs.set(key,{header,isCurrent,ready}); schedule();
      return '';
    },
    close() {
      closed = true;
      if (timer !== null) win.clearTimeout(timer);
      timer = null; jobs.clear(); cache.clear();
    }
  };
}

function runRowAction(win, row, name, expected) {
  if (!row || row.index < 0 || (row.dataset.properties || '').split(' ').includes('dummy')) return;
  let header;
  try { header = win.gDBView?.getMsgHdrAt(row.index); } catch (_) { return; }
  if (!header || (expected && (header.messageKey !== expected.key || header.folder?.URI !== expected.folderURI))) return;
  // Replace any earlier multi-selection. A collapsed row retains Thunderbird's
  // native conversation scope; unrelated selected rows are never included.
  win.document.getElementById('threadTree').selectedIndex = row.index;
  if (win.commandController.isCommandEnabled(name)) win.commandController.doCommand(name);
}

function installComposeLabel(doc) {
  const button = doc.getElementById('folderPaneWriteMessage');
  if (!button?.getAttribute) return {close(){}};
  const attributes = ['data-l10n-id', 'data-l10n-args', 'aria-label'];
  const saved = attributes.map(name => [name, button.getAttribute(name)]);
  const text = button.textContent;
  button.removeAttribute('data-l10n-id');
  button.removeAttribute('data-l10n-args');
  button.textContent = 'Write';
  button.setAttribute('aria-label', 'Write a new message');
  return {close() {
    button.textContent = text;
    for (const [name, value] of saved) {
      if (value === null) button.removeAttribute(name);
      else button.setAttribute(name, value);
    }
  }};
}

function installInboxControls(win) {
  const doc = win.document;
  const tree = doc.getElementById('threadTree');
  if (!tree) return {close(){}};
  const compose = installComposeLabel(doc);
  let closed = false, prototype, original, wrapped, rowClass, originalHeight;
  const previews = createPreviewQueue(win);
  const filter = win.quickFilterBar;
  const wasVisible = filter?.filterer?.visible;
  if (filter?._showFilterBar) filter._showFilterBar(false);
  const style = doc.createElement('style');
  style.textContent = `
    #quick-filter-bar .quickFilterButtons {
      gap:6px; flex-wrap:wrap; border:0 !important; box-shadow:none !important;
    }
    #quick-filter-bar :is(#qfb-unread,#qfb-starred,#qfb-tags,#qfb-attachment,#qfb-inaddrbook) {
      border:0 !important; box-shadow:none !important; border-radius:18px !important;
      padding:6px 12px 6px 32px !important;
      background-color:transparent; color:inherit;
      background-size:16px !important; background-repeat:no-repeat !important;
      background-position:10px center !important;
      -moz-context-properties:fill,stroke; fill:currentColor; stroke:currentColor;
    }
    #quick-filter-bar .quickFilterButtons button:dir(rtl) {
      padding-inline:32px 12px !important; background-position:right 10px center !important;
    }
    #quick-filter-bar .quickFilterButtons button span { display:inline !important; }
    #quick-filter-bar .quickFilterButtons button:hover { background-color:var(--gm-hover, ButtonFace); }
    #quick-filter-bar .quickFilterButtons button[aria-pressed="true"] {
      background-color:var(--gm-selected, Highlight); color:var(--gm-selection-ink, HighlightText);
    }
    #threadTree .subject-line.gm-has-snippet > span:not(.gm-inline-labels) {
      flex:0 1 auto !important; max-width:65%; min-width:32px;
    }
    #threadTree .gm-message-snippet {
      flex:1 1 0; min-width:0; margin-inline-start:6px; overflow:hidden;
      white-space:nowrap; text-overflow:ellipsis; font-weight:400;
      color:var(--gm-snippet, #9aa0a6) !important;
      font-weight:400 !important;
    }
    #threadTree .gm-row-actions {
      display:none; flex:0 0 auto; gap:2px; margin-inline-start:auto;
    }
    #threadTree tr:is(:hover,:focus-within) .gm-row-actions {
      display:flex;
    }
    #threadTree .gm-row-actions button {
      display:inline-flex; align-items:center; justify-content:center;
      width:28px; height:28px; padding:5px; border:0; border-radius:50%;
      background:transparent; color:inherit; cursor:pointer;
    }
    #threadTree .gm-row-actions button:hover { background:var(--gm-selected, ButtonFace); }
    #threadTree .gm-row-actions button:focus-visible { outline:2px solid Highlight; }
    #threadTree .gm-row-actions svg { width:18px; height:18px; }
    @media (hover:none) { #threadTree .gm-row-actions { display:flex; } }
    @media (prefers-contrast:more) {
      #threadTree .gm-message-snippet { color:CanvasText !important; }
      #quick-filter-bar .quickFilterButtons button[aria-pressed="true"] { background:Highlight; color:HighlightText; }
    }
  `;
  doc.head.append(style);
  function render(row) {
    row.querySelector('.gm-row-actions')?.remove();
    row.querySelector('.gm-message-snippet')?.remove();
    row.querySelector('.subject-line')?.classList?.remove('gm-has-snippet');
    if ((row.dataset.properties || '').split(' ').includes('dummy')) return;
    const line = row.querySelector('.subject-line');
    if (!line) return;
    let header;
    try { header = win.gDBView?.getMsgHdrAt(row.index); } catch (_) { return; }
    if (!header) return;
    const view = win.gDBView, index = row.index;
    const isCurrent = () => {
      if (closed || row.index !== index || win.gDBView !== view) return false;
      try {
        const current = view.getMsgHdrAt(index);
        return current?.messageKey === header.messageKey && current?.folder?.URI === header.folder?.URI;
      } catch (_) { return false; }
    };
    function showPreview(text) {
      if (!text || !isCurrent()) return;
      line.querySelector('.gm-message-snippet')?.remove();
      const snippet = doc.createElement('div');
      snippet.className = 'gm-message-snippet';
      snippet.textContent = '— ' + text;
      snippet.title = text;
      line.classList.add('gm-has-snippet');
      const actions = line.querySelector('.gm-row-actions');
      if (actions) line.insertBefore(snippet, actions);
      else line.append(snippet);
    }
    const preview = previews.get(header, isCurrent, () => {
      // Update only the snippet: replacing action buttons here would steal
      // keyboard focus while the user is interacting with the row.
      showPreview(previews.get(header,isCurrent,()=>{}));
    });
    showPreview(preview);
    const actions = doc.createElement('div');
    actions.className = 'gm-row-actions';
    const commands = [
      ['Archive conversation', 'cmd_archive', 'M4 8h16v13H4z M3 3h18v5H3z M9 12h6'],
      ['Delete conversation', 'cmd_deleteMessage', 'M5 6h14 M9 6V3h6v3 M7 6l1 15h8l1-15'],
      [header.isRead ? 'Mark conversation as unread' : 'Mark conversation as read',
        header.isRead ? 'cmd_markAsUnread' : 'cmd_markAsRead', 'M3 5h18v14H3z M3 6l9 7 9-7']
    ];
    for (const [label, command, path] of commands) {
      const button = doc.createElement('button');
      button.type = 'button'; button.title = label;
      button.setAttribute('aria-label', label);
      const svg = doc.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('fill','none');
      svg.setAttribute('stroke','currentColor'); svg.setAttribute('stroke-width','1.8');
      svg.setAttribute('aria-hidden','true');
      const shape = doc.createElementNS(svg.namespaceURI,'path');
      shape.setAttribute('d',path); svg.append(shape); button.append(svg);
      button.addEventListener('mousedown', event => event.stopPropagation());
      button.addEventListener('dblclick', event => event.stopPropagation());
      button.addEventListener('click', event => {
        event.preventDefault(); event.stopPropagation();
        if (!closed) runRowAction(win, row, command, {key:header.messageKey, folderURI:header.folder?.URI});
      });
      actions.append(button);
    }
    line.append(actions);
  }
  win.customElements.whenDefined('thread-row').then(() => {
    if (closed) return;
    rowClass = win.customElements.get('thread-row');
    originalHeight = rowClass.ROW_HEIGHT;
    if (Number.isFinite(originalHeight)) rowClass.ROW_HEIGHT = originalHeight + 6;
    prototype = rowClass.prototype;
    original = prototype.fillRow;
    wrapped = function(...args) {
      const result = original.apply(this,args);
      render(this);
      return result;
    };
    prototype.fillRow = wrapped;
    if (Number.isFinite(originalHeight)) tree.reset();
    for (const row of doc.querySelectorAll('#threadTree tr.table-layout')) render(row);
  });
  function close() {
    if (closed) return;
    closed = true;
    if (prototype?.fillRow === wrapped) prototype.fillRow = original;
    for (const node of doc.querySelectorAll('.gm-row-actions, .gm-message-snippet')) node.remove();
    for (const line of doc.querySelectorAll('.gm-has-snippet')) line.classList.remove('gm-has-snippet');
    style.remove();
    previews.close();
    compose.close();
    if (rowClass && Number.isFinite(originalHeight) && rowClass.ROW_HEIGHT === originalHeight + 6) {
      rowClass.ROW_HEIGHT = originalHeight;
      tree.reset();
    }
    if (wasVisible !== undefined) filter._showFilterBar(wasVisible);
    win.removeEventListener('unload',close);
    win.removeEventListener('focus',refreshPreviews);
  }
  function refreshPreviews() {
    if (!closed) for (const row of doc.querySelectorAll('#threadTree tr.table-layout')) render(row);
  }
  win.addEventListener('focus',refreshPreviews);
  win.addEventListener('unload',close,{once:true});
  return {close};
}
