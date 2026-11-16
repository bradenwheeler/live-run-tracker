import {distanceMeters} from './mile-markers.mjs';
const R=6371008.8,rad=n=>n*Math.PI/180;
const wrap=n=>((n+540)%360)-180;
export function createRouteProjector(segments){
  const origin=segments.find(s=>s.length)?.[0];if(!origin)return ()=>null;
  const scale=Math.max(1e-8,Math.cos(rad(origin[0])));
  const xy=p=>[rad(wrap(p[1]-origin[1]))*R*scale,rad(p[0]-origin[0])*R];
  const edges=[];let total=0;
  for(const segment of segments)for(let i=1;i<segment.length;i++){
    const a=segment[i-1],b=segment[i],[ax,ay]=xy(a),[bx,by]=xy(b),dx=bx-ax,dy=by-ay,length=distanceMeters(a,b);
    edges.push({a,b,ax,ay,dx,dy,squared:dx*dx+dy*dy,length,along:total});total+=length;
  }
  return location=>{
    if(!location)return null;const [px,py]=xy([location.lat,location.lon]);let best=null,bestSquared=Infinity;
    for(const e of edges){const t=e.squared?Math.max(0,Math.min(1,((px-e.ax)*e.dx+(py-e.ay)*e.dy)/e.squared)):0;
      const squared=(px-e.ax-t*e.dx)**2+(py-e.ay-t*e.dy)**2;
      if(squared<bestSquared-1e-8){bestSquared=squared;best={e,t};}}
    if(!best)return null;const {e,t}=best,position=[e.a[0]+t*(e.b[0]-e.a[0]),wrap(e.a[1]+t*wrap(e.b[1]-e.a[1]))],alongMeters=e.along+t*e.length,alongMiles=alongMeters/1609.344;
    return {position,offsetMeters:distanceMeters([location.lat,location.lon],position),alongMeters,alongMiles,totalMeters:total,remainingMeters:Math.max(0,total-alongMeters),lastMarker:Math.floor((alongMiles+1e-9)/2)*2};
  };
}
const projectors=new WeakMap();
export function nearestRoutePoint(segments,location){let project=projectors.get(segments);if(!project){project=createRouteProjector(segments);projectors.set(segments,project);}return project(location);}
