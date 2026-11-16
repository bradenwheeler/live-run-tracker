import {distanceMeters} from '../docs/mile-markers.mjs';
export function hasElevations(elevations){return Array.isArray(elevations)&&elevations.some(s=>Array.isArray(s)&&s.some(Number.isFinite));}
// At most 500 samples / five requests, including every segment endpoint.
// Interpolate within each segment only; never invent a bridge between GPX segments.
export async function terrainElevations(segments,request=fetch){
  const count=segments.reduce((n,s)=>n+s.length,0),stride=Math.max(1,Math.ceil(count/300)),samples=[],groups=[];
  for(const segment of segments){let distance=0;const group={distances:[],samples:[]};
    for(let i=0;i<segment.length;i++){
      if(i)distance+=distanceMeters(segment[i-1],segment[i]);group.distances.push(distance);
      if(i===0||i===segment.length-1||i%stride===0){const sample={position:segment[i],distance,elevation:null};samples.push(sample);group.samples.push(sample);}
    }groups.push(group);
  }
  const batches=[];for(let i=0;i<samples.length;i+=100)batches.push(samples.slice(i,i+100));
  await Promise.all(batches.map(async batch=>{
    const url=new URL('https://api.open-meteo.com/v1/elevation');url.searchParams.set('latitude',batch.map(s=>s.position[0]).join(','));url.searchParams.set('longitude',batch.map(s=>s.position[1]).join(','));
    const response=await request(url.toString(),{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Terrain elevation service unavailable.');
    const data=await response.json();if(!Array.isArray(data.elevation)||data.elevation.length!==batch.length||data.elevation.some(v=>!Number.isFinite(v)||v< -12000||v>10000))throw Error('Terrain service returned incomplete elevations.');
    batch.forEach((sample,i)=>sample.elevation=data.elevation[i]);
  }));
  return groups.map(group=>{let index=0;return group.distances.map(distance=>{
    while(index<group.samples.length-2&&group.samples[index+1].distance<distance)index++;
    const a=group.samples[index],b=group.samples[Math.min(index+1,group.samples.length-1)],t=b.distance===a.distance?0:(distance-a.distance)/(b.distance-a.distance);
    return Math.round((a.elevation+(b.elevation-a.elevation)*t)*10)/10;
  });});
}
