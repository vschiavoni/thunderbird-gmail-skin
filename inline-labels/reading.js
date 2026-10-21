/* Gmail-like navigation around the native/Conversations message pane.
 * Actions delegate to native Thunderbird commands and installed Follow-Ups.
 */
function isReadingClick(event) {
  return event.button === 0 && !event.ctrlKey && !event.metaKey &&
    !event.shiftKey && !event.altKey &&
    !event.target.closest('button, input, a, .button-column, .select-column, .selectcol-column, .twisty, .gm-reading-toolbar');
}

function readingMessageWasMoved(previous, move, messages) {
  return !!(move && previous?.message && messages.some(message =>
    message.messageKey === previous.message.key &&
    message.folder?.URI === previous.message.folderURI));
}

// Bare L overrides Thunderbird's Ignore Subthread only in mail browsing UI.
function isLabelShortcut(event) {
  return event.key?.toLowerCase() === 'l' && !event.ctrlKey && !event.metaKey &&
    !event.altKey && !event.shiftKey && !event.repeat && !event.isComposing &&
    !event.defaultPrevented && !event.target?.isContentEditable &&
    !event.target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], search-textbox');
}
function labelMatchesQuery(name, query) {
  return name.normalize('NFKC').toLocaleLowerCase().includes(query.trim().normalize('NFKC').toLocaleLowerCase());
}
function labelAssignmentState(tag, messages) {
  const count = messages.filter(message => {
    const keys = (message.getStringProperty('keywords') || '').split(/\s+/);
    return keys.includes(tag.key) || (message.label && tag.key === `$label${message.label}`);
  }).length;
  return {checked: messages.length > 0 && count === messages.length,
    mixed: count > 0 && count < messages.length};
}

function adjacentMessageIndex(view, index, direction) {
  for (let next = index + direction; next >= 0 && next < view.rowCount; next += direction) {
    try {
      // Group headers do not represent messages.
      if (!(view.getFlagsAt(next) & 0x20000000) && view.getMsgHdrAt(next)) return next;
    } catch (_) { /* Skip invalid view rows. */ }
  }
  return -1;
}

function sameMessage(header, identity) {
  return !!(header && identity && header.messageKey === identity.key && header.folder?.URI === identity.folderURI);
}
function messageViewIndex(view, identity) {
  for (let index=0; index < (view?.rowCount || 0); index++) {
    try { if (sameMessage(view.getMsgHdrAt(index), identity)) return index; } catch (_) {}
  }
  return -1;
}

