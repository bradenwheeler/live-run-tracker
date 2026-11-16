import {createRouteProjector} from '../docs/route-progress.mjs';
import {readFixes} from './session-history.mjs';
const keyFor=(state,route,config)=>[state.since,state.captureAt||state.since,route?.version,config?.version].join(':');
export function recordCrossings(crossed,checkpoints,fix,project,start){
  if(fix.tst<start)return false;const match=project(fix);if(!match)return false;let changed=false;
  for(const cp of checkpoints)if(match.alongMiles+1e-9>=cp.mile&&(crossed[cp.id]===undefined||fix.tst<crossed[cp.id])){crossed[cp.id]=fix.tst;changed=true;}
  return changed;
}
export async function checkpointView(storage,state,route,config,now){
  const items=config?.items||[];if(!items.length)return [];
  if(state.until<=now||!route)return items.map(cp=>({...cp,crossedAt:null}));
  const key=keyFor(state,route,config);let cache=await storage.get('checkpointCrossings');
  if(cache?.key!==key){
    cache={key,crossed:{}};const project=createRouteProjector(route.segments);
    for(const fix of await readFixes(storage,state))recordCrossings(cache.crossed,items,fix,project,state.since);
    await storage.put('checkpointCrossings',cache);
  }
  return items.map(cp=>({...cp,crossedAt:cache.crossed[cp.id]??null}));
}
export async function ingestCheckpointFix(storage,state,fix){
  const cache=await storage.get('checkpointCrossings');if(!cache)return;
  const config=await storage.get('checkpoints');if(!config?.items?.length)return;
  const route=await storage.get('route');if(!route||cache.key!==keyFor(state,route,config))return;
  if(recordCrossings(cache.crossed,config.items,fix,createRouteProjector(route.segments),state.since))await storage.put('checkpointCrossings',cache);
}
