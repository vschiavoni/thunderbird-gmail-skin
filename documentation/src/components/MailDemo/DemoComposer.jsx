import React, {useEffect, useRef, useState} from 'react';
import DemoIcon from './DemoIcon';
import styles from './styles.module.css';

// Browser-only simulation of compose.js: no native composer or transport is used.
export default function DemoComposer({draft, onChange, onSave, onClose, onDiscard, onSend}) {
  const editor = useRef(null);
  const files = useRef(null);
  const initialHTML = useRef(draft.html || '');
  const [formatting, setFormatting] = useState(true);
  const [extraRecipients, setExtraRecipients] = useState({cc: !!draft.cc, bcc: !!draft.bcc});
  const inline = draft.presentation === 'inline';
  const minimized = draft.minimized;
  useEffect(() => { if (!minimized) editor.current?.focus({preventScroll: true}); }, [minimized]);
  function syncEditor() {
    onChange({body: editor.current.innerText, html: editor.current.innerHTML});
  }
  function format(command, value) {
    editor.current.focus();
    editor.current.ownerDocument.execCommand(command, false, value);
    syncEditor();
  }
  function control(name, label, handler) {
    return <button type="button" title={label} aria-label={label} onClick={handler}><DemoIcon name={name}/></button>;
  }
  const title = draft.replyTo ? `${draft.replyAll ? 'Reply all' : 'Reply'} · ${draft.subject.replace(/^Re: /, '')}` : 'New Message';
  return <form className={`${styles.composer} ${inline ? styles.inlineComposer : draft.presentation === 'full' ? styles.fullComposer : styles.floatingComposer} ${minimized ? styles.minimizedComposer : ''}`}
    aria-label={draft.replyTo ? 'Reply in this window' : 'New message in this window'}
    onSubmit={event => { event.preventDefault(); onSend(); }}
    onKeyDown={event => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        if (event.currentTarget.reportValidity()) onSend();
      } else if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
        event.preventDefault(); editor.current?.focus();
      }
    }}>
    <header className={styles.composeHeader}>
      <strong>{title}</strong><span className={styles.draftStatus} role="status">{draft.saved ? '✓ Saved' : draft.dirty ? 'Unsaved changes' : 'Not saved'}</span>
      {control('minimize', minimized ? 'Restore composer' : 'Minimize', () => onChange({minimized: !minimized, presentation: 'floating'}))}
      {control('save', 'Save draft', onSave)}
      {control(inline ? 'detach' : 'expand', inline ? 'Detach reply' : draft.replyTo ? 'Return to conversation' : draft.presentation === 'full' ? 'Detach message' : 'Expand in this window', () => onChange({minimized: false, presentation: draft.replyTo ? inline ? 'floating' : 'inline' : draft.presentation === 'full' ? 'floating' : 'full'}))}
      {control('close', draft.replyTo ? 'Close reply' : 'Close message', onClose)}
    </header>
    <div className={styles.composeContents} hidden={minimized}>
      <div className={styles.composeFields}>
        <div className={styles.fromRow}><span>From</span><span>Demo account &lt;you@example.invalid&gt;</span><DemoIcon name="chevron"/></div>
        <div className={styles.recipientRow}><label>To<input aria-label="To" type="email" required value={draft.to} placeholder="Recipients" onChange={event => onChange({to: event.target.value})}/></label><div className={styles.recipientToggles}>{['cc', 'bcc'].map(name => !extraRecipients[name] && <button type="button" key={name} onClick={() => setExtraRecipients({...extraRecipients, [name]: true})}>{name === 'cc' ? 'Cc' : 'Bcc'}</button>)}</div></div>
        {['cc', 'bcc'].map(name => extraRecipients[name] && <label className={styles.extraRecipient} key={name}>{name === 'cc' ? 'Cc' : 'Bcc'}<input type="email" aria-label={name === 'cc' ? 'Cc' : 'Bcc'} value={draft[name] || ''} onChange={event => onChange({[name]: event.target.value})}/></label>)}
        <input className={styles.subjectInput} aria-label="Subject" placeholder="Subject" value={draft.subject} onChange={event => onChange({subject: event.target.value})}/>
      </div>
      <div ref={editor} className={styles.composeEditor} role="textbox" aria-label="Message body" aria-multiline="true" contentEditable suppressContentEditableWarning data-placeholder="Write your message…"
        dangerouslySetInnerHTML={{__html: initialHTML.current}} onInput={syncEditor}
        onPaste={event => { event.preventDefault(); editor.current.ownerDocument.execCommand('insertText', false, event.clipboardData.getData('text/plain')); syncEditor(); }}
        onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const dropped = Array.from(event.dataTransfer.files, file => file.name); if (dropped.length) onChange({attachments: [...draft.attachments, ...dropped]}); else { editor.current.ownerDocument.execCommand('insertText', false, event.dataTransfer.getData('text/plain')); syncEditor(); } }}/>

      {!!draft.attachments.length && <div className={styles.composeAttachments}>{draft.attachments.map((file, index) => <span key={`${file}-${index}`}><DemoIcon name="attachment"/>{file}<button type="button" aria-label={`Remove attachment ${file}`} onClick={() => onChange({attachments: draft.attachments.filter((_, i) => i !== index)})}>×</button></span>)}</div>}
      {formatting && <div className={styles.formatBar} role="toolbar" aria-label="Formatting options">
        <select aria-label="Font" defaultValue="Arial" onChange={event => format('fontName', event.target.value)}>{['Arial', 'Georgia', 'Courier New'].map(font => <option key={font}>{font}</option>)}</select>
        <select aria-label="Text size" defaultValue="3" onChange={event => format('fontSize', event.target.value)}><option value="2">Small</option><option value="3">Normal</option><option value="5">Large</option></select>
        {[['bold', 'Bold', 'B'], ['italic', 'Italic', 'I'], ['underline', 'Underline', 'U'], ['insertUnorderedList', 'Bulleted list', '☷'], ['undo', 'Undo typing', '↶'], ['redo', 'Redo typing', '↷']].map(([command, label, text]) => <button type="button" key={command} title={label} aria-label={label} onMouseDown={event => event.preventDefault()} onClick={() => format(command)} className={styles[command]}>{text}</button>)}
      </div>}
      <footer className={styles.composeFooter}>
        <button className={styles.sendButton} type="submit" disabled={!draft.to.trim()}><DemoIcon name="Sent"/>Send</button>
        <button type="button" aria-label="Formatting options" title="Formatting options" aria-pressed={formatting} onClick={() => setFormatting(!formatting)}><span className={styles.formatIcon}>A</span></button>
        {control('attachment', 'Attach files', () => files.current.click())}
        <input ref={files} type="file" multiple hidden onChange={event => { onChange({attachments: [...draft.attachments, ...Array.from(event.target.files, file => file.name)]}); event.target.value = ''; }}/>
        <span className={styles.composeSafety}>Demo only · no email is sent</span>
        {control('Trash', 'Discard draft', onDiscard)}
      </footer>
    </div>
  </form>;
}
