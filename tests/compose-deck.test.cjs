const {test}=require('node:test');
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(document){
 const scope=require('./localization-context.cjs').createContext({});vm.runInContext(fs.readFileSync('thunder-g/compose.js','utf8'),scope);
 const made=[],events=new Map(),win={document,addEventListener(n,fn){events.set(n,fn)},removeEventListener(n){events.delete(n)}};
 function create(win,hooks){const c={active:false,minimized:false,body:'',attachments:[],open(header,command,placement){this.active=true;this.target=header;this.command=command;this.placement=placement},minimize(){this.minimized=!this.minimized;hooks.changed()},restore(){hooks.restoring();this.minimized=false;hooks.changed()},float(){this.floated=true},returnInline(){},close(){if(this.blockClose)return false;this.active=false;return true},dispose(){this.active=false;hooks.disposed()}};c.hooks=hooks;made.push(c);return c;}
 const deck=scope.createInlineComposeDeck(win,create);scope.inlineComposeControllers.set(win,deck);return {scope,win,deck,made,events};
}
function header(key){return {messageKey:key,folder:{URI:'mailbox://drafts'}};}
test('opening a second draft minimizes the first without replacing its editor state',()=>{
 const {deck,made}=setup();deck.open(header(1),'cmd_editDraft');const first=made[0];first.body='Unsent text';first.attachments.push('report.pdf');
 deck.open(header(2),'cmd_editDraft');assert.equal(made.length,2);assert.equal(first.minimized,true);assert.equal(first.active,true);assert.equal(made[1].minimized,false);assert.equal(first.body,'Unsent text');assert.deepEqual(first.attachments,['report.pdf']);
});
test('restoring an existing minimized draft parks the other and never creates a duplicate',()=>{
 const {deck,made}=setup();deck.open(header(1),'cmd_editDraft');deck.open(header(2),'cmd_editDraft');deck.open(header(1),'cmd_editDraft');assert.equal(made.length,2);assert.equal(made[0].minimized,false);assert.equal(made[1].minimized,true);assert.equal(deck.target.messageKey,1);
});
test('new Compose starts independent messages and navigation never toggles parked ones open',()=>{
 const {deck,made}=setup();deck.open(null,'cmd_newMessage');deck.open(null,'cmd_newMessage');assert.equal(made.length,2);deck.park();deck.park();deck.float();assert.ok(made.every(c=>c.minimized));assert.ok(made.every(c=>!c.floated));
});
test('resuming an already open draft skips MIME loading but a different draft loads and opens',async()=>{
 const {scope,win,deck,made}=setup();deck.open(header(1),'cmd_editDraft');
 await scope.resumeInlineDraft(win,header(1),{},()=>{throw Error('must reuse')});assert.equal(made.length,1);
 const params={body:'second'};await scope.resumeInlineDraft(win,header(2),{},async()=>params);assert.equal(made.length,2);assert.equal(made[1].placement.params,params);assert.equal(made[0].minimized,true);
});
test('a saved copy of a live reply restores its original editor',()=>{
 const {deck,made}=setup();deck.open(header(5),'cmd_replyall');made[0].draftURI='mailbox://drafts?number=12';
 const saved={folder:{getUriForMsg:()=> 'mailbox://drafts?number=12'}};assert.equal(deck.restoreDraft(saved),true);assert.equal(made.length,1);
 assert.equal(deck.restoreDraft({folder:{getUriForMsg:()=> 'mailbox://drafts?number=13'}}),false,'different draft in the same folder must not match');
});
test('closing one composer keeps other drafts and shutdown honors cancellation',()=>{
 const {deck,made}=setup();deck.open(header(1),'cmd_editDraft');deck.open(header(2),'cmd_editDraft');made[1].dispose();assert.equal(deck.active,true);assert.equal(deck.restoreDraft(header(1)),true);made[0].blockClose=true;assert.equal(deck.close(),false);assert.equal(made[0].active,true);made[0].blockClose=false;assert.equal(deck.close(),true);assert.equal(deck.active,false);
});

function documentFixture(){
 function element(){return {style:{},children:[],events:{},setAttribute(){},append(...nodes){this.children.push(...nodes)},replaceChildren(){this.children=[]},remove(){this.removed=true},addEventListener(name,fn){this.events[name]=fn}};}
 return {createElement:element,documentElement:element()};
}
test('minimized dock restores drafts and stays beside the active composer',()=>{
 const doc=documentFixture(),{deck,made}=setup(doc);deck.open(header(1),'cmd_editDraft');deck.open(header(2),'cmd_editDraft');
 made[1].presentation='floating';made[1].width=600;made[1].hooks.changed();
 const dock=doc.documentElement.children[0];assert.equal(dock.children.length,1);assert.equal(dock.style.right,'632px');
 dock.children[0].children[0].events.click();assert.equal(made[0].minimized,false);assert.equal(made[1].minimized,true);
 made[0].presentation='full';made[0].hooks.changed();assert.equal(dock.style.display,'none');
 made[0].presentation='inline';made[0].hooks.changed();assert.equal(dock.style.display,'flex');
});
test('late-loading forwards stay minimized if another composer became current',()=>{
 const {deck,made}=setup();deck.open(header(1),'cmd_forwardInline');made[0].active=false;
 deck.open(header(2),'cmd_replyall');made[0].active=true;made[0].hooks.opened();assert.equal(made[0].minimized,true);assert.equal(made[1].minimized,false);
});
