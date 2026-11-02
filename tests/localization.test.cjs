const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../thunder-g');
const catalogs=Object.fromEntries(['en','it'].map(language=>[language,JSON.parse(fs.readFileSync(path.join(root,'_locales',language,'messages.json'),'utf8'))]));
const source=fs.readFileSync(path.join(root,'localization.js'),'utf8');
function context(extra={}){const scope=require('./localization-context.cjs').createContext({THUNDER_G_CATALOGS:catalogs,...extra});vm.runInContext(source,scope);return scope}
test('language resolution follows Thunderbird by default, supports explicit overrides and falls back to English',()=>{
 const scope=context();
 for(const [preference,ui,expected] of [['auto','it-IT','it'],['auto','IT-ch','it'],['auto','en-GB','en'],['auto','fr-FR','en'],['en','it-IT','en'],['it','en-US','it'],['invalid','it','it'],[undefined,undefined,'en']])assert.equal(scope.gmResolveLanguage(preference,ui),expected);
});
test('English and Italian catalogs have identical keys, nonempty translations and matching substitutions',()=>{
 assert.deepEqual(Object.keys(catalogs.en).sort(),Object.keys(catalogs.it).sort());
 for(const key of Object.keys(catalogs.en)){
  const en=catalogs.en[key].message,it=catalogs.it[key].message;
  assert.equal(typeof it,'string');assert.ok(it.trim(),key);
  assert.deepEqual([...(en.match(/\$\d+/g)||[])].sort(),[...(it.match(/\$\d+/g)||[])].sort(),key);
 }
 assert.ok(Object.keys(catalogs.en).length>=400);
});
test('translated UI preserves user label names and literal HTML or dollar signs in substitutions',()=>{
 const scope=context();scope.gmSetLanguage('it');
 const label='Work <script>alert(1)</script> $1';
 assert.equal(scope.gmText('Remove $1 from this message',label),`Rimuovi ${label} da questo messaggio`);
 assert.equal(scope.gmText('Saved.'),'Salvato.');assert.equal(scope.gmText('Unknown untranslated string'),'Unknown untranslated string');
 scope.gmSetLanguage('en');assert.equal(scope.gmText('Remove $1 from this message',label),`Remove ${label} from this message`);
});
test('missing Italian entries use the English source without losing substitutions',()=>{
 const scope=context();scope.gmSetCatalogs({en:{entry:{message:'Show $1 earlier messages'}},it:{}});scope.gmSetLanguage('it');
 assert.equal(scope.gmText('Show $1 earlier messages',4),'Show 4 earlier messages');
});
test('count messages use singular and plural forms in both languages',()=>{
 const scope=context();scope.gmSetLanguage('it');
 assert.equal(scope.gmCount('$1 message','$1 messages',1),'1 messaggio');assert.equal(scope.gmCount('$1 message','$1 messages',2),'2 messaggi');
 assert.equal(scope.gmCount('Show $1 earlier message','Show $1 earlier messages',1),'Mostra 1 messaggio precedente');
 scope.gmSetLanguage('en');assert.equal(scope.gmCount('$1 message','$1 messages',1),'1 message');assert.equal(scope.gmCount('$1 message','$1 messages',0),'0 messages');
});
test('locale loading uses packaged resources and persisted preference, independent of browser language',async()=>{
 for(const [preference,ui,expected] of [['auto','it-IT','it'],['en','it-IT','en'],['it','en-US','it'],['auto','de','en']]){
  const requests=[];
  const scope=context({THUNDER_G_CATALOGS:undefined,browser:{i18n:{getUILanguage:()=>ui},runtime:{getURL:url=>'moz-extension://local/'+url},storage:{local:{get:async()=>({interfaceLanguage:preference})}}},fetch:async url=>{requests.push(url);return {ok:true,json:async()=>catalogs[url.includes('/it/')?'it':'en']}}});
  await scope.ThunderGI18n.ready;
  assert.equal(scope.ThunderGI18n.language,expected);assert.equal(scope.gmLocale(),expected);
  assert.ok(requests.every(url=>url.startsWith('moz-extension://local/_locales/')));
 }
});
test('unavailable storage or an optional catalog cannot prevent startup',async()=>{
 const scope=context({THUNDER_G_CATALOGS:undefined,browser:{i18n:{getUILanguage:()=> 'it-IT'},runtime:{getURL:url=>'extension/'+url},storage:{local:{get:async()=>{throw Error('unavailable')}}}},fetch:async url=>{if(url.includes('/it/'))throw Error('missing');return {ok:true,json:async()=>catalogs.en}}});
 await scope.ThunderGI18n.ready;
 assert.equal(scope.gmText('Saved.'),'Saved.');
});
test('manifest and settings expose automatic, English and Italian with an English fallback locale',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
 assert.equal(manifest.default_locale,'en');assert.deepEqual(manifest.background.scripts,['localization.js','background.js']);
 const key=manifest.description.match(/^__MSG_(.+)__$/)[1];assert.ok(catalogs.en[key]);assert.ok(catalogs.it[key]);
 const html=fs.readFileSync(path.join(root,'options.html'),'utf8');
 assert.match(html,/id="interface-language"/);for(const value of ['auto','en','it'])assert.ok(html.includes(`value="${value}"`));
 assert.ok(!html.includes('<script src="options.js">'),'settings handlers wait for locale initialization');
});
test('Italian label navigation translates its tooltip without changing native tag keys',()=>{
 const scope=context({console});vm.runInContext(fs.readFileSync(path.join(root,'label-navigation.js'),'utf8'),scope);scope.gmSetLanguage('it');
 const attrs=new Map(),node={style:{},setAttribute:(k,v)=>attrs.set(k,v),getAttribute:k=>attrs.get(k),addEventListener(){}};
 scope.bindLabelNavigation(node,{key:'native-key',tag:'Work / English label'},{});
 assert.equal(node.title,'Mostra tutti i messaggi con l’etichetta Work / English label'.replace('l’etichetta',"l'etichetta"));
 assert.equal(attrs.get('data-gm-label-link'),'native-key');
});

