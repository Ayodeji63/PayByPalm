import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync(new URL('../src/terminal/palmTracker.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness(){
 const workers=[],bitmaps=[];
 class Worker{
  constructor(url){this.url=url;this.messages=[];workers.push(this);}
  postMessage(m){this.messages.push(m);if(m.type==='init')queueMicrotask(()=>this.onmessage({data:{type:'ready'}}));}
  terminate(){this.terminated=true;}
 }
 const exports={};vm.runInNewContext(code,{exports,Worker,setTimeout,clearTimeout,performance:{now:()=>100},createImageBitmap:async(video,options)=>{const b={closed:false,close(){this.closed=true;},options};bitmaps.push(b);return b;}});
 return {...exports,workers,bitmaps};
}
test('one worker and one in-flight downscaled preview, while source dimensions stay unchanged',async()=>{
 const h=harness(),a=h.getPalmTracker();assert.equal(a,h.getPalmTracker());await a.initialize();const video={videoWidth:1280,videoHeight:720};const pending=a.detect(video);await new Promise(r=>setImmediate(r));assert.equal(await a.detect(video),null);assert.equal(h.bitmaps[0].options.resizeWidth,384);assert.equal(h.bitmaps[0].options.resizeHeight,216);assert.equal(video.videoWidth,1280);
 const message=h.workers[0].messages.at(-1);assert.equal(message.type,'frame');h.workers[0].onmessage({data:{type:'result',id:message.id,landmarks:[]}});assert.equal((await pending).length,0);
});
test('worker errors reject the pending preview and allow a fresh guidance worker',async()=>{
 const h=harness(),tracker=h.getPalmTracker();await tracker.initialize();const pending=tracker.detect({videoWidth:1280,videoHeight:720});await new Promise(r=>setImmediate(r));h.workers[0].onerror();await assert.rejects(pending);assert.equal(h.workers[0].terminated,true);assert.notEqual(h.getPalmTracker(),tracker);await h.getPalmTracker().initialize();
});
