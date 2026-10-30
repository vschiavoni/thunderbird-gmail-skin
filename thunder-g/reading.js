/* Gmail-like navigation around the native/Conversations message pane.
 * Actions delegate to native Thunderbird commands and installed Follow-Ups.
 */
function isReadingClick(event) {
  return event.button === 0 && !event.ctrlKey && !event.metaKey &&
    !event.shiftKey && !event.altKey &&
    !event.target.closest('button, input, a, .button-column, .select-column, .selectcol-column, .twisty, .gm-reading-toolbar, [data-gm-label-link]');
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
    !event.target?.ownerDocument?.documentURI?.includes('/messengercompose/') &&
    !event.target?.closest?.('input:not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], search-textbox');
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

// Conversations includes messages from Sent/Archive that are absent from gDBView.
// Resolve its own message IDs with its own extension manager, never ours.
function conversationLabelMessages(document, resolve) {
  const lists = document.querySelectorAll('ul[is="message-tags"][msgid]');
  if (!lists.length) return null; // Loading: never silently label a partial scope.
  const messages = new Map();
  for (const list of lists) {
    const id = Number(list.getAttribute('msgid'));
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    const message = resolve(id);
    if (!message?.folder?.URI || message.messageKey === undefined) return null;
    messages.set(JSON.stringify([message.folder.URI, message.messageKey]), message);
  }
  return [...messages.values()];
}
function sameLabelMessages(first, second) {
  if (!first || !second || first.length !== second.length) return false;
  const keys = new Set(first.map(message => JSON.stringify([message.folder?.URI, message.messageKey])));
  return second.every(message => keys.has(JSON.stringify([message.folder?.URI, message.messageKey])));
}
// Conversation rendering deduplicates Message-IDs, but Inbox and Sent still
// hold separate physical messages. Resolve exact IDs in local summary databases
// when labeling; never scan message bodies or match unrelated subjects.
function conversationPhysicalMessages(messages,copyFolders=null) {
  const physical=new Map(),folders=new Map();
  const remember=message=>physical.set(JSON.stringify([message.folder.URI,message.messageKey]),message);
  for(const message of messages){
    remember(message);
    try{
      const inbox=typeof Ci!=='undefined' && message.folder.rootFolder?.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
      if(inbox)folders.set(inbox.URI,inbox);
    }catch(_){/* A provider may not expose a local Inbox summary. */}
  }
  const sent=copyFolders || (typeof independentSentFolders==='function'?independentSentFolders():[]);
  for(const folder of sent)folders.set(folder.URI,folder);
  for(const message of messages){
    const id=String(message.messageId || '').trim().replace(/^<|>$/g,'');if(!id)continue;
    for(const folder of folders.values()){
      if(folder.URI===message.folder.URI)continue;
      try{const copy=folder.msgDatabase?.getMsgHdrForMessageID(id);if(copy?.folder)remember(copy);}
      catch(_){/* Missing/offline summaries must not block the selected messages. */}
    }
  }
  return [...physical.values()];
}
function applyConversationLabel(messages, key, add) {
  const folders = new Map();
  for (const message of conversationPhysicalMessages(messages)) {
    const uri = message.folder.URI;
    if (!folders.has(uri)) folders.set(uri, {folder:message.folder, messages:[]});
    folders.get(uri).messages.push(message);
  }
  // Same native folder operations used by Thunderbird's tag command; no selection
  // manipulation, message copying, or account/provider-specific tag storage.
  for (const {folder,messages} of folders.values()) {
    if (add) folder.addKeywordsToMessages(messages, key);
    else folder.removeKeywordsFromMessages(messages, key);
  }
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
  let draftOpener = null, draftResolver = null;
  let useIndependent = false, independent = null;
  let closed = false;
  let pending = null, openTicket = 0;
  let previous = null;
  let bulk = false;
  const threadPane = doc.getElementById('threadPane');
  const headingTargets = ['threadPaneFolderName', 'threadPaneFolderCountContainer']
    .map(id => doc.getElementById(id)).filter(Boolean);
  const selectionLabel = doc.createElement('span');
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
      box-sizing:border-box; block-size:44px!important; min-block-size:44px!important; max-block-size:44px!important; margin-block:0!important; padding:3px 5px!important; background:var(--layout-background-0, white);
      color:var(--layout-color-0, #202124); border-radius:16px 16px 0 0;
      border-bottom:1px solid var(--layout-border-0, #e8eaed);
      font:inherit; min-width:0; overflow-x:auto; flex-shrink:0;
    }
    .gm-reading-toolbar[hidden], .gm-reading-toolbar [hidden] { display:none !important; }
    .gm-reading-back {
      display:inline-flex; align-items:center; justify-content:center;
      appearance:none; box-sizing:border-box;
      inline-size:36px !important; min-inline-size:36px !important; max-inline-size:36px !important;
      block-size:36px !important; min-block-size:36px !important; max-block-size:36px !important;
      margin:0; font:inherit; color:inherit; border:0; border-radius:50%;
      background:transparent; padding:8px; cursor:pointer; flex:0 0 36px;
    }
    @media (prefers-reduced-motion:no-preference) {
      .gm-reading-back { transition:background-color 150ms cubic-bezier(.2,0,0,1); }
    }
    .gm-reading-back:hover { background:var(--treeitem-background-hover, #e9eef6); }

    :is(.gm-reading-back) { position:relative; isolation:isolate; background:transparent !important; }
    :is(.gm-reading-back):is(:hover,:focus-visible) { background:transparent !important; }
    :is(.gm-reading-back)::before {
      content:''; position:absolute; inset:0; border-radius:inherit; z-index:-1;
      pointer-events:none; background:light-dark(#20212414,#ffffff20); opacity:0; transform:scale(.65);
    }
    :is(.gm-reading-back):is(:hover,:focus-visible):not(:disabled):is(:hover,:focus-visible) { background:transparent !important; }
    :is(.gm-reading-back):is(:hover,:focus-visible):not(:disabled)::before { opacity:1; transform:scale(1); }
    @media (prefers-reduced-motion:no-preference) {
      :is(.gm-reading-back):is(:hover,:focus-visible) { background:transparent !important; }
    :is(.gm-reading-back)::before { transition:transform 180ms cubic-bezier(.2,0,0,1), opacity 120ms ease-out; }
    }
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
  gmBindAttribute(toolbar, 'aria-label', () => gmText("Conversation navigation"));
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
    const label = selection ? gmText("Clear selection") : gmText("Back to message list");
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
    button.type = 'button'; gmBindAction(button,'title',label);
    gmBindAction(button,'aria-label',label,true);
    button.append(icon(path));
    button.addEventListener('click', () => handler(button));
    toolbar.append(button); return button;
  }
  function command(name, returnToList = false) {
    if (!win.commandController.isCommandEnabled(name)) return;
    win.commandController.doCommand(name);
    if (returnToList) { if (active) leave(true); else clearBulk(); }
  }
  action(gmText("Archive"), 'M4 8h16v13H4z M3 3h18v5H3z M9 12h6 M12 10v7 m-3-3 3 3 3-3',
    () => command('cmd_archive', true));
  action(gmText("Mark as spam"), 'M8 3h8l5 5v8l-5 5H8l-5-5V8z M12 7v7 M12 17v1',
    () => command('cmd_markAsJunk', true));
  action(gmText("Delete"), 'M5 6h14 M9 6V3h6v3 M7 6l1 15h8l1-15 M10 9v9 M14 9v9',
    () => command('cmd_deleteMessage', true));
  separator();
  function readAction() {
    const messages = win.gDBView?.getSelectedMsgHdrs() || [];
    return messages.some(message => !message.isRead)
      ? {name:'cmd_markAsRead', label:gmText("Mark as read")}
      : {name:'cmd_markAsUnread', label:gmText("Mark as unread")};
  }
  function syncReadAction() {
    const {label,name} = readAction();
    gmBindValue(readButton,'title',()=>readAction().label);
    gmBindAttribute(readButton,'aria-label',()=>readAction().label);
    const unread=name==='cmd_markAsUnread';
    const svg=icon(unread ? MATERIAL_MARK_EMAIL_UNREAD : 'M3 9l9-6 9 6v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9z M3 9l9 6 9-6');
    if(unread){svg.setAttribute('fill','currentColor');svg.setAttribute('stroke','none');}
    readButton.replaceChildren(svg);
  }
  const readButton = action('Mark as unread', MATERIAL_MARK_EMAIL_UNREAD,
    // Reading can change flags after opening (including delayed auto-read).
    // Resolve the operation at click time, not from the initial button label.
    () => command(readAction().name, true));
  syncReadAction();
  const snoozeButton = action(gmText("Snooze / Follow-Up…"), 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 6v6l4 3', () => {
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
  action(gmText("Move to…"), 'M3 6h7l2 2h9v12H3z M12 10v7 m-3-3 3 3 3-3',
    button => movePopup.openPopup(button, 'after_start', 0, 0, false, false));
  const tagPopup = doc.createXULElement('panel');
  tagPopup.classList.add('gm-label-panel');
  tagPopup.setAttribute('noautofocus', 'true');
  gmBindAttribute(tagPopup, 'aria-label', () => gmText("Label as"));
  doc.documentElement.append(tagPopup); popups.push(tagPopup);
  const picker = doc.createElement('div');
  picker.className = 'gm-label-picker';
  const heading = doc.createElement('div');
  const scopeNote = doc.createElement('p'); scopeNote.className = 'gm-label-scope';
  gmBindValue(scopeNote, "textContent", () => gmText("Includes sent replies in this conversation."));
  scopeNote.hidden = true;
  const search = doc.createElement('input');
  search.type = 'search';
  const searchBox = doc.createElement('div'); searchBox.className = 'gm-label-search';
  const searchIcon = icon('M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15 M16 16l5 5');
  searchBox.append(search, searchIcon);
  gmBindAttribute(search, 'aria-label', () => gmText("Search labels"));
  const tagList = doc.createElement('div'); tagList.className = 'gm-label-list';
  const empty = doc.createElement('div'); gmBindValue(empty, "textContent", () => gmText("No matching labels"));
  empty.setAttribute('role', 'status');
  const footer = doc.createElement('div'); footer.className = 'gm-label-footer';
  for (const [title, command] of [[gmText("Create new"), 'cmd_addTag'], [gmText("Manage labels"), 'cmd_manageTags']]) {
    const button = doc.createElement('button'); button.type = 'button'; gmBindAction(button,'textContent',title);
    button.addEventListener('click', () => {
      if (command === 'cmd_addTag' && !sameSelection()) { tagPopup.hidePopup(); return; }
      tagPopup.hidePopup();
      if (command === 'cmd_addTag') showNewLabel(button);
      else win.commandController.doCommand(command);
    });
    footer.append(button);
  }
  picker.append(heading, scopeNote, searchBox, tagList, empty, footer); tagPopup.append(picker);
  let pickerMessages = [], pickerSelection = [], pickerTags = [], pickerOpen = false, returnFocus = null;
  let pickerConversation = null;
  function conversationDocument() {
    if (!active) return null;
    if (useIndependent) return independent;
    const document = doc.getElementById('multiMessageBrowser')?.contentDocument;
    return document?.documentURI === 'chrome://conversations/content/experiment-api/stub.html' ? document : null;
  }
  function resolveConversation(document) {
    if(document===independent) {
      const messages=independent?.getMessages();
      return messages?.length ? messages : null;
    }
    try {
      const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
      const extension = ExtensionParent.GlobalManager.extensionMap.get('gconversation@xulforum.org');
      return conversationLabelMessages(document, id => extension?.messageManager?.get(id));
    } catch (_) { return null; }
  }
  function applyPickerLabel(key, add) {
    if (pickerConversation) {
      applyConversationLabel(pickerMessages, key, add);
      independent?.refresh?.();
    }
    else win.commandController._toggleMessageTag(key, add);
  }
  function sameSelection() {
    const selected = win.gDBView?.getSelectedMsgHdrs() || [];
    if (!sameLabelMessages(Array.from(selected), pickerSelection)) return false;
    return !pickerConversation || (conversationDocument() === pickerConversation &&
      sameLabelMessages(resolveConversation(pickerConversation), pickerMessages));
  }
  function renderTags() {
    tagList.replaceChildren();
    for (const tag of pickerTags.filter(tag=>labelMatchesQuery(tag.tag,search.value))) {
      const row = doc.createElement('label'); row.className = 'gm-label-option';
      const checkbox = doc.createElement('input'); checkbox.type = 'checkbox';
      const state = labelAssignmentState(tag, pickerMessages);
      checkbox.checked = state.checked; checkbox.indeterminate = state.mixed;
      checkbox.setAttribute('aria-label', tag.tag);
      const name = doc.createElement('span'); name.textContent = tag.tag;
      row.title=tag.tag;
      row.append(checkbox,name);tagList.append(row);
      checkbox.addEventListener('change', () => {
        if (!sameSelection()) { tagPopup.hidePopup(); return; }
        try {
          applyPickerLabel(tag.key, checkbox.checked);
          checkbox.indeterminate = false;
        } catch (error) {
          // Cross-folder writes are not atomic. Keep the picker open and report
          // failure instead of implying that every message was updated.
          const state = labelAssignmentState(tag, pickerMessages);
          checkbox.checked = state.checked; checkbox.indeterminate = state.mixed;
          empty.hidden = false; gmBindValue(empty, "textContent", () => gmText("Could not update every message. Check labels and try again."));
          console.error(gmText("Conversation label update failed:"), error);
        }
      });
    }
    empty.hidden = tagList.childElementCount > 0;
  }
  function showLabels(anchor) {
    const messages = win.gDBView?.getSelectedMsgHdrs() || [];
    if (!messages.length) return;
    pickerSelection = Array.from(messages);
    pickerConversation = conversationDocument();
    pickerMessages = pickerConversation ? resolveConversation(pickerConversation) : pickerSelection;
    if (pickerConversation && pickerMessages && !pickerSelection.every(selected =>
      pickerMessages.some(message => message.messageKey === selected.messageKey && message.folder.URI === selected.folder?.URI))) pickerMessages = null;
    const count = pickerMessages?.length;
    gmBindValue(heading, "textContent", () => gmText("Label as:"));
    scopeNote.hidden = true;
    gmBindAttribute(tagPopup, 'aria-label', () => pickerConversation
      ? gmText("Label as — entire conversation, $1 messages, includes sent replies", count ?? 'loading')
      : gmText("Label as — $1 selected messages", count));
    if (!pickerMessages) {
      pickerTags = []; pickerMessages = []; search.disabled = true;
      returnFocus = doc.activeElement; search.value = ''; renderTags();
      empty.hidden = false; gmBindValue(empty, "textContent", () => gmText("Conversation is still loading. Close this panel and try again."));
      tagPopup.openPopup(anchor, 'after_start', 0, 0, false, false); return;
    }
    search.disabled = false; gmBindValue(empty, "textContent", () => gmText("No matching labels"));
    pickerTags = MailServices.tags.getAllTags();
    returnFocus = doc.activeElement; search.value = ''; renderTags();
    tagPopup.openPopup(anchor, 'after_start', 0, 0, false, false);
  }
  const createPopup=doc.createXULElement('panel');createPopup.classList.add('gm-label-panel');
  gmBindAttribute(createPopup, 'aria-label', () => gmText("New label"));doc.documentElement.append(createPopup);popups.push(createPopup);
  const form=doc.createElement('form');form.className='gm-new-label';
  const title=doc.createElement('h2');gmBindValue(title, "textContent", () => gmText("New label"));
  const nameLabel=doc.createElement('label');gmBindValue(nameLabel, "textContent", () => gmText("Please enter a new label name:"));
  const newName=doc.createElement('input');newName.type='text';gmBindAttribute(newName, 'aria-label', () => gmText("New label name"));nameLabel.append(newName);
  const nestLabel=doc.createElement('label');nestLabel.className='gm-nest-label';
  const nest=doc.createElement('input');nest.type='checkbox';const nestText=doc.createElement('span');gmBindValue(nestText, "textContent", () => gmText("Nest label under:"));nestLabel.append(nest,nestText);
  const parent=doc.createElement('select');gmBindAttribute(parent, 'aria-label', () => gmText("Parent label"));parent.disabled=true;
  const error=doc.createElement('p');error.setAttribute('role','alert');error.hidden=true;
  const buttons=doc.createElement('div');buttons.className='gm-new-label-buttons';
  const cancel=doc.createElement('button');cancel.type='button';gmBindValue(cancel, "textContent", () => gmText("Cancel"));
  const create=doc.createElement('button');create.type='submit';gmBindValue(create, "textContent", () => gmText("Create"));
  buttons.append(cancel,create);form.append(title,nameLabel,nestLabel,parent,error,buttons);createPopup.append(form);
  function validateNewLabel(){
    create.disabled=!newName.value.trim() || (nest.checked && !parent.value);
    parent.disabled=!nest.checked;
  }
  let applyNewLabel=true;
  function showNewLabel(anchor,apply=true){
    applyNewLabel=apply;
    newName.value='';nest.checked=false;parent.replaceChildren();error.hidden=true;
    const placeholder=doc.createElement('option');placeholder.value='';gmBindValue(placeholder, "textContent", () => gmText("Choose a parent label"));parent.append(placeholder);
    for(const entry of nestedLabelRows(MailServices.tags.getAllTags())){
      const option=doc.createElement('option');option.value=entry.path;option.textContent=entry.path;parent.append(option);
    }
    validateNewLabel();createPopup.openPopup(apply?labelsButton:anchor,'after_start',0,0,false,false);
  }
  newName.addEventListener('input',validateNewLabel);nest.addEventListener('change',validateNewLabel);parent.addEventListener('change',validateNewLabel);
  cancel.addEventListener('click',()=>createPopup.hidePopup());
  createPopup.addEventListener('popupshown',()=>newName.focus());
  form.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();createPopup.hidePopup();}});
  form.addEventListener('submit',event=>{
    event.preventDefault();
    if(applyNewLabel && !sameSelection()){error.hidden=false;gmBindValue(error, "textContent", () => gmText("Message selection changed. Close this panel and try again."));return;}
    try {
      const path=nestedLabelName(newName.value,nest.checked?parent.value:'',MailServices.tags.getAllTags());
      MailServices.tags.addTag(path,'','');
      if(applyNewLabel)applyPickerLabel(MailServices.tags.getKeyForTag(path),true);
      createPopup.hidePopup();
    }catch(failure){error.hidden=false;gmBindValue(error, "textContent", () => failure.message || gmText("Could not create or apply this label."));}
  });
  function createSidebarLabel(event){event.preventDefault();showNewLabel(event.detail.anchor,false);}
  win.addEventListener('gm-create-sidebar-label',createSidebarLabel);
  const labelsButton = action(gmText("Labels… (L)"), 'M3 4h9l9 8-9 8H3z M7 10v4', showLabels);
  search.addEventListener('input', renderTags);
  tagPopup.addEventListener('popupshown', () => { pickerOpen = true; search.focus(); });
  tagPopup.addEventListener('popuphidden', () => {
    pickerOpen = false;
    if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
  });
  picker.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); tagPopup.hidePopup(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const options = [search, ...tagList.querySelectorAll('input,button:not(:disabled)')];
      const index = options.indexOf(doc.activeElement);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      options[(index + step + options.length) % options.length]?.focus();
      event.preventDefault(); event.stopPropagation();
    }
  });
  // Capture in each document of this mail pane, including Conversations' browser.
  // Other tabs, compose editors, search fields and modified shortcuts are untouched.
  const keyDocuments = new Set();
  function zoomReading(action) {
    if(closed || !active)return false;
    if(useIndependent){independent?.zoom(action);return true;}
    const browser=conversationDocument() ? doc.getElementById('multiMessageBrowser') :
      doc.getElementById('messageBrowser')?.contentWindow?.getMessagePaneBrowser?.();
    zoomNativeMessage(win,browser,action);
    // Consume the shortcut even while loading, so it cannot resize the UI.
    return true;
  }
  function labelKey(event) {
    const action=mailZoomAction(event);
    if(action && zoomReading(action)){event.preventDefault();event.stopImmediatePropagation();return;}
    if(active && useIndependent && !pickerOpen && independent?.handleTagKey?.(event))return;
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
    .gm-new-label { width:min(420px,80vw); padding:24px; color:var(--layout-color-0,#202124); background:var(--layout-background-0,#fff); }
    .gm-new-label h2 { margin:0 0 24px; font-size:22px; font-weight:400; }
    .gm-new-label input[type=text],.gm-new-label select { display:block; box-sizing:border-box; width:100%; padding:10px; margin:10px 0 18px; color:inherit; background:var(--layout-background-0,#fff); border:1px solid var(--layout-border-0,#888); border-radius:4px; font:inherit; }
    .gm-nest-label { display:flex; align-items:center; gap:8px; }
    .gm-new-label-buttons { display:flex; justify-content:flex-end; gap:12px; margin-top:24px; }
    .gm-new-label button { padding:8px 16px; border:0; border-radius:18px; font:inherit; color:inherit; background:var(--layout-background-1,#f1f3f4); cursor:pointer; }
    .gm-new-label button:disabled { opacity:.5; cursor:default; }
    .gm-label-panel { --panel-padding:0; --panel-border-radius:4px; }
    .gm-label-picker { width:360px; max-width:80vw; padding:12px 0 6px; box-sizing:border-box;
      background:var(--layout-background-0, white); color:var(--layout-color-0, #3c4043);
      font:inherit; font-size:1rem; border-radius:4px; }
    .gm-label-picker > div:first-child { font-weight:400; margin:0 12px 6px; }
    .gm-label-scope { margin:0 16px 12px; font-size:.85em; color:var(--layout-color-1, #5f6368); }
    .gm-label-search { display:flex; align-items:center; margin:0 8px 10px 12px;
      border-bottom:1px solid var(--layout-border-0, #dadce0); }
    .gm-label-search:focus-within { border-bottom:2px solid #4285f4; }
    .gm-label-search > input { appearance:none; box-sizing:border-box; width:100%; min-width:0;
      height:28px; padding:0; color:inherit; background:transparent; font:inherit;
      border:0; border-radius:0; outline:none; box-shadow:none; }
    .gm-label-search > svg { width:20px; height:20px; flex:none; margin-inline:8px; }
    .gm-label-list { max-height:260px; overflow-y:auto; padding-block:4px 8px; }
    .gm-label-option { display:flex; align-items:center; gap:10px; height:24px; min-height:24px; margin:0;
      box-sizing:border-box; padding:2px 20px; cursor:pointer; }
    .gm-label-option:hover, .gm-label-option:focus-within,
    .gm-label-footer > button:hover { background:var(--treeitem-background-hover, #f1f3f4); }
    .gm-label-option input { appearance:none; box-sizing:border-box; width:15px; height:15px;
      margin:0; flex:none; border:1.5px solid currentColor; border-radius:1px; color:inherit;
      background:transparent; display:grid; place-content:center; }
    .gm-label-option input:checked::before { content:''; width:8px; height:4px;
      border-left:2px solid currentColor; border-bottom:2px solid currentColor; transform:translateY(-1px) rotate(-45deg); }
    .gm-label-option input:indeterminate::before { content:''; width:8px; height:2px; background:currentColor; }
    .gm-label-option input:focus-visible { outline:2px solid #4285f4; outline-offset:2px; }
    .gm-label-option > span:last-child { min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .gm-label-picker > [role="status"] { padding:8px 22px; }
    .gm-label-footer { border-top:1px solid var(--layout-border-0, #e8eaed); padding-top:4px; }
    .gm-label-footer > button { display:block; width:100%; text-align:start; font:inherit;
      color:inherit; background:transparent; border:0; border-radius:0; margin:0;
      padding:4px 12px 4px 45px; height:26px; min-height:26px; box-sizing:border-box; cursor:pointer; }
    `;
  const printButton = action(gmText("Print conversation"), 'M6 8V3h12v5 M3 17V9h18v8h-3 M6 14h12v7H6z M17 11h1', () => {
    if(useIndependent) {independent?.print();return}
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
  const previousButton = action(gmText("Previous message"), 'M15 5l-7 7 7 7', () => navigate(-1));
  const nextButton = action(gmText("Next message"), 'M9 5l7 7-7 7', () => navigate(1));
  previousButton.hidden = nextButton.hidden = true;
  layout.append(toolbar);
  let selectionControl=null,selectionControlHome=null;
  function syncBulk() {
    syncReadAction();
    if (active || closed || !threadPane) return;
    previousButton.hidden = nextButton.hidden = true;
    printButton.hidden = true;
    const count = win.gDBView?.getSelectedMsgHdrs().length || 0;
    toolbar.hidden = !bulk || !count;
    if(selectionControl){
      if(!toolbar.hidden){toolbar.prepend(selectionControl);back.hidden=true;}
      else {selectionControlHome?.prepend(selectionControl);back.hidden=false;}
    }
    if (toolbar.hidden) threadPane.classList.remove('gm-bulk-selecting');
    else threadPane.classList.add('gm-bulk-selecting');
    if (!toolbar.hidden) {
      threadPane.prepend(toolbar);
      setBackIcon(true);
      gmBindValue(selectionLabel, "textContent", () => gmText("$1 selected", count));
      gmBindAttribute(toolbar, 'aria-label', () => gmText("Selected message actions"));
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
    independent?.hide();
    layout.classList.remove('gm-reading');
    bulk = false;
    toolbar.hidden = true;
    layout.messagePaneVisible = false;
    // Reader selection can include every member of a collapsed conversation.
    // Returning to the inbox must not retain that implicit bulk selection.
    if (restorePosition) {clearBulk();tree.invalidate?.();}
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
    const inlineDraft=useIndependent && typeof inlineReplyEnabled!=='undefined' && inlineReplyEnabled ? draftResolver?.(row) : null;
    if (!inlineDraft && draftOpener?.(row)) {
      leave(false);
      return;
    }
    previous = {
      index:row.index,
      message:{key:header.messageKey, folderURI:header.folder?.URI},
      folderURI:win.gFolder?.URI, scrollTop:tree.scrollTop, scrollLeft:tree.scrollLeft };
    active = true;
    threadPane?.classList.remove('gm-bulk-selecting');
    bulk = false;
    layout.append(toolbar);
    setBackIcon(false);
    if(selectionControl)selectionControlHome?.prepend(selectionControl);
    back.hidden=false;
    selectionLabel.textContent = '';
    snoozeButton.disabled = false;
    gmBindAttribute(toolbar, 'aria-label', () => gmText("Conversation navigation"));
    toolbar.hidden = false;
    syncReadAction();
    previousButton.hidden = nextButton.hidden = false;
    printButton.hidden = false;
    gmBindValue(printButton, "title", () => useIndependent ? gmText("Print message") : gmText("Print conversation"));
    gmBindAttribute(printButton,'aria-label',()=>printButton.title);
    previousButton.disabled = adjacentMessageIndex(win.gDBView, row.index, -1) < 0;
    nextButton.disabled = adjacentMessageIndex(win.gDBView, row.index, 1) < 0;
    layout.classList.add('gm-reading');
    // A single click must both reveal the pane and display the selected mail.
    // Do not rely only on a splitter expansion event to refresh the reader.
    if (useIndependent) {
      independent ||= installIndependentReader(win);
      const identity = previous.message;
      independent.open(header,inlineDraft).catch(() => {
        if (!active || !sameMessage(header,previous?.message) || !sameMessage(header,identity)) return;
        independent.hide();
        layout.messagePaneVisible = true;
        win.threadPane?._onSelect(new win.Event('select'));
      });
    } else {
      if (!layout.messagePaneVisible) layout.messagePaneVisible = true;
      win.threadPane?._onSelect(new win.Event('select'));
    }
    back.focus({preventScroll:true});
  }
  function click(event) {
    if(event.target.closest('.twisty')) {
      // A preceding text click may still be waiting for the next frame.
      // Expanding a thread must cancel it rather than open the reader afterward.
      if(pending!==null){win.cancelAnimationFrame(pending);pending=null;++openTicket;}
      return;
    }
    if (!isReadingClick(event)) return;
    const row = event.target.closest('tr.table-layout') || event.target.closest('tr.card-layout');
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
    if (!isReadingClick(event) || !(event.target.closest('tr.table-layout') || event.target.closest('tr.card-layout'))) return;
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
  function labelViewOpened(){leave(true);}
  win.addEventListener('gm-open-label-view',labelViewOpened);
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
    independent?.close();
    threadPane?.classList.remove('gm-bulk-selecting');
    layout.messagePaneVisible = originalMessagePaneVisible;
    MailServices.mfn.removeListener(moveListener);
    tree.removeEventListener('click', selectionClick, true);
    tree.removeEventListener('select', selectionChanged);
    tree.removeEventListener('click', click, true);
    tree.removeEventListener('dblclick', doubleClick, true);
    folderTree.removeEventListener('select', folderChange, true);
    back.removeEventListener('click', backClick);
    win.removeEventListener('gm-open-label-view',labelViewOpened);
    win.removeEventListener('gm-create-sidebar-label',createSidebarLabel);
    for (const heading of headingTargets) heading.removeEventListener('click', headingClick);
    for (const document of keyDocuments) document.removeEventListener("keydown", labelKey, true);
    win.removeEventListener("load", documentLoaded, true);
    tagPopup.hidePopup?.();
    for (const popup of popups) popup.remove();
    toolbar.remove(); style.remove();
    win.removeEventListener('unload', close);
  }
  win.addEventListener('unload', close, {once:true});
  return {close,zoom:zoomReading,
    setSelectionControl(control,home=null){
      if(selectionControl && selectionControlHome)selectionControlHome.prepend(selectionControl);
      selectionControl=control;selectionControlHome=home;
      if(!control)back.hidden=false;
      syncBulk();
    },
    setDraftOpener(opener,resolver) { draftOpener = typeof opener === 'function' ? opener : null; draftResolver=typeof resolver==='function'?resolver:null; },
    setIndependent(enabled) {
      if (useIndependent === (enabled === true)) return;
      if (active) leave(true);
      useIndependent = enabled === true;
    },
    openIndex(index) {
      tree.selectedIndex = index;
      open({index,dataset:{}});
    },
    selectIndices(indices) {
      if(indices.length)tree._gmSmartActionPending=false;
      if (active) leave(false);
      tree.selectedIndices = indices;
      bulk = indices.length > 0;
      win.threadPaneHeader?.updateSelectedCount();
      syncBulk();
    }
  };
}
