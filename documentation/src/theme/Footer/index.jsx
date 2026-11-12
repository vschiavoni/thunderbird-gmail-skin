import React from 'react';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import styles from './styles.module.css';

export default function Footer() {
  return <footer className={styles.footer} aria-label="Documentation footer">
    <div className={styles.inner}>
      <div className={styles.main}>
        <div className={styles.identity}>
          <Link className={styles.brand} to="/" aria-label="Thunder-G home"><img src={useBaseUrl('/img/logo.png')} alt="" width="44" height="44"/><span>Thunder-G<span className={styles.dot}>.</span></span></Link>
          <p>Guides, settings and source code.</p>
          <Link className={styles.download} to="https://github.com/vschiavoni/thunderbird-gmail-skin/releases/latest">Download the add-on</Link>
        </div>
        <nav aria-label="Documentation resources"><h2>Documentation</h2><Link to="/guides/getting-started">Getting started</Link><Link to="/docs/settings">Settings</Link><Link to="/docs/keyboard-shortcuts">Keyboard shortcuts</Link><Link to="/guides/privacy">Privacy & local data</Link></nav>
        <nav aria-label="Project resources"><h2>Project</h2><Link to="https://github.com/vschiavoni/thunderbird-gmail-skin">Source on GitHub</Link><Link to="https://github.com/vschiavoni/thunderbird-gmail-skin/issues">Report an issue</Link><Link to="/CHANGELOG">Changelog</Link><Link to="/guides/contributing">Contributing</Link></nav>
      </div>
      <div className={styles.bottom}><span>Independent. Open source.</span><span>Gmail is a trademark of Google LLC. No affiliation with Google.</span></div>
    </div>
  </footer>;
}
