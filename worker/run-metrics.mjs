import {distanceMeters} from '../docs/mile-markers.mjs';
export function edgeDistance(a,b){
  if(!a||!b||b.tst<=a.tst||b.tst-a.tst>900)return 0;
  return distanceMeters([a.lat,a.lon],[b.lat,b.lon]);
}
export function measuredDistance(state,next,track){
  let total=state.distanceVersion===2&&Number.isFinite(state.distanceMeters)?state.distanceMeters:null;
  if(total===null){
    total=0;const points=[...track];
    if(state.point&&(!points.length||state.point.tst>points.at(-1).tst))points.push(state.point);
    for(let i=1;i<points.length;i++)total+=edgeDistance(points[i-1],points[i]);
  }
  return total+edgeDistance(state.point,next);
}