function installReadingMode(win) {
  const doc = win.document;
  const layout = doc.getElementById('paneLayout');
  const tree = doc.getElementById('threadTree');
  const folderTree = doc.getElementById('folderTree');
  if (!layout || !tree || !folderTree) return { close() {} };
  let active = false;
  let closed = false;
  let pending = null, openTicket = 0;
  let previous = null;
  let bulk = false;
  const threadPane = doc.getElementById('threadPane');
  const headingTargets = ['threadPaneFolderName', 'threadPaneFolderCountContainer']
    .map(id => doc.getElementById(id)).filter(Boolean);
  const selectionLabel = doc.createElement('span');
  const originalColumns = new Map();
  const originalUpdateColumns = win.threadPane?.updateColumns;
  function checkboxColumns() {
    const columns = win.threadPane?.columns;
    if (!columns) return;
    for (const c of columns) {
      if (!originalColumns.has(c)) originalColumns.set(c, {hidden:c.hidden, ordinal:c.ordinal});
    }
    const select = columns.find(c => c.id === 'selectCol');
    if (select) {
      select.hidden = false;
      columns.sort((a,b) => a.id === 'selectCol' ? -1 : b.id === 'selectCol' ? 1 : a.ordinal-b.ordinal);
      columns.forEach((c,i) => c.ordinal=i+1);
    }
  }
  function updateColumns(...args) {
    checkboxColumns();
    return originalUpdateColumns.apply(win.threadPane, args);
  }
  if (originalUpdateColumns) {
    win.threadPane.updateColumns = updateColumns;
    updateColumns(); tree.reset();
  }
  const originalMessagePaneVisible = layout.messagePaneVisible;
  // A message replaces the list inside the current mail tab.
  layout.messagePaneVisible = false;
  const style = doc.createElement('style');
  style.textContent = `
    #paneLayout.gm-reading:not(.account-central) {
      grid-template:
        "folders folderPaneSplitter readingbar" 44px
        "folders folderPaneSplitter message" minmax(0, 1fr)
        / minmax(100px, var(--folderPaneSplitter-width)) min-content minmax(0, 1fr) !important;
    }
    #paneLayout.gm-reading > :is(#threadPane, #messagePaneSplitter) { display:none !important; }
    #paneLayout.gm-reading > #messagePane { min-height:0 !important; min-width:0 !important; }
    .gm-reading-toolbar {
      grid-area:readingbar; display:flex; align-items:center; gap:4px;
      box-sizing:border-box; block-size:44px; padding:4px 12px; background:var(--layout-background-0, white);
      color:var(--layout-color-0, #202124); border-radius:16px 16px 0 0;
      border-bottom:1px solid var(--layout-border-0, #e8eaed);
      font:inherit; min-width:0; overflow-x:auto; flex-shrink:0;
    }
    .gm-reading-toolbar[hidden] { display:none !important; }
    .gm-reading-back {
      display:inline-flex; align-items:center; justify-content:center;
      box-sizing:border-box; inline-size:36px; block-size:36px; min-inline-size:36px;
      margin:0; font:inherit; color:inherit; border:0; border-radius:50%;
      background:transparent; padding:8px; cursor:pointer; flex:0 0 36px;
    }
    .gm-reading-back:hover { background:var(--treeitem-background-hover, #e9eef6); }
    .gm-reading-back:focus-visible { outline:2px solid #1a73e8; outline-offset:-2px; }
    .gm-reading-back:disabled { opacity:.38; cursor:default; background:transparent; }
    .gm-reading-back svg { display:block; inline-size:20px; block-size:20px; flex:none; }
    .gm-action-separator { inline-size:1px; block-size:20px; margin-inline:8px;
      background:var(--layout-border-0, #dadce0); flex:0 0 1px; }
    .gm-selection-count { margin-inline:6px 10px; white-space:nowrap; }
    .gm-selection-count:empty { display:none; }
    /* Replace the folder heading with actions, rather than adding another row. */
    #threadPane.gm-bulk-selecting > #threadPaneHeaderBar { display:none !important; }
    #threadPaneHeaderBar { min-block-size:44px; box-sizing:border-box; }
    #threadPane > .gm-reading-toolbar { min-block-size:44px; border-bottom:0;
      border-radius:16px 16px 0 0; background:var(--layout-background-0, white); }
    #threadTree :is(.tree-view-header-select, .tree-view-row-select) img {
      inline-size:18px !important; block-size:18px !important;
      min-inline-size:18px; min-block-size:18px; opacity:.75;
    }
    #threadTree :is(#selectColButton:hover, .tree-view-row-select:hover) img,
    #threadTree .selected .tree-view-row-select img,
    #threadTree :is(.some-selected, .all-selected) .tree-view-header-select img { opacity:1; }
    @media not (prefers-contrast) {
      :root #threadTree tbody > tr.table-layout.selected,
      :root #threadTree tbody > tr.table-layout.selected:hover {
        background:var(--gm-selected, #c2dbff) !important; color:var(--gm-ink, #202124) !important;
        box-shadow:inset 0 -1px var(--gm-border, #b5cfee) !important;
      }
      :root #threadTree .tree-view-row-select img,
      :root #threadTree .tree-view-header-select img { color:var(--gm-muted, #444746) !important; }
    }
  `;
  doc.head.append(style);
  const toolbar = doc.createElement('div');
  toolbar.className = 'gm-reading-toolbar';
  toolbar.hidden = true;
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Conversation navigation');
  const back = doc.createElement('button');
  back.className = 'gm-reading-back';
  back.type = 'button';
  setBackIcon(false);
  selectionLabel.className = 'gm-selection-count';
  toolbar.append(back, selectionLabel);
  separator();
  const popups = [];
  function icon(path) {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '20');
    svg.setAttribute('height', '20'); svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('aria-hidden', 'true');
    const shape = doc.createElementNS(svg.namespaceURI, 'path');
    shape.setAttribute('d', path); svg.append(shape);
    return svg;
  }
  function setBackIcon(selection) {
    const label = selection ? 'Clear selection' : 'Back to message list';
    back.textContent = '';
    back.title = label;
    back.setAttribute('aria-label', label);
    back.append(icon(selection ? 'M6 6l12 12 M18 6 6 18' : 'M20 12H4 M11 5l-7 7 7 7'));
  }
  function separator() {
    const divider = doc.createElement('span');
    divider.className = 'gm-action-separator';
    divider.setAttribute('role', 'separator');
    divider.setAttribute('aria-orientation', 'vertical');
    toolbar.append(divider);
  }
  function action(label, path, handler) {
    const button = doc.createElement('button');
    button.className = 'gm-reading-back gm-reading-action';
    button.type = 'button'; button.title = label;
    button.setAttribute('aria-label', label);
    button.append(icon(path));
    button.addEventListener('click', () => handler(button));
    toolbar.append(button); return button;
  }
  function command(name, returnToList = false) {
    if (!win.commandController.isCommandEnabled(name)) return;
    win.commandController.doCommand(name);
    if (returnToList) { if (active) leave(true); else clearBulk(); }
  }
  action('Archive', 'M4 8h16v13H4z M3 3h18v5H3z M9 12h6 M12 10v7 m-3-3 3 3 3-3',
    () => command('cmd_archive', true));
  action('Mark as spam', 'M8 3h8l5 5v8l-5 5H8l-5-5V8z M12 7v7 M12 17v1',
    () => command('cmd_markAsJunk', true));
  action('Delete', 'M5 6h14 M9 6V3h6v3 M7 6l1 15h8l1-15 M10 9v9 M14 9v9',
    () => command('cmd_deleteMessage', true));
  separator();
  action('Mark as unread', 'M3 6h18v14H3z M3 7l9 7 9-7 M16 3h5',
    () => command('cmd_markAsUnread', true));
  const snoozeButton = action('Snooze / Follow-Up…', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 6v6l4 3', () => {
    const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
    const extension = ExtensionParent.GlobalManager.extensionMap.get('mailmindr@arndissler.net');
    if (extension?.shortcuts) extension.shortcuts.onCommand('mailmindr_set_follow_up');
  });
  separator();
  const movePopup = doc.createXULElement('menupopup', {is:'folder-menupopup'});
  movePopup.setAttribute('is', 'folder-menupopup');
  movePopup.setAttribute('mode', 'filing');
  movePopup.setAttribute('showFileHereLabel', 'true');
  movePopup.setAttribute('showRecent', 'true');
  movePopup.setAttribute('showFavorites', 'true');
  doc.documentElement.append(movePopup); popups.push(movePopup);
  movePopup.addEventListener('command', event => {
    if (event.target._folder) {
      win.commandController.doCommand('cmd_moveMessage', event.target._folder);
      if (active) leave(true); else clearBulk();
    }
  });
  action('Move to…', 'M3 6h7l2 2h9v12H3z M12 10v7 m-3-3 3 3 3-3',
    button => movePopup.openPopup(button, 'after_start', 0, 0, false, false));
  const tagPopup = doc.createXULElement('panel');
  tagPopup.classList.add('gm-label-panel');
  tagPopup.setAttribute('noautofocus', 'true');
  tagPopup.setAttribute('aria-label', 'Label as');
  doc.documentElement.append(tagPopup); popups.push(tagPopup);
  const picker = doc.createElement('div');
  picker.className = 'gm-label-picker';
  const heading = doc.createElement('div'); heading.textContent = 'Label as:';
  const search = doc.createElement('input');
  search.type = 'search';
  const searchBox = doc.createElement('div'); searchBox.className = 'gm-label-search';
  const searchIcon = icon('M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15 M16 16l5 5');
  searchBox.append(search, searchIcon);
  search.setAttribute('aria-label', 'Search labels');
  const tagList = doc.createElement('div'); tagList.className = 'gm-label-list';
  const empty = doc.createElement('div'); empty.textContent = 'No matching labels';
  empty.setAttribute('role', 'status');
  const footer = doc.createElement('div'); footer.className = 'gm-label-footer';
  for (const [title, command] of [['Create new', 'cmd_addTag'], ['Manage labels', 'cmd_manageTags']]) {
    const button = doc.createElement('button'); button.type = 'button'; button.textContent = title;
    button.addEventListener('click', () => {
      if (command === 'cmd_addTag' && !sameSelection()) { tagPopup.hidePopup(); return; }
      tagPopup.hidePopup(); win.commandController.doCommand(command);
    });
    footer.append(button);
  }
  picker.append(heading, searchBox, tagList, empty, footer); tagPopup.append(picker);
  let pickerMessages = [], pickerTags = [], pickerOpen = false, returnFocus = null;
  function sameSelection() {
    const selected = win.gDBView?.getSelectedMsgHdrs() || [];
    return selected.length === pickerMessages.length && selected.every((message, index) =>
      message.messageKey === pickerMessages[index].messageKey && message.folder?.URI === pickerMessages[index].folder?.URI);
  }
  function renderTags() {
    tagList.replaceChildren();
    for (const tag of pickerTags.filter(tag => labelMatchesQuery(tag.tag, search.value))) {
      const row = doc.createElement('label'); row.className = 'gm-label-option';
      const checkbox = doc.createElement('input'); checkbox.type = 'checkbox';
      const state = labelAssignmentState(tag, pickerMessages);
      checkbox.checked = state.checked; checkbox.indeterminate = state.mixed;
      checkbox.setAttribute('aria-label', tag.tag);
      const name = doc.createElement('span'); name.textContent = tag.tag;
      row.append(checkbox, name); tagList.append(row);
      checkbox.addEventListener('change', () => {
        if (!sameSelection()) { tagPopup.hidePopup(); return; }
        win.commandController._toggleMessageTag(tag.key, checkbox.checked);
        checkbox.indeterminate = false;
      });
    }
    empty.hidden = tagList.childElementCount > 0;
  }
  function showLabels(anchor) {
    const messages = win.gDBView?.getSelectedMsgHdrs() || [];
    if (!messages.length) return;
    pickerMessages = Array.from(messages);
    pickerTags = MailServices.tags.getAllTags();
    returnFocus = doc.activeElement; search.value = ''; renderTags();
    tagPopup.openPopup(anchor, 'after_start', 0, 0, false, false);
  }
  const labelsButton = action('Labels… (L)', 'M3 4h9l9 8-9 8H3z M7 10v4', showLabels);
  search.addEventListener('input', renderTags);
  tagPopup.addEventListener('popupshown', () => { pickerOpen = true; search.focus(); });
  tagPopup.addEventListener('popuphidden', () => {
    pickerOpen = false;
    if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
  });
  picker.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); tagPopup.hidePopup(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const options = [search, ...tagList.querySelectorAll('input')];
      const index = options.indexOf(doc.activeElement);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      options[(index + step + options.length) % options.length]?.focus();
      event.preventDefault(); event.stopPropagation();
    }
  });
  // Capture in each document of this mail pane, including Conversations' browser.
  // Other tabs, compose editors, search fields and modified shortcuts are untouched.
  const keyDocuments = new Set();
  function labelKey(event) {
    if (!isLabelShortcut(event) || pickerOpen || closed) return;
    const tabmail = win.top.document.getElementById('tabmail');
    if (tabmail && tabmail.currentAbout3Pane !== win) return;
    if (!win.gDBView?.getSelectedMsgHdrs().length) return;
    event.preventDefault(); event.stopImmediatePropagation();
    showLabels(toolbar.hidden ? tree : labelsButton);
  }
  function watchKeys(document) {
    if (!document || keyDocuments.has(document)) return;
    keyDocuments.add(document); document.addEventListener('keydown', labelKey, true);
    for (const browser of document.querySelectorAll('browser, iframe')) {
      try { watchKeys(browser.contentDocument); } catch (_) {}
    }
  }
  function documentLoaded(event) { if (event.target?.nodeType === 9) watchKeys(event.target); }
  // Tests without a browser document do not need nested key routing.
  if (doc.querySelectorAll) {
    watchKeys(doc); win.addEventListener('load', documentLoaded, true);
  }
  style.textContent += `
    .gm-label-panel { --panel-padding:0; --panel-border-radius:4px; }
    .gm-label-picker { width:400px; max-width:80vw; padding:16px 0 8px; box-sizing:border-box;
      background:var(--layout-background-0, white); color:var(--layout-color-0, #3c4043);
      font:inherit; font-size:1rem; border-radius:4px; }
    .gm-label-picker > div:first-child { font-weight:400; margin:0 16px 8px; }
    .gm-label-search { display:flex; align-items:center; margin:0 8px 16px 16px;
      border-bottom:1px solid var(--layout-border-0, #dadce0); }
    .gm-label-search:focus-within { border-bottom:2px solid #4285f4; }
    .gm-label-search > input { appearance:none; box-sizing:border-box; width:100%; min-width:0;
      height:28px; padding:0; color:inherit; background:transparent; font:inherit;
      border:0; border-radius:0; outline:none; box-shadow:none; }
    .gm-label-search > svg { width:20px; height:20px; flex:none; margin-inline:8px; }
    .gm-label-list { max-height:240px; overflow-y:auto; padding-block:4px 8px; }
    .gm-label-option { display:flex; align-items:center; gap:12px; min-height:24px;
      box-sizing:border-box; padding:2px 22px; cursor:pointer; }
    .gm-label-option:hover, .gm-label-option:focus-within,
    .gm-label-footer > button:hover { background:var(--treeitem-background-hover, #f1f3f4); }
    .gm-label-option input { appearance:none; box-sizing:border-box; width:15px; height:15px;
      margin:0; flex:none; border:1.5px solid currentColor; border-radius:1px; color:inherit;
      background:transparent; display:grid; place-content:center; }
    .gm-label-option input:checked::before { content:''; width:8px; height:4px;
      border-left:2px solid currentColor; border-bottom:2px solid currentColor; transform:translateY(-1px) rotate(-45deg); }
    .gm-label-option input:indeterminate::before { content:''; width:8px; height:2px; background:currentColor; }
    .gm-label-option input:focus-visible { outline:2px solid #4285f4; outline-offset:2px; }
    .gm-label-option > span:last-child { overflow-wrap:anywhere; }
    .gm-label-picker > [role="status"] { padding:8px 22px; }
    .gm-label-footer { border-top:1px solid var(--layout-border-0, #e8eaed); padding-top:4px; }
    .gm-label-footer > button { display:block; width:100%; text-align:start; font:inherit;
      color:inherit; background:transparent; border:0; border-radius:0; margin:0;
      padding:4px 22px 4px 49px; min-height:24px; cursor:pointer; }
    `;
  const printButton = action('Print conversation', 'M6 8V3h12v5 M3 17V9h18v8h-3 M6 14h12v7H6z M17 11h1', () => {
    const conversationDoc = doc.getElementById('multiMessageBrowser')?.contentDocument;
    const print = conversationDoc?.querySelector('conversation-footer')?.shadowRoot?.querySelector('.print');
    if (print) print.click();
    else command('cmd_print');
  });
  const navigation = doc.createElement('span');
  navigation.style.marginInlineStart = 'auto';
  toolbar.append(navigation);
  function navigate(direction) {
    const current = messageViewIndex(win.gDBView, previous?.message);
    if (current < 0) { previousButton.disabled = nextButton.disabled = true; return; }
    const index = adjacentMessageIndex(win.gDBView, current, direction);
    if (index < 0) return;
    tree.selectedIndex = index;
    tree.scrollToIndex?.(index);
    open({index, dataset:{}});
  }
  const previousButton = action('Previous message', 'M15 5l-7 7 7 7', () => navigate(-1));
  const nextButton = action('Next message', 'M9 5l7 7-7 7', () => navigate(1));
  previousButton.hidden = nextButton.hidden = true;
  layout.append(toolbar);
  function syncBulk() {
    if (active || closed || !threadPane) return;
    previousButton.hidden = nextButton.hidden = true;
    printButton.hidden = true;
    const count = win.gDBView?.getSelectedMsgHdrs().length || 0;
    toolbar.hidden = !bulk || !count;
    if (toolbar.hidden) threadPane.classList.remove('gm-bulk-selecting');
    else threadPane.classList.add('gm-bulk-selecting');
    if (!toolbar.hidden) {
      threadPane.prepend(toolbar);
      setBackIcon(true);
      selectionLabel.textContent = `${count} selected`;
      toolbar.setAttribute('aria-label', 'Selected message actions');
      snoozeButton.disabled = count !== 1;
    }
  }
  function clearBulk() {
    bulk = false;
    tree.selectedIndices = [];
    win.threadPaneHeader?.updateSelectedCount();
    syncBulk();
  }
  function headingClick(event) {
    if (event.button !== 0) return;
    // Clear a pending single-click open as well as any native row selection.
    if (pending !== null) { win.cancelAnimationFrame(pending); pending = null; ++openTicket; }
    leave(false);
    clearBulk();
    layout.messagePaneVisible = false;
  }
  for (const heading of headingTargets) heading.addEventListener('click', headingClick);
  function selectionChanged() {
    tagPopup.hidePopup();
    // A collapsed thread can select several messages as one row. Only explicit
    // checkbox/modifier clicks enter bulk mode; let the native reader show threads.
    syncBulk();
  }
  function selectionClick(event) {
    if (event.target.closest('.gm-row-actions')) {
      if (pending !== null) { win.cancelAnimationFrame(pending); pending = null; ++openTicket; }
      return;
    }
    if (event.target.closest('.select-column, .selectcol-column, #selectCol') ||
        event.ctrlKey || event.metaKey || event.shiftKey) {
      if (pending !== null) { win.cancelAnimationFrame(pending); pending = null; ++openTicket; }
      if (active) leave(false);
      bulk = true;
      win.requestAnimationFrame(() => { if (!closed) syncBulk(); });
    }
  }

  function leave(restorePosition = true) {
    if (pending !== null) { win.cancelAnimationFrame(pending); pending = null; ++openTicket; }
    if (!active) return;
    active = false;
    layout.classList.remove('gm-reading');
    bulk = false;
    toolbar.hidden = true;
    layout.messagePaneVisible = false;
    // Reader selection can include every member of a collapsed conversation.
    // Returning to the inbox must not retain that implicit bulk selection.
    if (restorePosition) clearBulk();
    if (restorePosition && win.gFolder?.URI === previous.folderURI) {
      tree.scrollTop = previous.scrollTop;
      tree.scrollLeft = previous.scrollLeft;
      tree.table?.body?.focus({ preventScroll:true });
      win.requestAnimationFrame(() => {
        if (!active && !closed) tree.scrollTop = previous.scrollTop;
      });
    }
  }
  function open(row) {
    if (closed || !win.gDBView || row.index < 0) return;
    if ((row.dataset.properties || '').split(' ').includes('dummy')) return;
    let header;
    try { header = win.gDBView.getMsgHdrAt(row.index); } catch (_) { return; }
    if (!header) return;
    previous = {
      index:row.index,
      message:{key:header.messageKey, folderURI:header.folder?.URI},
      folderURI:win.gFolder?.URI, scrollTop:tree.scrollTop, scrollLeft:tree.scrollLeft };
    active = true;
    threadPane?.classList.remove('gm-bulk-selecting');
    bulk = false;
    layout.append(toolbar);
    setBackIcon(false);
    selectionLabel.textContent = '';
    snoozeButton.disabled = false;
    toolbar.setAttribute('aria-label', 'Conversation navigation');
    toolbar.hidden = false;
    previousButton.hidden = nextButton.hidden = false;
    printButton.hidden = false;
    previousButton.disabled = adjacentMessageIndex(win.gDBView, row.index, -1) < 0;
    nextButton.disabled = adjacentMessageIndex(win.gDBView, row.index, 1) < 0;
    layout.classList.add('gm-reading');
    // A single click must both reveal the pane and display the selected mail.
    // Do not rely only on a splitter expansion event to refresh the reader.
    if (!layout.messagePaneVisible) layout.messagePaneVisible = true;
    win.threadPane?._onSelect(new win.Event('select'));
    back.focus({preventScroll:true});
  }
  function click(event) {
    if (!isReadingClick(event)) return;
    const row = event.target.closest('tr.table-layout');
    if (!row || !tree.contains(row)) return;
    if (pending !== null) win.cancelAnimationFrame(pending);
    const view = win.gDBView, index = row.index, ticket = ++openTicket;
    let header;
    try { header = view?.getMsgHdrAt(index); } catch (_) { return; }
    if (!header) return;
    const identity = {key:header.messageKey, folderURI:header.folder?.URI};
    // Recycled rows and folder changes must not redirect a queued click.
    pending = win.requestAnimationFrame(() => {
      if (ticket !== openTicket || closed) return;
      pending = null;
      if (win.gDBView !== view || row.index !== index) return;
      try { if (!sameMessage(view.getMsgHdrAt(index),identity)) return; } catch (_) { return; }
      open(row);
    });
  }
  function doubleClick(event) {
    if (!isReadingClick(event) || !event.target.closest('tr.table-layout')) return;
    // The first click already opened the in-tab reader; avoid a second tab.
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  // Conversations archives via the messages API, bypassing our toolbar.
  // Observe successful moves so every archive entry point returns to the list.
  const moveListener = {
    msgsMoveCopyCompleted(move, messages) {
      if (active && readingMessageWasMoved(previous, move, messages)) {
        leave(true);
      }
    }
  };
  MailServices.mfn.addListener(moveListener, Ci.nsIMsgFolderNotificationService.msgsMoveCopyCompleted);
  function folderChange() { tagPopup.hidePopup(); leave(false); bulk = false; toolbar.hidden = true; threadPane?.classList.remove('gm-bulk-selecting'); }
  function backClick() { if (active) leave(true); else clearBulk(); }
  tree.addEventListener('click', selectionClick, true);
  tree.addEventListener('select', selectionChanged);
  tree.addEventListener('click', click, true);
  tree.addEventListener('dblclick', doubleClick, true);
  folderTree.addEventListener('select', folderChange, true);
  back.addEventListener('click', backClick);
  function close() {
    leave(false);
    closed = true;
    threadPane?.classList.remove('gm-bulk-selecting');
    layout.messagePaneVisible = originalMessagePaneVisible;
    MailServices.mfn.removeListener(moveListener);
    tree.removeEventListener('click', selectionClick, true);
    tree.removeEventListener('select', selectionChanged);
    tree.removeEventListener('click', click, true);
    tree.removeEventListener('dblclick', doubleClick, true);
    for (const [column, state] of originalColumns) Object.assign(column, state);
    if (originalUpdateColumns && win.threadPane.updateColumns === updateColumns) {
      win.threadPane.updateColumns = originalUpdateColumns;
      originalUpdateColumns.call(win.threadPane); tree.reset();
    }
    folderTree.removeEventListener('select', folderChange, true);
    back.removeEventListener('click', backClick);
    for (const heading of headingTargets) heading.removeEventListener('click', headingClick);
    for (const document of keyDocuments) document.removeEventListener("keydown", labelKey, true);
    win.removeEventListener("load", documentLoaded, true);
    tagPopup.hidePopup?.();
    for (const popup of popups) popup.remove();
    toolbar.remove(); style.remove();
    win.removeEventListener('unload', close);
  }
  win.addEventListener('unload', close, {once:true});
  return {close};
}
