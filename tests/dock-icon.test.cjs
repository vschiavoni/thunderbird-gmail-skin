const {test}=require('node:test');const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const scope=vm.createContext({setTimeout,clearTimeout});vm.runInContext(fs.readFileSync('thunder-g/dock-icon.js','utf8'),scope);
function fixture(){let appearance='light',timer,prepared=0,restored=0,closed=0;const applied=[];const controller=scope.createDockIconController({async prepare(){prepared++},appearance:()=>appearance,apply:value=>applied.push(value),restore(){restored++},close(){closed++},report(error){throw error}},{schedule:fn=>{timer=fn;return 1},unschedule:()=>timer=null});return {controller,applied,setAppearance:value=>appearance=value,tick:()=>timer?.(),get timer(){return timer},get prepared(){return prepared},get restored(){return restored},get closed(){return closed}};}
test('Dock icon follows system appearance, avoids redundant changes and restores on disable',async()=>{const f=fixture();await f.controller.setEnabled(true);assert.deepEqual(f.applied,['light']);f.tick();assert.equal(f.applied.length,1);f.setAppearance('dark');f.tick();assert.deepEqual(f.applied,['light','dark']);f.setAppearance('light');f.tick();assert.deepEqual(f.applied,['light','dark','light']);await f.controller.setEnabled(false);assert.equal(f.restored,1);assert.equal(f.timer,null);await f.controller.setEnabled(true);assert.equal(f.prepared,1);f.controller.close();f.controller.close();assert.equal(f.closed,1);assert.equal(f.restored,2);assert.equal(f.timer,null);});
test('shutdown while loading icons cannot apply a late change',async()=>{let ready,applied=0,closed=0;const controller=scope.createDockIconController({prepare:()=>new Promise(resolve=>ready=resolve),apply(){applied++},close(){closed++}});const enabling=controller.setEnabled(true);await Promise.resolve();controller.close();ready();await enabling;assert.equal(applied,0);assert.equal(closed,1);});
test('a failed prepare can be retried without leaving a timer',async()=>{let fail=true,applied=0;const controller=scope.createDockIconController({async prepare(){if(fail)throw Error('unavailable')},appearance:()=> 'dark',apply(){applied++},restore(){},close(){},report(){}},{schedule:()=>1,unschedule(){}});await assert.rejects(controller.setEnabled(true),/unavailable/);fail=false;await controller.setEnabled(true);assert.equal(applied,1);controller.close();});
test('fixed styles ignore theme changes and Auto supports independent theme mappings',async()=>{
  const f=fixture();
  for(const style of ['light','dark']){
    await f.controller.setEnabled(true,{mode:style});assert.equal(f.applied.at(-1),style);
    const count=f.applied.length;f.setAppearance('dark');f.tick();f.setAppearance('light');f.tick();assert.equal(f.applied.length,count);
  }
  await f.controller.setEnabled(true,{mode:'auto',light:'dark',dark:'light'});assert.equal(f.applied.at(-1),'dark');
  f.setAppearance('dark');f.tick();assert.equal(f.applied.at(-1),'light');
  await f.controller.setEnabled(true,{mode:'auto',light:'light',dark:'dark'});assert.equal(f.applied.at(-1),'dark');
  f.setAppearance('light');f.tick();assert.equal(f.applied.at(-1),'light');
  await f.controller.setEnabled(true,{mode:'invalid',light:'invalid',dark:'invalid'});assert.equal(f.applied.at(-1),'light');
  f.setAppearance('dark');f.tick();assert.equal(f.applied.at(-1),'dark');f.controller.close();
});
