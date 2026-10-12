export const seasonKey = "smudge-season";
/** Runs before the page paints (see layout.tsx), so the season never flashes. */
export const seasonScript = `try{var s=localStorage.getItem('${seasonKey}');document.documentElement.dataset.season=s==='paint'||s==='halloween'?s:new Date().getMonth()===9?'halloween':'paint'}catch(e){document.documentElement.dataset.season=new Date().getMonth()===9?'halloween':'paint'}`;
