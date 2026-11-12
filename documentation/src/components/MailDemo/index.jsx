import React, { useEffect, useRef, useState } from 'react';
import defaultLogo from './assets/logo.png';
import { initialMail, LABELS, LABEL_COLORS, searchMail } from './model';
import styles from './styles.module.css';
import DemoIcon from './DemoIcon';
import DemoComposer from './DemoComposer';


function labelStyle(label) {
  const palette = LABEL_COLORS[label] || LABEL_COLORS.Projects;
  return {'--label-color': palette.color, '--label-background': palette.background, '--label-dark-color': palette.darkColor, '--label-dark-background': palette.darkBackground, '--label-icon': palette.base};
}

export default function MailDemo({
  standalone = false,
  logoSrc = defaultLogo,
  theme = 'auto',
  className = ''
}) {
  const [themeOverride, setThemeOverride] = useState(null);
  const [resolvedTheme, setResolvedTheme] = useState('light');
  const [items, setItems] = useState(initialMail);
  const [folder, setFolder] = useState('Inbox');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [menu, setMenu] = useState(null);
  const [compose, setCompose] = useState(null);
  const [notice, setNotice] = useState('');
  const [help, setHelp] = useState(false);
  const [checked, setChecked] = useState([]);
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const demoRoot = useRef(null);
  const labelMenu = useRef(null);
  const snoozeMenu = useRef(null);
  const moveMenu = useRef(null);
  const selectionMenu = useRef(null);
  const selectAll = useRef(null);
  const [labelQuery, setLabelQuery] = useState('');
  useEffect(() => {
    const doc = demoRoot.current?.ownerDocument;
    const win = doc?.defaultView;
    if (!win) return;
    const media = win.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      const requested = themeOverride || theme;
      const host = doc.documentElement.getAttribute('data-theme');
      setResolvedTheme(requested === 'dark' || requested === 'light' ? requested : host === 'dark' || host === 'light' ? host : media.matches ? 'dark' : 'light');
    };
    sync();
    const observer = new win.MutationObserver(sync);
    observer.observe(doc.documentElement, {attributes: true, attributeFilter: ['data-theme']});
    media.addEventListener('change', sync);
    return () => {observer.disconnect(); media.removeEventListener('change', sync);};
  }, [theme, themeOverride]);
  useEffect(() => {
    if (!menu) return;
    const doc = demoRoot.current?.ownerDocument;
    if (!doc) return;
    function dismissOutside(event) {
      const active = {snooze: snoozeMenu, labels: labelMenu, move: moveMenu, selection: selectionMenu}[menu]?.current;
      if (!active?.contains(event.target)) setMenu(null);
    }
    doc.addEventListener('pointerdown', dismissOutside, true);
    doc.addEventListener('click', dismissOutside, true);
    return () => {
      doc.removeEventListener('pointerdown', dismissOutside, true);
      doc.removeEventListener('click', dismissOutside, true);
    };
  }, [menu]);
  useEffect(() => { if (selected) demoRoot.current?.focus({preventScroll:true}); }, [selected]);
  const search = useRef(null);
  const current = items.find(item => item.id === selected);
  const rows = searchMail(items, folder, query);
  const selectedRows = rows.filter(item => checked.includes(item.id));
  const targets = current ? [current] : selectedRows;
  const ids = targets.map(item => item.id);
  const logo = logoSrc;
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;
  const someSelected = selectedRows.length > 0 && !allSelected;
  useEffect(() => { if (selectAll.current) selectAll.current.indeterminate = someSelected; }, [someSelected, allSelected, current]);
  function update(id, changes) {
    setItems(previous => previous.map(item => item.id === id ? {...item, ...changes} : item));
  }
  function navigate(next) {
    if (compose?.presentation === 'inline') changeCompose({presentation: 'floating'});
    setChecked([]); setFolder(next); setQuery(''); setSelected(null); setMenu(null); setHelp(false);
  }
  function move(next) {
    if (!ids.length) return;
    setItems(previous => previous.map(item => ids.includes(item.id) ? {...item, folder: next, snoozeUntil: null} : item));
    setSelected(null); setChecked([]); setMenu(null);
    setNotice(`${ids.length === 1 ? 'Conversation' : `${ids.length} conversations`} moved to ${next}.`);
  }
  function openMail(item) {
    if (item.draft) { openComposer(null, {...item.draft, minimized: false, presentation: 'floating'}); return; }
    setChecked([]); setSelected(item.id); update(item.id, {unread: false}); setMenu(null);
  }
  function toggleRead() {
    const unread = !targets.some(item => item.unread);
    setItems(previous => previous.map(item => ids.includes(item.id) ? {...item, unread} : item));
    setSelected(null); setChecked([]); setMenu(null); setNotice(unread ? 'Marked as unread.' : 'Marked as read.');
  }
  function toggleLabel(label) {
    const remove = targets.every(item => item.labels.includes(label));
    setItems(previous => previous.map(item => ids.includes(item.id) ? {...item, labels: remove ? item.labels.filter(value => value !== label) : Array.from(new Set([...item.labels, label]))} : item));
  }
  function snooze(milliseconds) {
    setItems(previous => previous.map(item => ids.includes(item.id) ? {...item, folder: 'Snoozed', snoozeUntil: Date.now() + milliseconds} : item));
    setSelected(null); setChecked([]); setMenu(null);
    setNotice(milliseconds === 30000 ? 'Snoozed for 30 seconds. It will return to Inbox while this page is open.' : 'Snoozed until tomorrow.');
  }
  function selectMode(mode) {
    setChecked(rows.filter(item => mode === 'all' || mode === 'read' && !item.unread || mode === 'unread' && item.unread || mode === 'starred' && item.starred || mode === 'unstarred' && !item.starred).map(item => item.id));
    setMenu(null);
  }
  function openComposer(reply = null, saved = null, replyAll = false) {
    if (compose) { setNotice('A draft is already open. Close or discard it before starting another.'); return; }
    setCompose(saved || {id: `draft-${Date.now()}`, to: reply?.address || '', subject: reply ? `Re: ${reply.subject}` : '', body: '', html: '', attachments: [], replyTo: reply?.id, replyAll, presentation: reply ? 'inline' : 'floating', minimized: false, saved: false});
  }
  function changeCompose(changes) {
    const contentChanged = ['to', 'cc', 'bcc', 'subject', 'body', 'html', 'attachments'].some(key => key in changes);
    setCompose(previous => ({...previous, ...changes, ...(contentChanged ? {saved: false, dirty: true} : {})}));
  }
  function saveDraft(draft = compose) {
    if (!draft) return;
    if (!draft.body.trim() && !draft.attachments.length) { setItems(previous => previous.filter(item => item.id !== draft.id)); return; }
    const record = {id: draft.id, sender: 'You', address: draft.to || 'you@example.invalid', subject: draft.subject || '(No subject)', labels: [], starred: false, unread: false, folder: 'Drafts', attachments: draft.attachments, date: 'Now', messages: [{sender: 'You', date: 'Just now', body: draft.body}], draft: {...draft, saved: true}};
    setItems(previous => [record, ...previous.filter(item => item.id !== draft.id)]);
    setCompose(previous => previous?.id === draft.id ? {...previous, saved: true} : previous);
  }
  useEffect(() => {
    if (!compose || compose.saved || (!compose.body.trim() && !compose.attachments.length)) return;
    const timer = setTimeout(() => saveDraft(compose), 1500);
    return () => clearTimeout(timer);
  }, [compose?.to, compose?.cc, compose?.bcc, compose?.subject, compose?.body, compose?.html, compose?.attachments, compose?.saved, compose?.id]);
  function closeComposer() { saveDraft(); setCompose(null); setNotice('Composer closed. Written drafts stay in the demo Drafts folder until reload.'); }
  function discardComposer() { setItems(previous => previous.filter(item => item.id !== compose.id)); setCompose(null); setNotice('Demo draft discarded.'); }
  function actionButton(name, label, handler) {
    return <button type="button" aria-label={label} title={label} onClick={handler}><DemoIcon name={name}/></button>;
  }
  function renderActions() {
    const readLabel = targets.some(item => item.unread) ? 'Mark as read' : 'Mark as unread';
    return <>
      <span className={styles.actionSeparator} role="separator"/>
      {actionButton('Archive', 'Archive', () => move('Archive'))}
      {actionButton('Spam', 'Mark as spam', () => move('Spam'))}
      {actionButton('Trash', 'Delete', () => move('Trash'))}
      <span className={styles.actionSeparator} role="separator"/>
      {actionButton('unread', readLabel, toggleRead)}
      <div className={styles.menuWrap} ref={snoozeMenu}>{actionButton('Snoozed', 'Snooze until…', () => setMenu(menu === 'snooze' ? null : 'snooze'))}{menu === 'snooze' && <div className={styles.menu}><strong>Snooze until…</strong><button type="button" onClick={() => snooze(30000)}>In 30 seconds (demo)</button><button type="button" onClick={() => snooze(86400000)}>Tomorrow</button></div>}</div>
      <span className={styles.actionSeparator} role="separator"/>
      <div className={styles.menuWrap} ref={moveMenu}>{actionButton('move', 'Move to…', () => setMenu(menu === 'move' ? null : 'move'))}{menu === 'move' && <div className={styles.menu}><strong>Move to</strong>{['Inbox', 'Archive', 'Spam', 'Trash'].map(name => <button type="button" key={name} onClick={() => move(name)}><DemoIcon name={name}/>{name === 'Archive' ? 'Archives' : name}</button>)}</div>}</div>
      <div className={styles.menuWrap} ref={labelMenu}>{actionButton('label', 'Label as', () => { setLabelQuery(''); setMenu(menu === 'labels' ? null : 'labels'); })}{menu === 'labels' && <fieldset className={styles.menu}><legend>Label as</legend><input type="search" aria-label="Search labels" placeholder="Search labels" value={labelQuery} onChange={event => setLabelQuery(event.target.value)}/>{LABELS.filter(label => label.toLowerCase().includes(labelQuery.toLowerCase())).map(label => { const count = targets.filter(item => item.labels.includes(label)).length; return <label key={label}><input type="checkbox" checked={count === targets.length} ref={node => { if (node) node.indeterminate = count > 0 && count < targets.length; }} onChange={() => toggleLabel(label)}/><span style={labelStyle(label)} className={styles.labelIcon}><DemoIcon name="label"/></span>{label}</label>; })}<button type="button" onClick={() => setMenu(null)}>Done</button></fieldset>}</div>
      <button type="button" disabled aria-label="More options (not available yet)" title="More options (not available yet)"><DemoIcon name="more"/></button>
    </>;
  }
  function renderComposer() {
    return <DemoComposer key={compose.id} draft={compose} onChange={changeCompose} onSave={() => saveDraft()} onClose={closeComposer} onDiscard={discardComposer} onSend={send}/>;
  }
  function reset() {
    setItems(initialMail());
    navigate('Inbox');
    setCompose(null);
    setNotice('Demo reset.');
  }
  useEffect(() => {
    const timer = setInterval(() => setItems(previous => {
      const due = previous.some(item => item.folder === 'Snoozed' && item.snoozeUntil <= Date.now());
      return due ? previous.map(item => item.folder === 'Snoozed' && item.snoozeUntil <= Date.now() ? {
        ...item,
        folder: 'Inbox',
        snoozeUntil: null
      } : item) : previous;
    }), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  function keydown(event) {
    if (event.defaultPrevented || event.repeat || event.isComposing || event.nativeEvent?.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (menu) { setMenu(null); return; }
      if (help) { setHelp(false); return; }
      if (compose) closeComposer(); else setSelected(null);
      return;
    }
    if (event.target.closest('input:not([type=checkbox]):not([type=radio]),textarea,select,[contenteditable]:not([contenteditable=false]),[role=textbox]') || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === '/') {
      event.preventDefault();
      search.current?.focus();
    } else if (key === 'c') {
      event.preventDefault();
      openComposer();
    } else if (key === '?') {
      event.preventDefault();
      setHelp(value => !value);
    } else if (['l', 's', 'b', 'e'].includes(key)) {
      event.preventDefault();
      setHelp(false);
      if (!targets.length) {
        setNotice('Select a conversation or open it first to use this shortcut.');
        return;
      }
      if (key === 'l') { setLabelQuery(''); setMenu('labels'); }
      else if (key === 'b') setMenu('snooze');
      else if (key === 'e') move('Archive');
      else {
        const starred = !targets.every(item => item.starred);
        setItems(previous => previous.map(item => ids.includes(item.id) ? {...item, starred} : item));
        setNotice(starred ? 'Selected conversations starred.' : 'Selected conversations unstarred.');
      }
    }
  }

  function send() {
    if (!compose.body.trim()) { setNotice('Write a message before sending in the demo.'); return; }
    const draft = compose, id = `sent-${Date.now()}`;
    setItems(previous => previous.filter(item => item.id !== draft.id));
    if (draft.replyTo) {
      setItems(previous => previous.map(item => item.id === draft.replyTo ? {
        ...item,
        messages: [...item.messages, {
          sender: 'You',
          date: 'Just now',
          body: draft.body,
          attachments: draft.attachments
        }]
      } : item));
    } else {
      setItems(previous => [{
        id,
        sender: 'You',
        address: 'you@example.invalid',
        subject: draft.subject,
        labels: [],
        starred: false,
        unread: false,
        folder: 'Sent',
        attachments: draft.attachments,
        date: 'Now',
        messages: [{
          sender: 'You',
          date: 'Just now',
          body: draft.body,
          attachments: draft.attachments
        }]
      }, ...previous]);
      navigate('Sent');
      setSelected(id);
    }
    setCompose(null);
    setNotice('Saved in the demo. No email was sent.');
  }
  return <section className={`${styles.demo} ${standalone ? styles.standalone : ''} ${className}`} aria-label="Thunder-G browser demo" data-demo-theme={themeOverride || theme} ref={demoRoot} tabIndex={0} onKeyDown={keydown}>
    <div className={styles.top}><div className={styles.brand}><span className={styles.hamburger}><DemoIcon name="menu"/></span><img src={logo} alt="" /><strong>Thunder-G</strong><span>demo</span></div><label className={styles.search}><span aria-hidden="true"><DemoIcon name="search"/></span><input ref={search} aria-label="Search demo mail" placeholder="Search demo mail" value={query} onChange={event => {
          setQuery(event.target.value);
          setChecked([]); setMenu(null); setSelected(null);
        }} /><kbd>/</kbd></label><button type="button" className={styles.themeToggle} aria-label={`Switch demo to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch demo to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`} onClick={() => setThemeOverride(resolvedTheme === 'dark' ? 'light' : 'dark')}><DemoIcon name={resolvedTheme === 'dark' ? 'sun' : 'moon'}/></button><button type="button" className={styles.reset} onClick={reset}>Reset demo</button></div>
    <div className={styles.body}>
      <aside className={styles.sidebar}><button type="button" className={styles.composeButton} onClick={() => openComposer()}><DemoIcon name="compose"/> Compose</button>
        <p className={styles.folderHeading}>Unified Folders <span>⋮</span></p>
        <nav aria-label="Demo folders">{['Inbox', 'Snoozed', 'Drafts', 'Sent', 'Archive', 'Starred', 'Spam', 'Trash'].map(name => <React.Fragment key={name}><button type="button" onClick={() => navigate(name)} aria-current={folder === name ? 'page' : undefined} className={folder === name ? styles.active : ''}><DemoIcon name={name}/>{name === 'Archive' ? 'Archives' : name}<small>{items.filter(item => name === 'Starred' ? item.starred : item.folder === name).length || ''}</small></button>{name === 'Inbox' && <button type="button" className={styles.account} onClick={()=>navigate('Inbox')}><DemoIcon name="Inbox"/><span className={styles.accountMarker}/>Demo account<small>{items.filter(item=>item.folder==='Inbox').length}</small></button>}</React.Fragment>)}</nav>
        <p className={styles.labelHeading}>Labels</p>{LABELS.filter(label=>projectsExpanded || !label.includes('/')).map(label=><div className={`${styles.labelEntry} ${label.includes('/')?styles.nestedLabel:''}`} key={label}>{label==='Projects'&&<button type="button" className={styles.disclosure} aria-label="Expand Projects labels" aria-expanded={projectsExpanded} onClick={()=>setProjectsExpanded(value=>!value)}>{projectsExpanded?'⌄':'›'}</button>}<button type="button" className={`${styles.labelNav} ${folder===label?styles.active:''}`} onClick={()=>navigate(label)} aria-current={folder===label?'page':undefined}><span className={styles.labelIcon} style={labelStyle(label)}><DemoIcon name="label"/></span>{label.split('/').pop()}</button></div>)}<button type="button" className={styles.helpButton} onClick={() => { setHelp(value => !value); demoRoot.current?.focus({preventScroll:true}); }}>Keyboard shortcuts</button>
      </aside>
      <div className={styles.workspace}>
        {help && <div className={styles.help}><strong>Demo shortcuts</strong><p>Click inside the demo first. Labels, star, snooze and archive apply to selected or open conversations. Shortcuts pause while typing.</p><p><kbd>/</kbd> Search · <kbd>c</kbd> Compose · <kbd>l</kbd> Labels · <kbd>s</kbd> Star · <kbd>b</kbd> Snooze · <kbd>e</kbd> Archive · <kbd>?</kbd> Help · <kbd>Esc</kbd> Back / close</p><button type="button" onClick={() => setHelp(false)}>Close shortcuts</button></div>}
        {current ? <>
          <div className={styles.toolbar} role="toolbar" aria-label="Conversation actions">{actionButton('back', 'Back to message list', () => { setSelected(null); setMenu(null); })}{renderActions()}</div>
          <article className={styles.conversation}><div className={styles.subjectLine}><div className={styles.conversationHeading}><h3>{current.subject}</h3><div className={styles.tags}><span className={styles.folderChip}>{current.folder}</span>{current.labels.map(label => <button type="button" key={label} className={styles.chip} style={labelStyle(label)} aria-label={`Show mail labeled ${label}`} onClick={() => navigate(label)}>{label}</button>)}{current.folder === 'Snoozed' && <span className={styles.snoozeNotice}>Snoozed until {new Date(current.snoozeUntil).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                })}</span>}</div></div><button type="button" aria-label={current.starred ? 'Unstar conversation' : 'Star conversation'} aria-pressed={current.starred} onClick={() => update(current.id, {
                starred: !current.starred
              })} className={styles.star}>{current.starred ? '★' : '☆'}</button></div><p className={styles.messageCount}>{current.messages.length} messages</p>{current.messages.map((message, index) => <details key={`${current.id}-${index}`} className={styles.message} open={index === current.messages.length - 1}><summary><span className={styles.avatar}>{message.sender.split(' ').map(word=>word[0]).join('').slice(0,2)}</span><strong>{message.sender}</strong><span className={styles.messageSnippet}>{message.body}</span><time>{message.date}</time></summary><div className={styles.messageAddress}>{message.sender === 'You' ? 'you@example.invalid' : current.address}<div>To: Demo account &lt;you@example.invalid&gt;</div></div><p>{message.body}</p>{(message.attachments || (index === 0 ? current.attachments : [])).length > 0 && <div className={styles.attachments}>{(message.attachments || current.attachments).map(file => <span key={file}><DemoIcon name="attachment"/> {file} <small>sample attachment</small></span>)}</div>}</details>)}{compose?.replyTo === current.id && compose.presentation === 'inline' ? renderComposer() : <div className={styles.replyActions}><button type="button" className={styles.reply} onClick={() => openComposer(current)}><DemoIcon name="reply"/>Reply</button><button type="button" className={styles.reply} onClick={() => openComposer(current, null, true)}><DemoIcon name="reply"/>Reply all</button></div>}</article>
        </> : <>
          <div className={styles.toolbar} role="toolbar" aria-label="Message list actions"><div className={styles.selectionGroup} ref={selectionMenu}><input ref={selectAll} type="checkbox" aria-label="Select all visible conversations" checked={allSelected} onChange={() => setChecked(selectedRows.length ? [] : rows.map(item => item.id))}/><button type="button" aria-label="Select messages" title="Select messages" aria-expanded={menu === 'selection'} onClick={() => setMenu(menu === 'selection' ? null : 'selection')}><DemoIcon name="chevron"/></button>{menu === 'selection' && <div className={styles.menu} role="menu" aria-label="Select messages">{['All', 'None', 'Read', 'Unread', 'Starred', 'Unstarred'].map(mode => <button type="button" role="menuitem" key={mode} onClick={() => selectMode(mode.toLowerCase())}>{mode}</button>)}</div>}</div>{selectedRows.length ? renderActions() : <>{actionButton('refresh', 'Refresh', () => setNotice('Sample mail is up to date.'))}<button type="button" disabled aria-label="More options (not available yet)"><DemoIcon name="more"/></button></>}<span className={styles.selectionCount}>{selectedRows.length ? `${selectedRows.length} selected` : `${rows.length} conversation${rows.length === 1 ? '' : 's'}`}</span></div>
          <div className={styles.list}>{rows.map(item => <div key={item.id} className={`${styles.row} ${item.unread ? styles.unread : ''} ${checked.includes(item.id)?styles.selectedRow:''}`}><input type="checkbox" aria-label={`Select ${item.subject}`} checked={checked.includes(item.id)} onChange={event=>setChecked(previous=>event.target.checked?[...previous,item.id]:previous.filter(id=>id!==item.id))}/><button type="button" className={styles.star} aria-label={`${item.starred ? 'Unstar' : 'Star'} ${item.subject}`} aria-pressed={item.starred} onClick={() => update(item.id, {
                starred: !item.starred
              })}>{item.starred ? '★' : '☆'}</button><div className={styles.openMessage}><button type="button" className={styles.sender} aria-label={`Open conversation from ${item.sender}: ${item.subject}`} onClick={() => openMail(item)}>{item.sender}{item.messages.length > 1 && <small>{item.messages.length}</small>}</button><span className={styles.rowContent}><span className={styles.tags}>{item.labels.map(label => <button type="button" key={label} className={styles.chip} style={labelStyle(label)} aria-label={`Show mail labeled ${label}`} onClick={() => navigate(label)}>{label}</button>)}</span><button type="button" className={styles.rowSubject} onClick={() => openMail(item)}>{item.subject}</button><span className={styles.snippet}>— {item.messages[item.messages.length-1].body}</span></span><span className={styles.time}>{item.attachments.length > 0 && <span className={styles.attachmentIndicator} role="img" aria-label="Has attachments" title="Has attachments"><DemoIcon name="attachment"/></span>}{item.date}</span></div></div>)}{!rows.length && <div className={styles.empty}><strong>{query ? 'No matching mail' : `No conversations in ${folder}`}</strong><p>{query ? 'Try a name, subject, label:Projects or has:attachment.' : 'Move a conversation here or reset the demo to start again.'}</p>{query && <button type="button" onClick={() => setQuery('')}>Clear search</button>}</div>}</div>
          <p className={styles.hint}>Open a conversation to try labels, replies and snooze.</p>
        </>}
      </div>
    </div>
    {compose && (compose.presentation !== 'inline' || selected !== compose.replyTo) && <div className={compose.presentation === 'full' ? styles.composerBackdrop : styles.composerLayer}>{renderComposer()}</div>}
    <div className={styles.status} role="status" aria-live="polite">{notice || 'Sample mail only. No accounts are connected. Changes reset when you reload.'}</div>
  </section>;
}
