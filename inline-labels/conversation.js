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
function installConversationStyle(win, css, resolveTags = null) {
  const correctedLists = new Map();
  const messageChips = new Map();
  function renderMessageTags(list) {
    if (list.getAttribute("expanded") !== "true") return;
    const header = list.closest?.('.message')?.querySelector('.messageHeader.expanded .shrink-box');
    if (!header) return;
    const labels = conversationTitleLabels([list]);
    const signature = JSON.stringify(labels);
    const previous = messageChips.get(list);
    if (previous?.signature === signature && previous.node.parentNode === header) return;
    previous?.node.remove();
    const node = win.document.createElement('div');
    node.className = 'gm-message-tags';
    node.setAttribute('aria-label','Labels on this message');
    for (const tag of labels) {
      const chip = win.document.createElement('span');
      chip.textContent = tag.name;
      chip.title = tag.name;
      const colors = conversationTagColors(tag.color);
      chip.style.setProperty('--gm-tag-bg',colors.background);
      chip.style.setProperty('--gm-tag-fg',colors.foreground);
      const remove = win.document.createElement('button');
      remove.type = 'button';
      remove.className = 'gm-remove-message-tag';
      remove.title = `Remove ${tag.name} from this message`;
      remove.setAttribute('aria-label',remove.title);
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
    const labels = conversationTitleLabels(win.document.querySelectorAll('ul[is="message-tags"]'));
    const signature = JSON.stringify(labels.map(tag=>[tag.key,tag.name,tag.color]));
    if (signature === titleSignature) return;
    titleSignature = signature;
    titleChips?.remove();
    titleChips = win.document.createElement('div');
    titleChips.className = 'gm-title-tags';
    titleChips.setAttribute('aria-label','Labels in this conversation');
    for (const tag of labels) {
      const chip = win.document.createElement('span');
      chip.textContent = tag.name;
      chip.title = tag.name + ' — present in this conversation';
      const colors = conversationTagColors(tag.color);
      chip.style.setProperty('--gm-tag-bg',colors.background);
      chip.style.setProperty('--gm-tag-fg',colors.foreground);
      titleChips.append(chip);
    }
    titleRoot.append(titleChips);
  }
  const tags = new Map();
  const tagSelector = '.regular-tags > li[color], li[is="message-tag"][color]';
  function paintTag(tag) {
    if (!tag.getAttribute || !tag.style?.getPropertyValue) return;
    if (!tags.has(tag)) tags.set(tag, ['--gm-tag-bg','--gm-tag-fg'].map(name=>
      [name,tag.style.getPropertyValue(name),tag.style.getPropertyPriority(name)]));
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
        node.remove(); list.classList.remove('gm-tags-in-message-header');
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
    tags.clear();
    for (const [list,value] of correctedLists) {
      if (value === null) list.removeAttribute("tags"); else list.setAttribute("tags",value);
    }
    correctedLists.clear();
    for (const [list,{node}] of messageChips) {
      node.remove(); list.classList.remove("gm-tags-in-message-header");
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
  return {close};
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
