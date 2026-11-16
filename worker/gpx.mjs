// Runs in the admin browser. Only sanitized coordinates are sent to the server.
export function parseGpx(text,filename='Route.gpx') {
  if(/<!DOCTYPE|<!ENTITY/i.test(text)) throw Error('GPX files with document types or entities are not supported.');
  const doc=new DOMParser().parseFromString(text,'application/xml');
  if(doc.getElementsByTagNameNS('*','parsererror').length||doc.documentElement.localName!=='gpx') throw Error('Choose a valid GPX file.');
  const all=(root,name)=>Array.from(root.getElementsByTagNameNS('*',name));
  let groups=all(doc,'trkseg').map(s=>all(s,'trkpt'));
  if(!groups.some(g=>g.length>=2)) groups=all(doc,'rte').map(s=>all(s,'rtept'));
  let original=0;
  const segments=groups.filter(g=>g.length>=2).map(g=>g.map(el=>{
    const a=el.getAttribute('lat'),b=el.getAttribute('lon');const lat=Number(a),lon=Number(b);
    if(a===null||b===null||!a.trim()||!b.trim()||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw Error('GPX contains an invalid coordinate.');
    original++;return [Math.round(lat*1e6)/1e6,Math.round(lon*1e6)/1e6];
  }));
  if(!segments.length)throw Error('This GPX has no track or route with at least two points. Waypoints alone are not a route.');
  if(segments.length>100)throw Error('This file contains more than 100 route segments.');
  // Preserve all segment endpoints and sample the interior within a fixed total budget.
  let sampled=segments;
  if(original>2500){let stride=2;do{sampled=segments.map(seg=>seg.filter((_,i)=>i===0||i===seg.length-1||i%stride===0));stride++;}while(sampled.reduce((n,s)=>n+s.length,0)>2500);}
  const name=(all(doc,'name')[0]?.textContent?.trim()||filename.replace(/\.gpx$/i,'')||'Running route').slice(0,80);
  return {name,segments:sampled,original,points:sampled.reduce((n,s)=>n+s.length,0)};
}
