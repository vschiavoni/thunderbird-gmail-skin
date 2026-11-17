{
  const panel = document.getElementById('sidebar-settings');
  const options = document.getElementById('sidebar-options');
  const order = document.getElementById('sidebar-mode-order');
  const status = document.getElementById('sidebar-options-status');
  let busy = false;
  async function update(action = '', enabled = false) {
    if (busy) return;
    busy = true;
    try {
      const state = JSON.parse(await browser.inlineLabels.folderPaneSettings(action, enabled));
      options.replaceChildren(); order.replaceChildren();
      for (const item of state.options) {
        const row = document.createElement('label'); row.className = 'setting-row';
        const text = document.createElement('span'); text.textContent = item.label;
        const input = document.createElement('input'); input.type = 'checkbox';
        input.checked = item.checked; input.disabled = item.disabled;
        input.addEventListener('change', () => update(item.id, input.checked));
        row.append(text, input); options.append(row);
      }
      state.modes.forEach((mode, index) => {
        const row = document.createElement('div'); row.className = 'setting-row';
        const label = state.options.find(item => mode === 'gmSnoozed' ? item.id === 'gm-snoozed-folder-mode' : item.id.toLowerCase().includes(mode === 'smart' ? 'unified' : mode));
        const text = document.createElement('span'); text.textContent = label?.label || mode;
        row.append(text);
        for (const [direction, caption, disabled] of [['up', '↑', index === 0], ['down', '↓', index === state.modes.length - 1]]) {
          const button = document.createElement('button'); button.type = 'button'; button.textContent = caption;
          button.setAttribute('aria-label', `${direction === 'up' ? 'Move up' : 'Move down'}: ${text.textContent}`);
          button.disabled = disabled; button.addEventListener('click', () => update(`${direction}:${mode}`)); row.append(button);
        }
        order.append(row);
      });
      status.textContent = '';
    } catch (error) { status.textContent = error.message; }
    finally { busy = false; }
  }
  panel.addEventListener('toggle', () => { if (panel.open) update(); });
}
