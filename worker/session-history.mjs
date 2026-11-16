import {edgeDistance} from './run-metrics.mjs';
export async function rawEntries(storage){
  const entries=new Map();let after;
  while(true){const page=await storage.list({prefix:'fix:',limit:1000,...(after?{startAfter:after}:{})});for(const [k,v] of page)entries.set(k,v);if(page.size<1000)break;after=[...page.keys()].at(-1);}
  return entries;
}
export async function readFixes(storage,state){
  const points=[...(await storage.get('legacyFixes')||[]),...(await storage.get('track')||[])];
  if(state.point)points.push(state.point);
  for(const bucket of (await rawEntries(storage)).values())points.push(...bucket);
  const unique=new Map(points.filter(p=>p.tst>=(state.captureAt||state.since)).map(p=>[p.tst,p]));
  return [...unique.values()].sort((a,b)=>a.tst-b.tst);
}
export function rebuildRun(fixes,start,step){
  const eligible=fixes.filter(p=>p.tst>=start);let distanceMeters=0;const track=[];
  for(let i=0;i<eligible.length;i++){const p=eligible[i];if(i)distanceMeters+=edgeDistance(eligible[i-1],p);if(!track.length||p.tst-track.at(-1).tst>=step)track.push({lat:p.lat,lon:p.lon,tst:p.tst});}
  return {point:eligible.at(-1)||null,distanceMeters,distanceVersion:2,track:track.slice(-1440)};
}
export async function clearSession(storage){
  const keys=['state','track','legacyFixes',...(await rawEntries(storage)).keys()];
  for(let i=0;i<keys.length;i+=128)await storage.delete(keys.slice(i,i+128));
}
