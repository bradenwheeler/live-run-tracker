export function inPause(state,timestamp){
  return (state.pausedAt!==undefined&&state.pausedAt!==null&&timestamp>=state.pausedAt)||(state.pauseIntervals||[]).some(([start,end])=>timestamp>=start&&timestamp<end);
}
export function crossesPause(state,a,b){
  return !!a&&!!b&&(state.pauseIntervals||[]).some(([start,end])=>a.tst<end&&b.tst>=end&&a.tst<=start);
}
