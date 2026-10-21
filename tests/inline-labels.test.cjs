const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync(require('node:path').join(__dirname, '../inline-labels/labels.js'), 'utf8');

function fixture() {
  class Element {
    constructor() { this.children = []; this.dataset = {}; this.style = { setProperty() {} }; }
    append(child) { child.parent = this; this.children.push(child); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); }
    setAttribute(key, value) { this[key] = value; }
    querySelector(selector) {
      if (selector === '.subject-line') return this.line;
      if (selector === '.gm-inline-labels') return this.children.find(x => x.className === 'gm-inline-labels');
    }
  }
  const nativeSubject = new Element();
  const row = new Element(); row.index = 0; row.line = new Element(); row.line.append(nativeSubject);
  class ThreadRow { fillRow() { this.nativeCalls = (this.nativeCalls || 0) + 1; } }
  Object.setPrototypeOf(row, Object.assign(Object.create(ThreadRow.prototype), Element.prototype));
  row.querySelector = selector => selector === '.subject-line' ? row.line : undefined;
  let keywords = 'project institution';
  const tags = [{key:'project', tag:'Project <A>', color:'#00aa00'}, {key:'institution', tag:'University', color:'#0000ff'}];
  const doc = {head:new Element(), createElement:() => new Element(), querySelectorAll: selector => selector.includes('table-layout') ? [row] : row.line.children.filter(x => x.className === 'gm-inline-labels')};
  const sheets=[];
  const win = {windowUtils:{loadSheetUsingURIString(uri,type){sheets.push([uri,type]);},
    removeSheetUsingURIString(uri,type){assert.deepEqual(sheets.pop(),[uri,type]);}},document:doc, customElements:{whenDefined:async()=>{},get:()=>ThreadRow}, gDBView:{getMsgHdrAt:()=>({getStringProperty:()=>keywords})}, addEventListener(){},removeEventListener(){}};
  const scope = vm.createContext({Ci:{nsIDOMWindowUtils:{USER_SHEET:1}},window:win,MailServices:{tags:{getAllTags:()=>tags}},console});
  vm.runInContext(code, scope);
  return { scope, row, nativeSubject, tags, sheets, setKeywords(value){keywords=value;} };
}

test('existing tag keys select exact assignments; legacy labels work', () => {
  const {scope} = fixture();
  const result = scope.assignedTags({getStringProperty:()=> 'project-long project',label:2}, [{key:'project',tag:'A'}, {key:'project-longer',tag:'B'}, {key:'$label2',tag:'Legacy'}]);
  assert.equal(result.map(x=>x.tag).join(','), 'A,Legacy');
});
test('multiple chips use real names, refresh on reuse, preserve native subject, cleanly disable', async () => {
  const f = fixture();
  const original = Object.getPrototypeOf(Object.getPrototypeOf(f.row)).fillRow;
  const controller = f.scope.installInlineLabels();
  assert.equal(f.sheets.length,1);
  assert.equal(f.sheets[0][1],1,'header override must use the userChrome stylesheet origin');
  assert.match(decodeURIComponent(f.sheets[0][0]),/font-size: 0 !important/);
  await Promise.resolve();
  let chips = f.row.line.querySelector('.gm-inline-labels');
  assert.equal(chips.children.length, 2);
  assert.equal(chips.children[0].textContent, 'Project <A>');
  assert.equal(f.row.line.children[0], f.nativeSubject);
  f.setKeywords('institution');
  f.row.fillRow();
  assert.equal(f.row.nativeCalls, 1);
  chips = f.row.line.querySelector('.gm-inline-labels');
  assert.equal(chips.children.length, 1);
  assert.equal(chips.children[0].textContent, 'University');
  f.tags[1].tag = 'Renamed'; controller.refresh();
  assert.equal(f.row.line.querySelector('.gm-inline-labels').children[0].textContent, 'Renamed');
  f.setKeywords(''); f.row.fillRow();
  assert.equal(f.row.line.querySelector('.gm-inline-labels'), undefined);
  controller.close();
  assert.equal(f.sheets.length,0);
  assert.equal(f.row.fillRow, original);
});
test('invalid colors are neutral; valid colors get a readable tint', () => {
  const {scope} = fixture();
  assert.equal(scope.chipColors('url(evil)').background, '#e8eaed');
  assert.equal(scope.chipColors('#000000').background, 'rgb(179, 179, 179)');
});
