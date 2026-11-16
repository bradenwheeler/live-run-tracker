export const setupKey=id=>'setup:'+id;
export async function appliedSettings(storage,state){
  const saved=await storage.get('runSettings')||{hours:48,raceStart:null};
  return state?.until>Math.floor(Date.now()/1000)?{hours:Math.max(1,Math.min(72,Math.round((state.until-(state.captureAt||state.since))/3600))),raceStart:state.since}:saved;
}
export async function saveSetup(storage,state){
  const route=await storage.get('route');if(!route)return null;
  const index=await storage.get('setupIndex')||[];let id=await storage.get('activeSetup');
  if(!id||!index.some(p=>p.id===id)){if(index.length>=50)throw Error('Saved setup limit reached. Delete an unused setup first.');id=crypto.randomUUID();}
  const fileName=route.fileName||route.name+'.gpx',name=fileName.replace(/\.gpx$/i,'').slice(0,160)||route.name;
  const profile={id,name,fileName,route,checkpoints:(await storage.get('checkpoints'))?.items||[],settings:await appliedSettings(storage,state),updatedAt:Math.floor(Date.now()/1000)};
  if(new TextEncoder().encode(JSON.stringify(profile)).length>120000)throw Error('This saved setup is too large.');
  await storage.put(setupKey(id),profile);await storage.put('activeSetup',id);
  const meta={id,name,fileName,updatedAt:profile.updatedAt};const existing=index.findIndex(p=>p.id===id);if(existing>=0)index[existing]=meta;else index.push(meta);
  await storage.put('setupIndex',index);return meta;
}
