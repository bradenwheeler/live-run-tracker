import {distanceMeters} from './mile-markers.mjs';
const R=6371008.8,rad=n=>n*Math.PI/180;
const wrap=n=>((n+540)%360)-180;
// Project onto each actual GPX edge; do not create edges across separate segments.
export function nearestRoutePoint(segments,location){
  if(!location)return null;
  let cumulative=0,best=null;
  for(const segment of segments){
    for(let i=1;i<segment.length;i++){
      const a=segment[i-1],b=segment[i],length=distanceMeters(a,b);
      const cos=Math.max(1e-8,Math.cos(rad((a[0]+b[0]+location.lat)/3)));
      const bx=rad(wrap(b[1]-a[1]))*R*cos,by=rad(b[0]-a[0])*R;
      const px=rad(wrap(location.lon-a[1]))*R*cos,py=rad(location.lat-a[0])*R;
      const denom=bx*bx+by*by,t=denom?Math.max(0,Math.min(1,(px*bx+py*by)/denom)):0;
      const position=[a[0]+t*(b[0]-a[0]),wrap(a[1]+t*wrap(b[1]-a[1]))];
      const offsetMeters=distanceMeters([location.lat,location.lon],position);
      // Prefer the earlier route position on exact ties, e.g. a loop's start/finish.
      if(!best||offsetMeters<best.offsetMeters-1e-6)best={position,offsetMeters,alongMeters:cumulative+t*length};
      cumulative+=length;
    }
  }
  if(!best)return null;
  const miles=best.alongMeters/1609.344;
  return {...best,alongMiles:miles,lastMarker:Math.floor((miles+1e-9)/2)*2};
}
