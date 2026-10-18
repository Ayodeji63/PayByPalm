// Isolated content script, only copied into the opted-in kiosk extension.
(() => {
  const origin = __PBP_ORIGIN__;
  const states = new Set(['OFF','LOADING','CAPTURING','SUCCESS','ERROR']);
  if (window.top !== window || location.origin !== origin ||
      !(location.pathname === '/terminal' || location.pathname.startsWith('/terminal/'))) return;
  const mark=()=>{if(!document.documentElement)return false;document.documentElement.dataset.paybypalmLedBridge='1';return true;};
  if(!mark()){const observer=new MutationObserver(()=>{if(mark())observer.disconnect();});observer.observe(document,{childList:true,subtree:true});}
  window.addEventListener('pagehide',()=>{chrome.runtime.sendMessage({type:'led',id:crypto.randomUUID(),state:'OFF'},()=>void chrome.runtime.lastError);});
  window.addEventListener('message', event => {
    const m=event.data;
    if(event.source!==window || event.origin!==origin || m?.type!=='pbp-led-request' ||
       typeof m.id!=='string' || m.id.length>80 || !states.has(m.state)) return;
    chrome.runtime.sendMessage({type:'led',id:m.id,state:m.state}, response => {
      const failed=chrome.runtime.lastError;
      window.postMessage({type:'pbp-led-response',id:m.id,state:m.state,
        available:!failed && response?.available===true,mock:response?.mock===true},origin);
    });
  });
})();
