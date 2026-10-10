/** Injected before creator code; the host binds every request to one frame and one server ticket. */
export function sdkSource(nonce: string) {
  return `(()=>{
    const nonce=${JSON.stringify(nonce)}, pending=new Map();
    let resizeObserver, resizeTimer, lastHeight=0;
    function measure(){
      clearTimeout(resizeTimer);
      resizeTimer=setTimeout(()=>{
        const height=Math.max(600,Math.min(4000,Math.ceil(document.body.getBoundingClientRect().height)));
        if(height!==lastHeight){lastHeight=height;parent.postMessage({type:'forma:size',nonce,height},'*')}
      },100);
    }
    window.addEventListener('message',event=>{
      if(event.source!==parent || !event.data || event.data.nonce!==nonce)return;
      if(event.data.type==='forma:appearance' && ['light','dark'].includes(event.data.theme)){
        document.documentElement.dataset.theme=event.data.theme;
        document.documentElement.dataset.motion=event.data.reducedMotion?'reduce':'normal';
        let style=document.getElementById('forma-motion-policy');
        if(!style){style=document.createElement('style');style.id='forma-motion-policy';document.head.append(style)}
        style.textContent=event.data.reducedMotion?'*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}':'';
        window.dispatchEvent(new CustomEvent('forma:theme',{detail:{theme:event.data.theme}}));
      }
      if(event.data.type==='forma:layout' && event.data.autoHeight===true && !resizeObserver){
        const style=document.createElement('style');
        style.textContent='html,body{min-height:0}body{display:flow-root}';
        document.head.append(style);
        resizeObserver=new ResizeObserver(measure);resizeObserver.observe(document.body);measure();
      }
      if(event.data.type==='forma:result'){
        const p=pending.get(event.data.id);if(!p)return;
        clearTimeout(p.timer);pending.delete(event.data.id);
        event.data.error?p.reject(new Error(event.data.error)):p.resolve(event.data.value);
      }
    });
    const request=(method,payload)=>new Promise((resolve,reject)=>{
      const id=crypto.randomUUID();
      const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Request timed out'));},10000);
      pending.set(id,{resolve,reject,timer});
      parent.postMessage({nonce,request:{type:'forma:request',id,method,...(payload===undefined?{}:{payload})}},'*');
    });
    Object.defineProperty(window,'forma',{value:Object.freeze({
      appearance:{get theme(){return document.documentElement.dataset.theme||'light'}},
      profile:{poll:{read:()=>request('profile.poll.read'),vote:option=>request('profile.poll.vote',{option})},read:()=>request('profile.read'),cover:postId=>request('profile.cover',{postId}),openPost:postId=>request('profile.openPost',{postId}),social:{read:()=>request('profile.social.read'),toggle:input=>request('profile.social.toggle',input)}},
      relay:{read:()=>request('relay.read'),add:value=>request('relay.add',value)},
      progress:{read:()=>request('viewer.progress.read'),write:value=>request('viewer.progress.write',value)},
      contributions:{list:()=>request('contributions.read'),add:value=>request('contributions.create',value)},
      poll:{read:()=>request('polls.read'),vote:option=>request('polls.vote',{option})}
    }),writable:false});
    window.addEventListener('error',()=>parent.postMessage({type:'forma:error',nonce},'*'));
    window.addEventListener('unhandledrejection',()=>parent.postMessage({type:'forma:error',nonce},'*'));
    window.addEventListener('DOMContentLoaded',()=>parent.postMessage({type:'forma:ready',nonce},'*'));
  })();`;
}
