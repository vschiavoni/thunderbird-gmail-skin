// Google Material Icons: mark_email_unread (outlined), Apache-2.0.
// See icons/LICENSE-material-icons.txt.
const MATERIAL_MARK_EMAIL_UNREAD = 'M22,8.98V18c0,1.1-0.9,2-2,2H4c-1.1,0-2-0.9-2-2L2.01,6C2.01,4.9,2.9,4,4,4h10.1C14.04,4.32,14,4.66,14,5s0.04,0.68,0.1,1 H4l8,5l3.67-2.29c0.47,0.43,1.02,0.76,1.63,0.98L12,13L4,8v10h16V9.9C20.74,9.75,21.42,9.42,22,8.98z M16,5c0,1.66,1.34,3,3,3 s3-1.34,3-3s-1.34-3-3-3S16,3.34,16,5z';
/* Read-only presentation of existing Thunderbird tags. No message-body reads,
 * writes, network requests, separate tag store, or tab/session modifications.
 */
function assignedTags(header, tags) {
  const keys = new Set((header.getStringProperty("keywords") || "").split(/\s+/));
  if (header.label) keys.add(`$label${header.label}`);
  return tags.filter(tag => keys.has(tag.key));
}

function chipColors(color) {
  const valid = /^#[0-9a-f]{6}$/i.test(color || "");
  const rgb = valid ? [1, 3, 5].map(start => parseInt(color.slice(start, start + 2), 16)) : [128,134,139];
  const mix = (base, weight) => `rgb(${rgb.map((value,index) => Math.round(value * weight + base[index] * (1-weight))).join(', ')})`;
  // Related hues for background and text, with a distinct palette per theme.
  return {
    background: `light-dark(${mix([255,255,255],.2)}, ${mix([32,33,36],.28)})`,
    foreground: `light-dark(${mix([0,0,0],.4)}, ${mix([255,255,255],.25)})`
  };
}

function installInlineLabels(window = globalThis.window, MailServices = globalThis.MailServices, labelPrefs = null) {
  const doc = window.document;
  let disposed = false;
  let prototype, original, wrapped;
  let tags = MailServices.tags.getAllTags();
  const rendered = new WeakMap();
  const style = doc.createElement("style");
  style.textContent = `
    /* Keep sender/subject headers visually empty; native controls remain. */
    :root #threadTree :is(#senderColButton, #subjectColButton) {
      font-size: 0 !important;
      text-shadow: none !important;
    }
    #threadTree .subject-line {
      display: flex !important; align-items: center; min-width: 0;
      flex: 1 1 auto; overflow: hidden; column-gap: 0 !important;
      padding-inline-start: 0 !important;
      margin-inline-start: 0 !important;
      /* Betterbird draws native connectors as background images at the native
         indent. Our compact layout owns this gutter and its optional guides. */
      background-image: none !important;
    }
    /* The parent already has a twisty. Reserve one compact gutter only on
       child rows; native thread depth must not add another indent per level. */
    #threadTree tr:is([data-gm-thread-guide="middle"],[data-gm-thread-guide="end"]) .subject-line {
      padding-inline-start:22px !important;
    }
    #threadTree .subject-line > span:not(.gm-inline-labels) {
      flex: 1 1 0; overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap; min-width: 32px;
      /* Own the spacing instead of inheriting Thunderbird's subject inset. */
      margin-inline: 0 !important; padding-inline: 0 !important;
    }
    #threadTree .subject-line > img { flex: 0 0 auto; }
    #threadTree .gm-inline-labels {
      /* Hover actions must truncate subject/preview, not move their origin
         by shrinking the preceding labels. Keep the existing width cap. */
      display: inline-flex; flex: 0 0 auto; max-width: 48%; gap: 4px;
      overflow: hidden; margin-inline: 0 !important; padding: 0 !important; align-items: center;
      font-weight: 400; vertical-align: middle;
    }
    #threadTree .gm-inline-label:last-child { margin-inline-end:6px !important; }
    /* Native state icons reserve space even when visibility:hidden. */
    #threadTree tr:not([data-properties~="new"]):not([data-properties~="replied"]):not([data-properties~="forwarded"]):not([data-properties~="redirected"]) .subject-line > img {
      display:none !important;
    }
    #threadTree .gm-inline-labels:empty { display:none !important; margin-inline:0 !important; }
    #threadTree .gm-inline-label {
      display: inline-block; flex: 0 0 auto; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; max-width: 160px;
      font: 12px/16px Arial, sans-serif; border-radius: 4px; padding: 1px 5px;
      box-sizing: border-box; text-align: center; text-indent: 0; vertical-align: middle;
      background: var(--gm-chip-bg); color: var(--gm-chip-fg);
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
    const existing=line.querySelector('.gm-inline-labels');
    if ((row.dataset.properties || "").split(" ").includes("dummy")) {existing?.remove();return;}
    let labels;
    try {
      const header = window.gDBView?.getMsgHdrAt(row.index);
      if (!header) {existing?.remove();return;}
      const hidden=hiddenMessageLabelKeys(labelPrefs);
      labels = assignedTags(header, tags).filter(tag=>!hidden.has(tag.key));
    } catch (_) {existing?.remove();return;}
    if (!labels.length) {existing?.remove();return;}
    const signature=JSON.stringify(labels.map(tag=>[tag.key,tag.tag,tag.color]));
    if(existing && rendered.get(row)===signature)return;
    existing?.remove();rendered.set(row,signature);
    const container = doc.createElement("span");
    container.className = "gm-inline-labels";
    gmBindAttribute(container, "aria-label", () => gmText("Labels: $1", labels.map(tag => tag.tag).join(", ")));
    container.title = labels.map(tag => tag.tag).join(", ");
    for (const tag of labels) {
      const chip = doc.createElement("span");
      chip.className = "gm-inline-label";
      chip.textContent = tag.tag;
      chip.title = tag.tag;
      bindLabelNavigation(chip,tag,window);
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
      try { render(this); } catch (error) { console.error(gmText("Inline labels:"), error); }
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

function commonLabelKeys(groups) {
  if(!groups.length)return new Set();
  const keys=new Set(groups[0].map(tag=>tag.key));
  for(const group of groups.slice(1)){
    const present=new Set(group.map(tag=>tag.key));
    for(const key of keys)if(!present.has(key))keys.delete(key);
  }
  return keys;
}
