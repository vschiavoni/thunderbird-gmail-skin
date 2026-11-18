function conversationTagColors(color) {
  return chipColors(color);
}
function conversationTitleLabels(lists) {
  const tags = new Map();
  for (const list of lists) {
    let values;
    try { values = JSON.parse(list.getAttribute('tags') || '[]'); } catch (_) { continue; }
    if (!Array.isArray(values)) continue;
    for (const tag of values) {
      if (typeof tag?.key === 'string' && typeof tag.name === 'string' && !tags.has(tag.key)) tags.set(tag.key,tag);
    }
  }
  return [...tags.values()];
}

/* Apply presentation to Conversations' open component roots, never mail iframes. */
function installConversationStyle(win, css, resolveTags = null, removeLabel = null) {
  const correctedLists = new Map();
  const messageChips = new Map();
  function renderMessageTags(list) {
    if (list.getAttribute("expanded") !== "true") return;
    const header = list.closest?.('.message')?.querySelector('.messageHeader.expanded .shrink-box');
    if (!header) return;
    const lists=[...win.document.querySelectorAll('ul[is="message-tags"]')];
    const common=commonLabelKeys(lists.map(item=>conversationTitleLabels([item])));
    const labels = conversationTitleLabels([list]).filter(tag=>!common.has(tag.key));
    const signature = JSON.stringify(labels);
    const previous = messageChips.get(list);
    if (previous?.signature === signature && previous.node.parentNode === header) return;
    previous?.node.remove();
    const node = win.document.createElement('div');
    node.className = 'gm-message-tags';
    gmBindAttribute(node, 'aria-label', () => gmText("Labels on this message"));
    for (const tag of labels) {
      const chip = win.document.createElement('span');
      chip.textContent = tag.name;
      chip.title = tag.name;
      bindLabelNavigation(chip,tag,win);
      const colors = conversationTagColors(tag.color);
      chip.style.setProperty('--gm-tag-bg',colors.background);
      chip.style.setProperty('--gm-tag-fg',colors.foreground);
      const remove = win.document.createElement('button');
      remove.type = 'button';
      remove.className = 'gm-remove-message-tag';
      gmBindValue(remove, "title", () => gmText("Remove $1 from this message", tag.name));
      gmBindAttribute(remove,'aria-label',()=>remove.title);
      remove.addEventListener('click',event => {
        event.preventDefault(); event.stopPropagation();
        if (closed || list.isConnected === false) return;
        // Delegate to this exact message's native control. Conversations owns
        // the write and the resulting tag update, including failure handling.
        const nativeTag = [...list.querySelectorAll('li')].find(item => item.getAttribute('key') === tag.key);
        nativeTag?.querySelector('.tag-x')?.click();
      });
      chip.append(remove);
      node.append(chip);
    }
    if (labels.length) header.append(node);
    list.classList.add('gm-tags-in-message-header');
    messageChips.set(list,{node,signature});
  }
  function syncMessageTags(list) {
    if (!list.getAttribute || !list.matches?.('ul[is="message-tags"]')) return;
    const id = Number(list.getAttribute("msgid"));
    if (resolveTags && Number.isSafeInteger(id) && id > 0) {
      let labels;
      try { labels = resolveTags(id); } catch (_) { /* Keep Conversations' tags on lookup failure. */ }
      if (Array.isArray(labels)) {
        const value = JSON.stringify(labels);
        if (list.getAttribute("tags") !== value) {
          if (!correctedLists.has(list)) correctedLists.set(list,list.getAttribute("tags"));
          list.setAttribute("tags",value);
        }
      }
    }
    renderMessageTags(list);
  }
  function refreshMessageTags() {
    if (closed) return;
    for (const list of win.document.querySelectorAll('ul[is="message-tags"]')) syncMessageTags(list);
    updateTitleTags();
  }
  const hosts = ['conversation-header','linkified-subject','conv-actions-buttons',
    'contact-label','message-header-options','message-footer','action-button','conversation-footer'];
  const selector = hosts.join(',');
  const roots = new Set();
  const styles = [];
  const footerCleanup = [];
  let titleRoot = null, titleChips = null, titleSignature = null;
  function updateTitleTags() {
    if (!titleRoot || closed) return;
    const lists=[...win.document.querySelectorAll('ul[is="message-tags"]')];
    const common=commonLabelKeys(lists.map(list=>conversationTitleLabels([list])));
    const labels = conversationTitleLabels(lists).filter(tag=>common.has(tag.key));
    for(const list of lists)renderMessageTags(list);
    const signature = JSON.stringify(labels.map(tag=>[tag.key,tag.name,tag.color]));
    if (signature === titleSignature) return;
    titleSignature = signature;
    titleChips?.remove();
    titleChips = win.document.createElement('div');
    titleChips.className = 'gm-title-tags';
    gmBindAttribute(titleChips, 'aria-label', () => gmText("Labels in this conversation"));
    for (const tag of labels) {
      const chip = win.document.createElement('span');
      chip.textContent = tag.name;
      gmBindValue(chip, "title", () => tag.name + gmText(" — present in this conversation"));
      bindLabelNavigation(chip,tag,win);
      const colors = conversationTagColors(tag.color);
      chip.style.setProperty('--gm-tag-bg',colors.background);
      chip.style.setProperty('--gm-tag-fg',colors.foreground);
      const remove=win.document.createElement('button');remove.type='button';
      remove.className='gm-remove-message-tag';
      remove.title=`Remove ${tag.name} from this conversation`;remove.setAttribute('aria-label',remove.title);
      remove.addEventListener('click',event=>{
        event.preventDefault();event.stopPropagation();
        if(closed || chip.isConnected===false)return;
        try {
          const lists=[...win.document.querySelectorAll('ul[is="message-tags"]')];
          if(!removeLabel)throw new Error('Conversation label removal unavailable');
          removeLabel(lists.map(list=>Number(list.getAttribute('msgid'))),tag.key);
          refreshMessageTags();
        }catch(error){remove.title='Could not remove label from every message. Try again.';}
      });
      chip.append(remove);
      titleChips.append(chip);
    }
    titleRoot.append(titleChips);
  }
  const tags = new Map();
  const tagLinks=new Map();
  const tagSelector = '.regular-tags > li[color], li[is="message-tag"][color]';
  function paintTag(tag) {
    if (!tag.getAttribute || !tag.style?.getPropertyValue) return;
    if (!tags.has(tag)) tags.set(tag, ['--gm-tag-bg','--gm-tag-fg'].map(name=>
      [name,tag.style.getPropertyValue(name),tag.style.getPropertyPriority(name)]));
    const key=tag.getAttribute('key');
    if(key && !tagLinks.has(tag))tagLinks.set(tag,bindLabelNavigation(tag,{key},win));
    const colors=conversationTagColors(tag.getAttribute('color'));
    tag.style.setProperty('--gm-tag-bg',colors.background);
    tag.style.setProperty('--gm-tag-fg',colors.foreground);
  }
  function paintTags(scope) {
    if (scope.matches?.(tagSelector)) paintTag(scope);
    for (const tag of scope.querySelectorAll?.(tagSelector) || []) paintTag(tag);
  }
  let closed = false;
  const observer = new win.MutationObserver(records => {
    if (closed) return;
    // Inspect only inserted subtrees, not the entire conversation on every edit.
    for (const record of records) {
      if (record.type === 'attributes') {
        if (record.attributeName === 'tags' || record.attributeName === 'msgid' || record.attributeName === 'expanded') { syncMessageTags(record.target); updateTitleTags(); }
        else paintTags(record.target);
      }
      else for (const node of record.addedNodes) scan(node);
    }
    for (const [list,{node}] of messageChips) {
      if (list.isConnected === false) {
        node.remove(); list.classList?.remove('gm-tags-in-message-header');
        messageChips.delete(list); correctedLists.delete(list);
      }
    }
  });
  function attach(host) {
    const root = host.shadowRoot;
    if (!root || roots.has(root)) return;
    roots.add(root);
    const style = win.document.createElement('style');
    style.textContent = css;
    root.append(style); styles.push(style);
    observer.observe(root,{childList:true,subtree:true});
    if (host.localName === 'linkified-subject') {
      titleRoot = root; titleSignature = null; updateTitleTags();
    }
    if (host.localName === 'conversation-footer') {
      for (const link of root.querySelectorAll('.forward, .print')) {
        const saved = ['title','role','tabindex'].map(name=>[name,link.getAttribute(name)]);
        link.setAttribute('title',link.textContent);
        link.setAttribute('role','button'); link.setAttribute('tabindex','0');
        const keydown = event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); link.click(); }
        };
        link.addEventListener('keydown',keydown);
        footerCleanup.push(() => {
          link.removeEventListener('keydown',keydown);
          for (const [name,value] of saved) {
            if (value === null) link.removeAttribute(name); else link.setAttribute(name,value);
          }
        });
      }
    }
    scan(root);
  }
  function scan(scope) {
    if (closed || !scope.querySelectorAll) return;
    syncMessageTags(scope);
    for (const list of scope.querySelectorAll('ul[is="message-tags"]')) syncMessageTags(list);
    paintTags(scope);
    if (scope.matches?.('ul[is="message-tags"]') || scope.querySelector?.('ul[is="message-tags"]')) updateTitleTags();
    if (scope.matches?.(selector)) attach(scope);
    for (const host of scope.querySelectorAll(selector)) attach(host);
  }
  observer.observe(win.document,{childList:true,subtree:true,attributes:true,attributeFilter:["color","tags","msgid","expanded"]});
  scan(win.document);
  for (const host of hosts) win.customElements.whenDefined(host).then(() => {
    if (closed) return;
    // A component can be upgraded after insertion. Query only that host type
    // in known roots; this runs once per definition, not per DOM mutation.
    for (const root of [win.document,...roots]) {
      for (const element of root.querySelectorAll(host)) attach(element);
    }
  });
  function close() {
    if (closed) return;
    closed = true; observer.disconnect();
    for (const [tag,values] of tags) for (const [name,value,priority] of values) {
      if (value) tag.style.setProperty(name,value,priority); else tag.style.removeProperty(name);
    }
    for(const close of tagLinks.values())close();tagLinks.clear();
    tags.clear();
    for (const [list,value] of correctedLists) {
      if (value === null) list.removeAttribute("tags"); else list.setAttribute("tags",value);
    }
    correctedLists.clear();
    for (const [list,{node}] of messageChips) {
      node.remove(); list.classList?.remove("gm-tags-in-message-header");
    }
    messageChips.clear();
    win.removeEventListener("focus",refreshMessageTags);
    titleChips?.remove(); titleRoot = null;
    for (const cleanup of footerCleanup) cleanup();
    for (const style of styles) style.remove();
    roots.clear();
    win.removeEventListener('unload',close);
  }
  win.addEventListener("focus",refreshMessageTags);
  win.addEventListener('unload',close,{once:true});
  return {close, refresh:refreshMessageTags};
}

