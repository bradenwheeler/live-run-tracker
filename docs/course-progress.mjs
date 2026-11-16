import {distanceMeters} from './mile-markers.mjs';
// Never bridge gaps between GPX segments. The last point is the shared route projection.
export function completedRoute(segments,alongMeters,position){
  if(!Number.isFinite(alongMeters)||alongMeters<=0)return [];
  const result=[];let total=0;
  for(const segment of segments){
    if(!segment.length)continue;const part=[segment[0]];
    for(let i=1;i<segment.length;i++){
      const length=distanceMeters(segment[i-1],segment[i]);
      if(total+length>=alongMeters){if(position)part.push(position);if(part.length>1)result.push(part);return result;}
      total+=length;part.push(segment[i]);
    }
    if(part.length>1)result.push(part);
  }
  return result;
}
