export const TRACK_STEP=10,MAX_TRACK_POINTS=30000;
const CHUNK=1000,key=i=>'trail:'+String(i).padStart(4,'0');
export async function readTrack(storage){
  const info=await storage.get('trailInfo');if(!info)return await storage.get('track')||[];
  const track=[];for(let i=0;i<info.chunks;i++)track.push(...(await storage.get(key(i))||[]));return track;
}
export async function readTrackTail(storage){
  const info=await storage.get('trailInfo');return info?await storage.get(key(Math.max(0,info.chunks-1)))||[]:await storage.get('track')||[];
}
export async function writeTrack(storage,points){
  const previous=await storage.get('trailInfo'),track=points.slice(-MAX_TRACK_POINTS),chunks=Math.ceil(track.length/CHUNK);
  for(let i=0;i<chunks;i++)await storage.put(key(i),track.slice(i*CHUNK,(i+1)*CHUNK));
  for(let i=chunks;i<(previous?.chunks||0);i++)await storage.delete(key(i));
  await storage.put('trailInfo',{chunks,count:track.length});await storage.delete('track');
}
export async function appendTrack(storage,point){
  let info=await storage.get('trailInfo');if(!info){await writeTrack(storage,await storage.get('track')||[]);info=await storage.get('trailInfo');}
  if(info.count>=MAX_TRACK_POINTS){const track=await readTrack(storage);await writeTrack(storage,[...track.slice(1),point]);return;}
  const index=Math.floor(info.count/CHUNK),chunk=info.count%CHUNK?await storage.get(key(index))||[]:[];chunk.push(point);
  await storage.put(key(index),chunk);await storage.put('trailInfo',{count:info.count+1,chunks:index+1});
}
