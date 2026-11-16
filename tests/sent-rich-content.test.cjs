const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const scope=require('./localization-context.cjs').createContext({});
vm.runInContext(fs.readFileSync('thunder-g/compose.js','utf8'),scope);
function text(value){return {nodeType:3,nodeValue:value};}
function element(tag,children=[],attrs={},styles={}){return {nodeType:1,localName:tag,childNodes:children,style:{getPropertyValue:key=>styles[key] || ''},getAttribute:key=>attrs[key] || ''};}
function capture(children){return scope.captureSentRichContent({document:{body:element('body',children)}});}
function documentFixture(){return {createTextNode:text,createElement(tag){return {tag,children:[],attrs:{},events:{},style:{setProperty(key,value){this[key]=value}},append(child){this.children.push(child)},setAttribute(key,value){this.attrs[key]=value},addEventListener(key,fn){this.events[key]=fn}}}};}
test('rich snapshot preserves formatting, safe links and quote hierarchy without active elements or attributes',()=>{
 const snapshot=capture([element('p',[element('strong',[text('Bold')]),element('a',[text('Link')],{href:'https://example.org/path',onclick:'bad()'}),element('script',[text('bad()')]),element('iframe')],{}, {'color':'rgb(10, 20, 30)','background-color':'url(https://evil.test/tracker)','font-size':'18px'}),element('blockquote',[text('Earlier message')])]);
 assert.equal(snapshot.children[0].children.length,2);assert.equal(snapshot.children[0].style.color,'rgb(10, 20, 30)');assert.equal(snapshot.children[0].style['font-size'],'18px');assert.equal(snapshot.children[0].style['background-color'],undefined);
 const opened=[],node=scope.renderSentRichContent(documentFixture(),snapshot,href=>opened.push(href));
 const link=node.children[0].children[1];assert.equal(link.attrs.href,'https://example.org/path');assert.equal(link.events.onclick,undefined);
 let prevented=false;link.events.click({preventDefault(){prevented=true},stopPropagation(){}});assert.equal(prevented,true);assert.deepEqual(opened,['https://example.org/path']);assert.equal(node.children[1].tag,'blockquote');
});
test('inline images are copied only from decoded pixels and never reference the original source',()=>{
 const image=element('img',[],{src:'https://example.org/image',alt:'Picture'});Object.assign(image,{complete:true,naturalWidth:20,naturalHeight:10,ownerDocument:{createElement(tag){assert.equal(tag,'canvas');return {getContext:()=>({drawImage:node=>assert.equal(node,image)}),toDataURL:()=> 'data:image/png;base64,AAAA'};}}});
 const snapshot=capture([image]);assert.equal(snapshot.children[0].src,'data:image/png;base64,AAAA');
 const rendered=scope.renderSentRichContent(documentFixture(),snapshot,()=>{});assert.equal(rendered.children[0].attrs.src,'data:image/png;base64,AAAA');
 image.complete=false;assert.equal(capture([image]).children[0].text,'Picture');
 image.complete=true;image.ownerDocument.createElement=()=>{throw Error('tainted canvas')};assert.equal(capture([image]).children[0].text,'Picture');
});
test('renderer independently rejects unsafe trees, URLs, image types and resource exhaustion',()=>{
 const doc=documentFixture();
 for(const tag of ['script','iframe','browser','svg','object','style','input'])assert.equal(scope.renderSentRichContent(doc,{tag},()=>{}),null);
 for(const href of ['javascript:alert(1)','data:text/html,bad','file:///etc/passwd','chrome://messenger','https://good.test/\nattack'])assert.equal(scope.sentRichLink(href),'');
 for(const src of ['https://remote.test/image','data:image/svg+xml;base64,AAAA','file:///tmp/image'])assert.equal(scope.renderSentRichContent(doc,{tag:'img',src},()=>{}),null);
 let deep={text:'end'};for(let i=0;i<45;i++)deep={tag:'div',children:[deep]};assert.equal(scope.renderSentRichContent(doc,deep,()=>{}),null);
 assert.equal(capture([text('x'.repeat(1000001))]),null);
});

test('Thunderbird legacy font markup preserves its text, color, face and size as a passive span',()=>{
 const snapshot=capture([element('font',[text('Styled')],{color:'#ff0000',face:'Arial',size:'5'})]);
 assert.equal(snapshot.children[0].tag,'span');assert.equal(snapshot.children[0].children[0].text,'Styled');assert.equal(snapshot.children[0].style.color,'#ff0000');assert.equal(snapshot.children[0].style['font-family'],'Arial');assert.equal(snapshot.children[0].style['font-size'],'24px');
});