test('live bindings translate text and accessible names without replacing existing child controls',()=>{
 const scope=context();
 const text={nodeType:3,nodeValue:'',parentNode:null},icon={kind:'icon'};
 const node={children:[text,icon],firstChild:text,set textContent(value){text.nodeValue=value;},setAttribute(name,value){this[name]=value}};
 text.parentNode=node;
 scope.gmBindValue(node,'textContent',()=>scope.gmText('Reply'));
 scope.gmBindAttribute(node,'aria-label',()=>scope.gmText('Reply'));
 scope.gmSetLanguage('it');
 assert.equal(text.nodeValue,'Rispondi');assert.equal(node['aria-label'],'Rispondi');assert.equal(node.children[1],icon);
 scope.gmSetLanguage('en');assert.equal(text.nodeValue,'Reply');
});

test('existing built-in action labels follow the override while Thunderbird stays English',()=>{
 const scope=context({browser:{i18n:{getUILanguage:()=> 'en-US'}}});
 const nodes=['All','None','Read','Unread','Starred','Unstarred'].map(label=>{
  const node={};scope.gmBindAction(node,'textContent',scope.gmText(label));return node;
 });
 scope.ThunderGI18n.setPreference('it');
 assert.deepEqual(nodes.map(node=>node.textContent),['Tutti','Nessuno','Già letti','Da leggere','Speciali','Non speciali']);
 scope.ThunderGI18n.setPreference('auto');assert.equal(nodes[0].textContent,'All');
});


test('recycled localization targets and text nodes are weak and swept during ordinary rendering',()=>{
 const refs=[];
 class WeakTarget{constructor(value){this.value=value;refs.push(this)}deref(){return this.value}}
 const scope=context({WeakRef:WeakTarget});
 const text={nodeType:3,parentNode:null},node={firstChild:text,set textContent(value){text.nodeValue=value}};text.parentNode=node;
 scope.gmBindValue(node,'textContent',()=>scope.gmText('Reply'));
 const binding=[...scope.gmLiveBindings][0];
 assert.ok(binding.textNode instanceof WeakTarget,'the registry must not strongly retain a child whose parent is the target');
 assert.equal(binding.textNode.deref(),text);
 refs.forEach(ref=>{ref.value=undefined});
 for(let i=0;i<8;i++)scope.gmBindValue({},'textContent',()=>scope.gmText('Reply'));
 assert.equal(scope.gmLiveBindings.has(binding),false,'dead bindings are released without a language change');
 scope.gmSetLanguage('it');
 assert.equal(scope.gmLiveBindings.size,8,'live targets survive cleanup and remain translatable');
});
