/** Injected before creator code; the host binds every request to one frame and one server ticket. */
export function sdkSource(nonce: string) {
  return `(()=>{
    const nonce=${JSON.stringify(nonce)}, pending=new Map();
    let resizeObserver, resizeTimer, lastHeight=0;
    // A feed post out of focus holds still: its timers and frames wait, animations and media pause.
    const later=setTimeout.bind(window), stopLater=clearTimeout.bind(window), every=setInterval.bind(window), frame=requestAnimationFrame.bind(window), stopFrame=cancelAnimationFrame.bind(window);
    const held=new Map(), frames=new Map();
    let paused=false, frameId=0;
    window.setTimeout=function(fn,ms,...args){
      if(typeof fn!=='function')return later(fn,ms,...args);
      const id=later(()=>{if(paused)held.set(id,()=>fn(...args));else fn(...args)},ms);
      return id;
    };
    window.clearTimeout=id=>{held.delete(id);stopLater(id)};
    window.setInterval=function(fn,ms,...args){
      if(typeof fn!=='function')return every(fn,ms,...args);
      return every(()=>{if(!paused)fn(...args)},ms);
    };
    window.requestAnimationFrame=fn=>{
      if(!paused)return frame(fn);
      const id=-(++frameId);frames.set(id,fn);return id;
    };
    window.cancelAnimationFrame=id=>{frames.delete(id);stopFrame(id)};
    function setActive(active){
      if(paused===!active)return;
      paused=!active;
      document.documentElement.dataset.active=active?'on':'off';
      let style=document.getElementById('forma-pause-policy');
      if(!style){style=document.createElement('style');style.id='forma-pause-policy';document.head.append(style)}
      style.textContent=paused?'*,*::before,*::after{animation-play-state:paused!important}':'';
      if(paused)document.querySelectorAll('video,audio').forEach(m=>m.pause());
      else{
        const waiting=[...held.values()],drawing=[...frames.values()];held.clear();frames.clear();
        waiting.forEach(fn=>later(fn,0));drawing.forEach(fn=>frame(fn));
      }
      window.dispatchEvent(new CustomEvent('forma:activity',{detail:{active}}));
    }
    function measure(){
      stopLater(resizeTimer);
      resizeTimer=later(()=>{
        const height=Math.max(600,Math.min(8000,Math.ceil(document.body.getBoundingClientRect().height)));
        if(height!==lastHeight){lastHeight=height;parent.postMessage({type:'forma:size',nonce,height},'*')}
      },100);
    }
    window.addEventListener('message',event=>{
      if(event.source!==parent || !event.data || event.data.nonce!==nonce)return;
      if(event.data.type==='forma:appearance' && ['light','dark'].includes(event.data.theme)){
        document.documentElement.dataset.theme=event.data.theme;
        document.documentElement.dataset.owner=event.data.owner===true?'on':'off';
        document.documentElement.dataset.motion=event.data.reducedMotion?'reduce':'normal';
        if(['paint','halloween'].includes(event.data.season))document.documentElement.dataset.season=event.data.season;
        let style=document.getElementById('forma-motion-policy');
        if(!style){style=document.createElement('style');style.id='forma-motion-policy';document.head.append(style)}
        style.textContent=event.data.reducedMotion?'*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}':'';
        window.dispatchEvent(new CustomEvent('forma:theme',{detail:{theme:event.data.theme}}));
      }
      if(event.data.type==='forma:layout' && event.data.clip===true && !document.getElementById('forma-clip-policy')){
        const style=document.createElement('style');style.id='forma-clip-policy';
        style.textContent='html,body{overflow:hidden!important}';
        document.head.append(style);
      }
      if(event.data.type==='forma:layout' && event.data.autoHeight===true && !resizeObserver){
        const style=document.createElement('style');
        style.textContent='html,body{min-height:0}body{display:flow-root}';
        document.head.append(style);
        resizeObserver=new ResizeObserver(measure);resizeObserver.observe(document.body);measure();
      }
      if(event.data.type==='forma:editing' && typeof event.data.on==='boolean'){
        if(event.data.on)document.documentElement.dataset.editing='on';else delete document.documentElement.dataset.editing;
        if(!document.getElementById('forma-edit-policy')){
          const style=document.createElement('style');style.id='forma-edit-policy';
          style.textContent='html[data-editing=on] :where([data-edit]){outline:2px dashed #2b3cff;outline-offset:4px;cursor:pointer}';
          document.head.prepend(style);
        }
        window.dispatchEvent(new CustomEvent('forma:editing',{detail:{on:event.data.on}}));
      }
      if(event.data.type==='forma:activity' && typeof event.data.active==='boolean')setActive(event.data.active);
      if(event.data.type==='forma:result'){
        const p=pending.get(event.data.id);if(!p)return;
        stopLater(p.timer);pending.delete(event.data.id);
        event.data.error?p.reject(new Error(event.data.error)):p.resolve(event.data.value);
      }
    });
    const request=(method,payload)=>new Promise((resolve,reject)=>{
      const id=crypto.randomUUID();
      const timer=later(()=>{pending.delete(id);reject(new Error('Request timed out'));},10000);
      pending.set(id,{resolve,reject,timer});
      parent.postMessage({nonce,request:{type:'forma:request',id,method,...(payload===undefined?{}:{payload})}},'*');
    });
    Object.defineProperty(window,'forma',{value:Object.freeze({
      get active(){return !paused},
      appearance:{get theme(){return document.documentElement.dataset.theme||'light'},get season(){return document.documentElement.dataset.season||'paint'}},
      profile:{poll:{read:()=>request('profile.poll.read'),vote:option=>request('profile.poll.vote',{option})},read:()=>request('profile.read'),cover:postId=>request('profile.cover',{postId}),openPost:postId=>request('profile.openPost',{postId}),social:{read:()=>request('profile.social.read'),toggle:input=>request('profile.social.toggle',input)},wall:{read:()=>request('profile.wall.read'),add:value=>request('profile.wall.add',value),remove:noteId=>request('profile.wall.remove',{noteId}),report:(noteId,reason)=>request('profile.wall.report',reason===undefined?{noteId}:{noteId,reason})}},
      edit:{get active(){return document.documentElement.dataset.editing==='on'},select:field=>{if(document.documentElement.dataset.editing==='on'&&/^[a-z][a-z0-9-]{0,30}$/.test(String(field)))parent.postMessage({type:'forma:edit',nonce,field:String(field)},'*')}},
      relay:{read:()=>request('relay.read'),add:value=>request('relay.add',value)},
      quiz:{read:()=>request('quiz.read'),answer:answers=>request('quiz.answer',{answers})},
      cat:{read:()=>request('cat.read'),feed:()=>request('cat.feed')},
      progress:{read:()=>request('viewer.progress.read'),write:value=>request('viewer.progress.write',value)},
      answers:{set:value=>request('answers.write',value),read:()=>request('answers.read')},
      contributions:{list:()=>request('contributions.read'),add:value=>request('contributions.create',value)},
      poll:{read:()=>request('polls.read'),vote:option=>request('polls.vote',{option})},
      reactions:{read:()=>request('reactions.read'),place:sticker=>request('reactions.place',{sticker})},
      plan:{read:()=>request('plan.read'),join:going=>request('plan.join',{going:going!==false}),came:came=>request('plan.join',{came:came!==false})}
    }),writable:false});
    // While the owner edits a draft, a tap picks what to change instead of using the page.
    window.addEventListener('click',event=>{
      if(document.documentElement.dataset.editing!=='on')return;
      event.preventDefault();event.stopImmediatePropagation();
      const target=event.target&&event.target.closest&&event.target.closest('[data-edit]');
      if(target)window.forma.edit.select(target.dataset.edit);
    },true);
    window.addEventListener('error',()=>parent.postMessage({type:'forma:error',nonce},'*'));
    window.addEventListener('unhandledrejection',()=>parent.postMessage({type:'forma:error',nonce},'*'));
    window.addEventListener('DOMContentLoaded',()=>parent.postMessage({type:'forma:ready',nonce},'*'));
  })();`;
}
