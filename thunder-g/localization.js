/* Shared by extension pages and the packaged Thunderbird experiment.
 * Only explicit UI strings pass through here. User content is never translated. */
var gmCatalogs = typeof THUNDER_G_CATALOGS === 'object' ? THUNDER_G_CATALOGS : {};
var gmSourceKeys = new Map();
var gmCurrentLanguage = 'en';
var gmRenderedMessages = new Map();
var gmLiveBindings = new Set();
var gmBindingSweep = null;
// Recycled rows create short-lived bindings. Incrementally release dead weak
// targets during normal rendering, without waiting for a language change or
// adding a timer. Keep each insertion's cleanup work bounded.
function gmSweepBindings(){
  gmBindingSweep ||= gmLiveBindings.values();
  for(let i=0;i<4;i++){
    const next=gmBindingSweep.next();
    if(next.done){gmBindingSweep=null;break;}
    if(!next.value.node.deref())gmLiveBindings.delete(next.value);
  }
}
var gmNodeBindings = new WeakMap();
var gmLanguageListeners = new Set();
function gmResolveLanguage(preference, uiLanguage = 'en') {
  if (preference === 'en' || preference === 'it') return preference;
  return /^it(?:[-_]|$)/i.test(uiLanguage) ? 'it' : 'en';
}
function gmSetCatalogs(catalogs) {
  gmCatalogs = catalogs;
  gmSourceKeys = new Map(Object.entries(catalogs.en || {}).map(([key, entry]) => [entry.message, key]));
}
function gmSetLanguage(language) {
  gmCurrentLanguage = gmResolveLanguage(language);
  for(const binding of [...gmLiveBindings]){
    const node=binding.node.deref();
    if(!node){gmLiveBindings.delete(binding);continue;}
    gmApplyBinding(node,binding);
  }
  for(const refresh of gmLanguageListeners)refresh();
}
function gmLocale() {
  return gmSourceKeys.size ? gmCurrentLanguage : undefined;
}
function gmText(source, ...substitutions) {
  const key = gmSourceKeys.get(source);
  const message = gmCatalogs[gmCurrentLanguage]?.[key]?.message || gmCatalogs.en?.[key]?.message || source;
  // One substitution pass: label names containing '$1' remain literal data.
  const rendered=message.replace(/\$(\d+)/g, (token, number) => substitutions[Number(number) - 1] === undefined ? token : String(substitutions[Number(number) - 1]));
  if(gmRenderedMessages.size>=2048)gmRenderedMessages.delete(gmRenderedMessages.keys().next().value);
  gmRenderedMessages.set(rendered,{source,substitutions});
  return rendered;
}
function gmApplyBinding(node,binding){
  const value=binding.compute(),textNode=binding.textNode?.deref();
  if(binding.attribute)node.setAttribute(binding.property,value);
  else if(binding.property==='textContent' && textNode && textNode.parentNode===node){
    textNode.nodeValue=value;
  }else{
    node[binding.property]=value;
    if(binding.property==='textContent' && node.firstChild?.nodeType===3)binding.textNode=new WeakRef(node.firstChild);
  }
}
function gmBind(node,property,compute,attribute=false){
  let bindings=gmNodeBindings.get(node);
  if(!bindings){bindings=new Map();gmNodeBindings.set(node,bindings);}
  const key=(attribute?'attr:':'value:')+property;
  let binding=bindings.get(key);
  if(!binding){binding={node:new WeakRef(node),property,attribute};bindings.set(key,binding);gmLiveBindings.add(binding);gmSweepBindings();}
  binding.compute=compute;gmApplyBinding(node,binding);return node;
}
function gmBindValue(node,property,compute){return gmBind(node,property,compute);}
function gmBindAttribute(node,property,compute){return gmBind(node,property,compute,true);}
// Restrict reverse lookup to built-in action labels, never message text or tag names.
function gmOnLanguageChange(refresh){gmLanguageListeners.add(refresh);return ()=>gmLanguageListeners.delete(refresh);}
function gmBindAction(node,property,value,attribute=false){
  const message=gmRenderedMessages.get(value);
  return gmBind(node,property,message?()=>gmText(message.source,...message.substitutions):()=>value,attribute);
}
function gmCount(singular, plural, count) {
  return gmText(new Intl.PluralRules(gmCurrentLanguage).select(count) === 'one' ? singular : plural, count);
}
function gmLocalizeDocument(document) {
  document.documentElement.lang = gmCurrentLanguage;
  for (const node of document.querySelectorAll('[data-i18n]')) {
    const key = node.getAttribute('data-i18n');
    node.textContent = gmCatalogs[gmCurrentLanguage]?.[key]?.message || gmCatalogs.en?.[key]?.message || node.textContent;
  }
  for (const attribute of ['aria-label', 'title', 'placeholder']) {
    for (const node of document.querySelectorAll(`[data-i18n-${attribute}]`)) {
      const key = node.getAttribute(`data-i18n-${attribute}`);
      const message = gmCatalogs[gmCurrentLanguage]?.[key]?.message || gmCatalogs.en?.[key]?.message;
      if (message) node.setAttribute(attribute, message);
    }
  }
}
var ThunderGI18n = {
  get language() { return gmCurrentLanguage; },
  setPreference(preference) { gmSetLanguage(gmResolveLanguage(preference, typeof browser !== 'undefined' ? browser.i18n?.getUILanguage?.() : 'en')); },
  ready: Promise.resolve()
};
gmSetCatalogs(gmCatalogs);
if (typeof browser !== 'undefined' && browser.runtime?.getURL && typeof fetch === 'function') {
  ThunderGI18n.ready = (async () => {
    const catalogs = {};
    await Promise.allSettled(['en', 'it'].map(async language => {
      const response = await fetch(browser.runtime.getURL(`_locales/${language}/messages.json`));
      if (!response.ok) throw new Error(`Unable to load ${language} translations`);
      catalogs[language] = await response.json();
    }));
    gmSetCatalogs(catalogs);
    let preference = 'auto';
    try { preference = (await browser.storage.local.get({interfaceLanguage:'auto'})).interfaceLanguage; } catch (_) { /* Keep automatic language when storage is unavailable. */ }
    ThunderGI18n.setPreference(preference);
  })();
}
