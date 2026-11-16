const EARTH_METERS=6371008.8;
const METERS_PER_MILE=1609.344;
const rad=d=>d*Math.PI/180;
export function distanceMeters(a,b){
  const dlat=rad(b[0]-a[0]),dlon=rad(b[1]-a[1]);
  const h=Math.sin(dlat/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dlon/2)**2;
  return 2*EARTH_METERS*Math.asin(Math.sqrt(Math.max(0,Math.min(1,h))));
}
function interpolate(a,b,t,length){
  const angle=length/EARTH_METERS;
  if(angle<1e-12)return [...a];
  // Interpolate on the great circle, including routes crossing the date line.
  const u=[Math.cos(rad(a[0]))*Math.cos(rad(a[1])),Math.cos(rad(a[0]))*Math.sin(rad(a[1])),Math.sin(rad(a[0]))];
  const v=[Math.cos(rad(b[0]))*Math.cos(rad(b[1])),Math.cos(rad(b[0]))*Math.sin(rad(b[1])),Math.sin(rad(b[0]))];
  if(Math.abs(Math.sin(angle))<1e-10){const lon=a[1]+t*((b[1]-a[1]+540)%360-180);return [a[0]+t*(b[0]-a[0]),((lon+540)%360)-180];}
  const x=Math.sin((1-t)*angle)/Math.sin(angle),y=Math.sin(t*angle)/Math.sin(angle);
  const p=u.map((n,i)=>x*n+y*v[i]);
  return [Math.atan2(p[2],Math.hypot(p[0],p[1]))*180/Math.PI,Math.atan2(p[1],p[0])*180/Math.PI];
}
export function mileMarkers(segments){
  const spacing=2*METERS_PER_MILE,markers=[];let total=0,next=spacing;
  for(const segment of segments){
    // Separate GPX segments contribute distance without counting an artificial bridge.
    for(let i=1;i<segment.length;i++){
      const a=segment[i-1],b=segment[i],length=distanceMeters(a,b);
      if(length>0)while(next<=total+length+1e-6&&markers.length<1000){
        markers.push({mile:(markers.length+1)*2,position:interpolate(a,b,Math.min(1,Math.max(0,(next-total)/length)),length)});next+=spacing;
      }
      total+=length;
    }
  }
  return {markers,totalMiles:total/METERS_PER_MILE,truncated:total+1e-6>=next};
}