/* The multi-message browser is created lazily and can navigate after attachment. */
function watchConversationBrowser(win, onDocument) {
  let browser = null, closed = false;
  function loaded() {
    if (closed || !browser) return;
    try { if (browser.contentDocument) onDocument(browser.contentDocument); } catch (_) {}
  }
  function bind() {
    if (closed) return;
    const current = win.document.getElementById('multiMessageBrowser');
    if (current === browser) return;
    browser?.removeEventListener('load',loaded,true);
    browser = current;
    browser?.addEventListener('load',loaded,true);
    loaded();
  }
  const observer = new win.MutationObserver(bind);
  observer.observe(win.document,{childList:true,subtree:true});
  bind();
  return {close() {
    closed = true; observer.disconnect();
    browser?.removeEventListener('load',loaded,true);
    browser = null;
  }};
}


// Thunderbird's own thread summary is used when the independent reader is off.
// Keep its message selection callback; extend only its hit area and tag styling.
function installNativeSummaryStyle(win, mail = MailServices) {
  const doc=win.document,originals=new Map();let closed=false;
  const style=doc.createElement('style');
  style.textContent=`
    #messageList > li { cursor:pointer; }
    #messageList .tags { display:inline-flex; align-items:center; gap:4px; }
    #messageList .tag { display:inline-flex; align-items:center; justify-content:center;
      box-sizing:border-box; font:400 12px/1.5 var(--gm-ui-font, Arial,sans-serif); border-radius:4px;
      padding:1px 5px; vertical-align:middle;
      background-color:var(--gm-summary-tag-bg) !important;
      color:var(--gm-summary-tag-fg) !important; }
  `;
  doc.head.append(style);
  function refresh() {
    if(closed)return;
    for(const [node,value] of originals)if(node.isConnected===false){originals.delete(node);}
    const tags=mail.tags.getAllTags();
    for(const node of doc.querySelectorAll('#messageList .tag')) {
      if(!originals.has(node))originals.set(node,node.getAttribute('style'));
      const tag=tags.find(tag=>tag.tag===node.dataset.tag);
      const colors=chipColors(tag?.color);
      if(node.style.getPropertyValue('--gm-summary-tag-bg')!==colors.background)
        node.style.setProperty('--gm-summary-tag-bg',colors.background);
      if(node.style.getPropertyValue('--gm-summary-tag-fg')!==colors.foreground)
        node.style.setProperty('--gm-summary-tag-fg',colors.foreground);
    }
  }
  function click(event) {
    if(closed || event.button!==0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey ||
       win.getSelection?.()?.isCollapsed===false ||
       event.target.closest('button,input,a,.link,.tag,.star,[role="button"]'))return;
    const row=event.target.closest('#messageList > li');
    const link=row?.querySelector('.subject.link.primary, .author.link.primary');
    if(!link)return;
    event.preventDefault();link.click();
  }
  doc.addEventListener('click',click);
  const observer=new win.MutationObserver(refresh);
  observer.observe(doc,{childList:true,subtree:true});refresh();
  return {refresh,close(){
    if(closed)return;closed=true;observer.disconnect();doc.removeEventListener('click',click);style.remove();
    for(const [node,value] of originals){if(value===null)node.removeAttribute('style');else node.setAttribute('style',value);}
    originals.clear();
  }};
}
