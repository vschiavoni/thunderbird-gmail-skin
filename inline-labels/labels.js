/* Read-only presentation of existing Thunderbird tags. No message-body reads,
 * writes, network requests, separate tag store, or tab/session modifications.
 */
function assignedTags(header, tags) {
  const keys = new Set((header.getStringProperty("keywords") || "").split(/\s+/));
  if (header.label) keys.add(`$label${header.label}`);
  return tags.filter(tag => keys.has(tag.key));
}

function chipColors(color) {
  if (!/^#[0-9a-f]{6}$/i.test(color || "")) return { background: "#e8eaed", foreground: "#3c4043" };
  const rgb = [1, 3, 5].map(start => parseInt(color.slice(start, start + 2), 16));
  // Pastel tint of the user's existing tag color, with dark readable text.
  const tint = rgb.map(value => Math.round(value * 0.3 + 255 * 0.7));
  return { background: `rgb(${tint.join(", ")})`, foreground: "#202124" };
}

function installInlineLabels(window = globalThis.window, MailServices = globalThis.MailServices) {
  const doc = window.document;
  let disposed = false;
  let prototype, original, wrapped;
  let tags = MailServices.tags.getAllTags();
  const style = doc.createElement("style");
  style.textContent = `
    /* Keep sender/subject headers visually empty; native controls remain. */
    :root #threadTree :is(#senderColButton, #subjectColButton) {
      font-size: 0 !important;
      text-shadow: none !important;
    }
    /* Hidden only while the add-on is active; native column settings survive. */
    #threadTree :is(#tagsCol, .tagscol-column) { display: none !important; }
    #threadTree .subject-line {
      display: flex !important; align-items: center; min-width: 0;
      flex: 1 1 auto; overflow: hidden; column-gap: 0 !important;
    }
    #threadTree .subject-line > span:not(.gm-inline-labels) {
      flex: 1 1 0; overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap; min-width: 32px;
    }
    #threadTree .subject-line > img { flex: 0 0 auto; }
    #threadTree .gm-inline-labels {
      display: inline-flex; flex: 0 1 auto; max-width: 48%; gap: 4px;
      overflow: hidden; margin-inline-end: 4px; align-items: center;
      font-weight: 400; vertical-align: middle;
    }
    #threadTree .gm-inline-label {
      display: inline-block; flex: 0 0 auto; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; max-width: 160px;
      font: 12px/16px Arial, sans-serif; border-radius: 4px; padding: 0 5px;
      background: var(--gm-chip-bg); color: var(--gm-chip-fg);
    }
    @media (prefers-color-scheme: dark) {
      #threadTree .gm-inline-label {
        background:color-mix(in srgb, var(--gm-chip-bg) 35%, #202124);
        color:#f1f3f4;
      }
    }
    @media (prefers-contrast) {
      #threadTree .gm-inline-label { background: Canvas; color: CanvasText; border: 1px solid CanvasText; }
    }
  `;
  doc.head.append(style);
  // userChrome.css is a USER sheet: its !important rules beat document styles.
  // Match that origin so the companion and installed column styles agree.
  const headerSheet = 'data:text/css;charset=utf-8,' + encodeURIComponent(`
    @-moz-document url("about:3pane") {
      :root #threadTree :is(#senderColButton, #subjectColButton) {
        font-size: 0 !important;
        text-shadow: none !important;
      }
    }
  `);
  const sheetUtils = window.windowUtils;
  if (sheetUtils) sheetUtils.loadSheetUsingURIString(headerSheet, Ci.nsIDOMWindowUtils.USER_SHEET);
  function render(row) {
    const line = row.querySelector(".subject-line");
    if (!line) return;
    // Recycled virtual rows must never keep the preceding message's tags.
    line.querySelector(".gm-inline-labels")?.remove();
    if ((row.dataset.properties || "").split(" ").includes("dummy")) return;
    let labels;
    try {
      const header = window.gDBView?.getMsgHdrAt(row.index);
      if (!header) return;
      labels = assignedTags(header, tags);
    } catch (_) { return; }
    if (!labels.length) return;
    const container = doc.createElement("span");
    container.className = "gm-inline-labels";
    container.setAttribute("aria-label", `Labels: ${labels.map(tag => tag.tag).join(", ")}`);
    container.title = labels.map(tag => tag.tag).join(", ");
    for (const tag of labels) {
      const chip = doc.createElement("span");
      chip.className = "gm-inline-label";
      chip.textContent = tag.tag;
      chip.title = tag.tag;
      const colors = chipColors(tag.color);
      chip.style.setProperty("--gm-chip-bg", colors.background);
      chip.style.setProperty("--gm-chip-fg", colors.foreground);
      container.append(chip);
    }
    // Keep the native subject span first for Thunderbird's fillRow querySelector.
    // Visually order chips before the native subject without replacing it.
    container.style.order = "-1";
    line.append(container);
  }
  const refresh = () => {
    tags = MailServices.tags.getAllTags();
    for (const row of doc.querySelectorAll("#threadTree tr.table-layout")) render(row);
  };
  window.customElements.whenDefined("thread-row").then(() => {
    if (disposed) return;
    prototype = window.customElements.get("thread-row").prototype;
    original = prototype.fillRow;
    wrapped = function (...args) {
      const result = original.apply(this, args);
      try { render(this); } catch (error) { console.error("Inline labels:", error); }
      return result;
    };
    prototype.fillRow = wrapped;
    refresh();
  });
  function close() {
    if (disposed) return;
    disposed = true;
    if (prototype?.fillRow === wrapped) prototype.fillRow = original;
    style.remove();
    if (sheetUtils) sheetUtils.removeSheetUsingURIString(headerSheet, Ci.nsIDOMWindowUtils.USER_SHEET);
    for (const node of doc.querySelectorAll(".gm-inline-labels")) node.remove();
    window.removeEventListener("unload", close);
  }
  window.addEventListener("unload", close, { once: true });
  return { refresh, close };
}
