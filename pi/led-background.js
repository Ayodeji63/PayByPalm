// No HTTP, externally_connectable, general native commands, or payment credentials.
const origin=__PBP_ORIGIN__;
const states=new Set(['OFF','LOADING','CAPTURING','SUCCESS','ERROR']);
let port=null,windowStart=0,count=0,connectionGeneration=0;
const pending=new Map();
let activeTab=null,activeDocument=null;
function clearActiveTab(tabId){
 if(tabId!==activeTab)return;
 activeTab=null;activeDocument=null;
 if(port){try{port.postMessage({id:crypto.randomUUID(),state:'OFF'});}catch{/* Watchdog/EOF clears a failed bridge. */}}
}
chrome.tabs.onRemoved.addListener(clearActiveTab);
chrome.tabs.onUpdated.addListener((tabId,change)=>{if(change.status==='loading')clearActiveTab(tabId);});
function connect(){
 if(port)return port;
 const generation=++connectionGeneration;
 port=chrome.runtime.connectNative('org.paybypalm.led');
 port.onMessage.addListener(m=>{
  const entry=pending.get(m?.id);
  if(!entry)return;
  pending.delete(m.id);clearTimeout(entry.timer);
  entry.reply({available:m.available===true,mock:m.mock===true});
 });
 port.onDisconnect.addListener(()=>{
  void chrome.runtime.lastError;
  if(generation!==connectionGeneration)return;
  port=null;
  for(const entry of pending.values()){clearTimeout(entry.timer);entry.reply({available:false});}
  pending.clear();
 });
 return port;
}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
 let url;try{url=new URL(sender.url);}catch{return false;}
 if(sender.id!==chrome.runtime.id || sender.frameId!==0 || !sender.tab || url.origin!==origin ||
    !(url.pathname==='/terminal'||url.pathname.startsWith('/terminal/')) ||
    m?.type!=='led' || typeof m.id!=='string' || m.id.length>80 || !states.has(m.state))return false;
 if(m.state==='OFF'&&activeDocument&&sender.documentId!==activeDocument){reply({available:false});return false;}
 activeTab=sender.tab.id;activeDocument=sender.documentId;
 const now=Date.now();if(now-windowStart>=1000){windowStart=now;count=0;}
 if((++count>30 && m.state!=='OFF')||pending.size>=16){reply({available:false});return false;}
 // A tab cannot complete another tab's pending request by choosing its UUID.
 const id=crypto.randomUUID();
 const timer=setTimeout(()=>{const entry=pending.get(id);if(entry){pending.delete(id);entry.reply({available:false});}},1500);
 pending.set(id,{reply,timer});
 try{connect().postMessage({id,state:m.state});}catch{
  clearTimeout(timer);pending.delete(id);reply({available:false});
 }
 return true;
});
