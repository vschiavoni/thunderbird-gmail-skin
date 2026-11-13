const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('thunder-g/experiments/api.js','utf8').split('var {')[0];
function setup(){
 const attrs=new Set();let commands=0;
 const item={label:'Show folder size',hasAttribute:key=>attrs.has(key),toggleAttribute(key,on){on?attrs.add(key):attrs.delete(key)},doCommand(){commands++}};
 const pane={activeModes:['all','tags'],updateContextMenuCheckedItems(){},updateContextCheckedFolderMode(){},toggleHeader(hidden){this.hidden=hidden},moveFolderModeDown(){assert.equal(this.mode,'all');this.activeModes.reverse()}};
 const doc={defaultView:{folderPane:pane},getElementById:id=>id==='folderPaneHeaderToggleFolderSize'?item:null};
 const scope={};vm.createContext(scope);vm.runInContext(source,scope);return {run:scope.nativeFolderSettings,doc,pane,item,commands:()=>commands};
}
test('settings reuse native commands and checked state',()=>{const s=setup();const result=JSON.parse(s.run(s.doc,'folderPaneHeaderToggleFolderSize',true));assert.equal(s.commands(),1);assert.equal(result.options.find(x=>x.id==='folderPaneHeaderToggleFolderSize').checked,true)});
test('settings reject arbitrary native commands and disabled options',()=>{const s=setup();assert.throws(()=>s.run(s.doc,'deleteEverything'));s.item.disabled=true;assert.throws(()=>s.run(s.doc,'folderPaneHeaderToggleFolderSize',true));assert.equal(s.commands(),0)});
test('settings reorder modes and restore native context',()=>{const s=setup();s.pane.mode='tags';s.run(s.doc,'down:all');assert.equal(s.pane.mode,'tags');assert.deepEqual(s.pane.activeModes,['tags','all']);assert.throws(()=>s.run(s.doc,'up:missing'))});
test('header can be hidden and restored from settings',()=>{const s=setup();s.run(s.doc,'header',false);assert.equal(s.pane.hidden,true);s.run(s.doc,'header',true);assert.equal(s.pane.hidden,false)});
test('sidebar menus hidden without removing label creation control',()=>{const css=fs.readFileSync('chrome/gmail-inspired.css','utf8');assert.match(css,/#folderTree \[data-mode\]:not\(\[data-mode="tags"\]\) \.mode-button/);assert.match(fs.readFileSync('thunder-g/options.html','utf8'),/folder-options.js/)});

test('settings find an existing mail tab independently of background API registration',()=>{
 const scope={};vm.createContext(scope);vm.runInContext(source,scope);
 const mail={documentURI:'about:3pane',defaultView:{folderPane:{}}};
 const windows=[{document:{getElementById:()=>({tabInfo:[{browser:{contentDocument:{documentURI:'options.html'}}},{chromeBrowser:{contentDocument:mail}}]})}}];
 assert.equal(scope.findFolderSettingsDocument(windows),mail);
 assert.equal(scope.findFolderSettingsDocument([{document:{getElementById:()=>null}}]),null);
});

test('settings expose and toggle the custom Snoozed folder mode through its native command',()=>{
 const s=setup(),original=s.doc.getElementById;let changes=0;
 const item={label:'Snoozed',checked:false,hasAttribute(key){return key==='checked'&&this.checked},toggleAttribute(key,on){if(key==='checked')this.checked=on},doCommand(){changes++;s.pane.activeModes=this.checked?['all','tags','gmSnoozed']:['all','tags']}};
 s.doc.getElementById=id=>id==='gm-snoozed-folder-mode'?item:original(id);
 let state=JSON.parse(s.run(s.doc));assert.equal(state.options.find(x=>x.id==='gm-snoozed-folder-mode')?.label,'Snoozed');
 state=JSON.parse(s.run(s.doc,'gm-snoozed-folder-mode',true));assert.equal(changes,1);assert.equal(state.options.find(x=>x.id==='gm-snoozed-folder-mode').checked,true);assert.ok(state.modes.includes('gmSnoozed'));
 state=JSON.parse(s.run(s.doc,'gm-snoozed-folder-mode',false));assert.equal(changes,2);assert.equal(state.options.find(x=>x.id==='gm-snoozed-folder-mode').checked,false);assert.ok(!state.modes.includes('gmSnoozed'));
});
