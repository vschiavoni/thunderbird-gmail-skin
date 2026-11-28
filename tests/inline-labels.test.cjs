const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const menuCode=fs.readFileSync(require('node:path').join(__dirname,'../thunder-g/label-menu.js'),'utf8');
const code = fs.readFileSync(require('node:path').join(__dirname, '../thunder-g/labels.js'), 'utf8');

function fixture() {
  class Element {
    constructor() { this.children = []; this.dataset = {}; this.style = { setProperty() {} }; }
    addEventListener() {}
    removeEventListener() {}
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
  const scope = require('./localization-context.cjs').createContext({Ci:{nsIDOMWindowUtils:{USER_SHEET:1}},window:win,MailServices:{tags:{getAllTags:()=>tags}},console});
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../thunder-g/label-navigation.js'),'utf8')+'\n'+menuCode+'\n'+code, scope);
  return { scope, row, nativeSubject, tags, sheets, win, setKeywords(value){keywords=value;} };
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
  f.row.fillRow();
  assert.equal(f.row.line.querySelector('.gm-inline-labels'),chips,'unchanged assignments preserve existing chip nodes');
  assert.equal(f.row.line.children[0],f.nativeSubject);
  f.setKeywords('institution');
  f.row.fillRow();
  assert.equal(f.row.nativeCalls, 2);
  chips = f.row.line.querySelector('.gm-inline-labels');
  assert.equal(chips.children.length, 1);
  assert.equal(chips.children[0].textContent, 'University');
  f.tags[1].tag = 'Renamed'; controller.refresh();
  assert.equal(f.row.line.querySelector('.gm-inline-labels').children[0].textContent, 'Renamed');
  const originalHeader=f.scope.window.gDBView.getMsgHdrAt;
  f.scope.window.gDBView.getMsgHdrAt=()=>null;f.row.fillRow();
  assert.equal(f.row.line.querySelector('.gm-inline-labels'),undefined,'a temporarily missing header cannot retain another message’s chips');
  f.scope.window.gDBView.getMsgHdrAt=originalHeader;f.row.fillRow();
  assert.equal(f.row.line.querySelector('.gm-inline-labels').children[0].textContent,'Renamed');
  f.setKeywords(''); f.row.fillRow();
  assert.equal(f.row.line.querySelector('.gm-inline-labels'), undefined);
  controller.close();
  assert.equal(f.sheets.length,0);
  assert.equal(f.row.fillRow, original);
});
test('chips preserve the selected background in both themes and provide readable text', () => {
  const {scope} = fixture();
  assert.equal(scope.chipColors('#ff0000').background, 'light-dark(rgb(255, 0, 0), rgb(255, 0, 0))');
  assert.equal(scope.chipColors('#ff0000').foreground, 'light-dark(rgb(0, 0, 0), rgb(0, 0, 0))');
  assert.equal(scope.chipColors('url(evil)').background, scope.chipColors('#80868b').background);
  const luminance = rgb => rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  for (const color of ['#000000','#ffffff','#ff0000','#00ff00','#0000ff','#ffff00','#ff00ff','#00ffff']) {
    const colors=scope.chipColors(color);
    const parse = value => [...value.matchAll(/rgb\(([^)]+)\)/g)].map(m=>m[1].split(',').map(Number));
    const backgrounds=parse(colors.background), foregrounds=parse(colors.foreground);
    for(let i=0;i<2;i++) {
      const values=[luminance(backgrounds[i]),luminance(foregrounds[i])].sort((a,b)=>b-a);
      assert.ok((values[0]+.05)/(values[1]+.05)>=4.5,`${color} theme ${i} text contrast`);
    }
  }
});

test('Inbox refills avoid scanning all label definitions and observe preference changes on refresh',async()=>{
  const f=fixture();let reads=0,hidden='[]',visits=0;
  const prefs={getStringPref(){reads++;return hidden}};
  for(let i=0;i<2000;i++)f.tags.push({get key(){visits++;return `unused-${i}`},tag:'Unused',color:'#00aa00'});
  f.setKeywords('institution project project unknown');
  const controller=f.scope.installInlineLabels(f.win,f.scope.MailServices,prefs);
  await Promise.resolve();
  const chips=f.row.line.querySelector('.gm-inline-labels');
  assert.deepEqual(chips.children.map(chip=>chip.textContent),['Project <A>','University'],'definition order and duplicate keys are preserved');
  const before=visits;
  for(let i=0;i<100;i++)f.row.fillRow();
  assert.equal(visits,before,'refilling rows does not walk unrelated label definitions');
  assert.equal(reads,1,'hidden-label preferences are read once per definition refresh');
  controller.refresh();
  assert.equal(f.row.line.querySelector('.gm-inline-labels'),chips,'unrelated preference notifications preserve unchanged chip nodes');
  f.tags.at(-1).color='#ff0000';controller.refresh();
  assert.equal(f.row.line.querySelector('.gm-inline-labels'),chips,'changing an unrelated label does not rebuild this row');
  hidden='["project"]';controller.refresh();
  assert.deepEqual(f.row.line.querySelector('.gm-inline-labels').children.map(chip=>chip.textContent),['University']);
  f.win.gDBView.getMsgHdrAt=()=>({label:2,getStringProperty:()=>''});
  f.tags.push({key:'$label2',tag:'Legacy',color:'#ff0000'});controller.refresh();
  assert.equal(f.row.line.querySelector('.gm-inline-labels').children[0].textContent,'Legacy');
  controller.close();
});
