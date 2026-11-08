/**
 * The script every fill-in format runs (see fill.ts), kept apart with no imports so the easy post
 * editor in the browser can write the same file.
 */
/**
 * Puts each value into the page's `data-fill` parts: right away for parts already in the page (so
 * a script after it, like the easy post's motion, sees the new words) and the rest once it has
 * loaded. A part marked `data-fill-rich` turns `*stars*` into italics, and with
 * `data-fill-rich="long"` blank lines into paragraphs, the way the easy post editor writes them.
 */
const applyScript = `(()=>{const f=window.smudgeFill,v={};for(const x of f.fields)v[x.key]=x.value;f.values=v;const done=new WeakSet();const line=(t,into)=>{let last=null;for(const p of t.split(/(\\*[^*\\n]+\\*)/)){if(!p)continue;if(/^\\*[^*\\n]+\\*$/.test(p)){const e=document.createElement("em");e.textContent=p.slice(1,-1);into.append(e);last=e;continue}let rest=p;const glue=last&&/^[^\\s]+/.exec(rest);if(glue){const nb=document.createElement("span");nb.style.whiteSpace="nowrap";const words=last.textContent.split(/(\\s+)/),end=words.pop();if(words.length){last.textContent=words.join("")}else last.remove();const e=document.createElement("em");e.textContent=end;nb.append(e,glue[0]);into.append(nb);rest=rest.slice(glue[0].length)}last=null;rest.split("\\n").forEach((q,i)=>{if(i)into.append(document.createElement("br"));if(q)into.append(q)})}};const rich=(el,s,long)=>{el.replaceChildren();if(!long)return line(s,el);for(const para of s.split(/\\n\\s*\\n/)){const t=para.trim();if(!t)continue;const p=document.createElement("p");line(t,p);el.append(p)}};const put=()=>{for(const el of document.querySelectorAll("[data-fill]")){if(done.has(el))continue;const x=v[el.dataset.fill];if(x===undefined)continue;done.add(el);if(el.tagName==="IMG")el.src=x;else if(el.hasAttribute("data-fill-rich"))rich(el,x,el.dataset.fillRich==="long");else el.textContent=x}};put();if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",put)})();\n`;

/** The file for a field list, with the standard script. */
export const fillSource = (fields: { key: string; label: string; kind: string; value: string }[]) =>
  `window.smudgeFill = ${JSON.stringify({ fields }).replace(/</g, "\\u003c")};\n${applyScript}`;
