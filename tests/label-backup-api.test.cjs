const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function fixture(){
 const calls=[];let cleanup,created=0,disposed=0;
 const scope=require('./localization-context.cjs').createContext({sentReplyLabelTrackers:new Set(),GMAIL_SKIN_CSS:'',GMAIL_CONVERSATIONS_CSS:'',
  ChromeUtils:{importESModule:()=>({ExtensionCommon:{ExtensionAPI:class{},EventManager:class{api(){return {}}}},ExtensionParent:{},MailServices:{}})},
  createNativeLabelBackup(){created++;return {async run(action,data){calls.push([action,data]);if(action==='fail')throw Error('Controlled failure');return {value:1}},close(){disposed++}}}
 });
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../thunder-g/experiments/api.js'),'utf8'),scope);
 const api=new scope.inlineLabels().getAPI({extension:{id:'test'},callOnClose(value){cleanup=value}}).inlineLabels;
 return {api,calls,close:()=>cleanup.close(),get created(){return created},get disposed(){return disposed}};
}
test('label backup boundary is lazy, returns serialized results and closes its native controller',async()=>{
 const f=fixture();assert.equal(f.created,0);
 const response=JSON.parse(await f.api.labelBackup('preview',JSON.stringify({text:'backup contents'})));
 assert.deepEqual(response,{ok:true,result:{value:1}});assert.equal(f.created,1);
 assert.equal(f.calls[0][0],'preview');assert.equal(f.calls[0][1].text,'backup contents');
 await f.api.labelBackup('cancel','{}');assert.equal(f.created,1);
 f.close();assert.equal(f.disposed,1);
 const closed=JSON.parse(await f.api.labelBackup('export','{}'));assert.equal(closed.ok,false);assert.equal(f.calls.length,2);
});
test('malformed or oversized label backup requests do not start a native scan',async()=>{
 const f=fixture();
 for(const text of ['[1]','null','broken',JSON.stringify('wrong'),7,'x'.repeat(24*1024*1024+1)]){
  const response=JSON.parse(await f.api.labelBackup('preview',text));assert.equal(response.ok,false);
 }
 assert.equal(f.created,0);assert.equal(f.calls.length,0);f.close();
});
test('native failures cross the extension boundary as explicit failures rather than successful imports',async()=>{
 const f=fixture(),result=JSON.parse(await f.api.labelBackup('fail','{}'));
 assert.deepEqual(result,{ok:false,error:'Controlled failure'});f.close();
});
