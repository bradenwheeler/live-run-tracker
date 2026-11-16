export function elapsedLabel(seconds){
  const s=Math.max(0,Math.floor(seconds));return [Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(n=>String(n).padStart(2,'0')).join(':');
}
export function paceLabel(elapsedSeconds,meters){
  if(!Number.isFinite(meters)||meters<160.9344||elapsedSeconds<=0)return '—';
  const seconds=Math.round(elapsedSeconds/(meters/1609.344));
  return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')+' /mi';
}
