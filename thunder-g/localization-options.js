/* Translate before starting settings handlers, so confirmations and import
 * statuses use the same language as the page from the first render. */
(async () => {
  try { await ThunderGI18n.ready; } catch (error) { console.error('Thunder-G translations:', error); }
  gmLocalizeDocument(document);
  for (const name of ['options.js', 'gmail-import-options.js', 'label-backup-options.js']) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = browser.runtime.getURL(name);
      script.onload = resolve;
      script.onerror = reject;
      document.body.append(script);
    });
  }
})();
