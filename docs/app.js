const $=id=>document.getElementById(id);
const api=window.TRACKER_API?.replace(/\/$/,'');
const map=L.map('map').setView([20,0],2);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
let marker,circle,point,busy=false,planned=null,actual=null,routeVersion,hasFitted=false,track=[];
function clearPoint(){if(marker)map.removeLayer(marker);if(circle)map.removeLayer(circle);marker=circle=point=null;$('time').textContent='—';}
function clearTrack(){track=[];if(actual)map.removeLayer(actual);actual=null;}
function message(text){$('overlay').hidden=false;$('overlay').textContent=text;}
function drawTrack(points,current){
  if(actual)map.removeLayer(actual);actual=null;track=points;
  const pts=[...points];if(current&&(!pts.length||current.tst>pts[pts.length-1].tst))pts.push(current);
  const segments=[];let segment=[];let previous;
  for(const p of pts){if(previous&&p.tst-previous.tst>180){if(segment.length)segments.push(segment);segment=[];}segment.push([p.lat,p.lon]);previous=p;}if(segment.length)segments.push(segment);
  if(segments.length)actual=L.polyline(segments,{color:'#197852',weight:5,opacity:.85}).addTo(map);
}
$('center').onclick=()=>{if(point)map.setView([point.lat,point.lon],15);else if(actual)map.fitBounds(actual.getBounds(),{padding:[35,35],maxZoom:16});};
$('routeFit').onclick=()=>{const bounds=planned?.getBounds();if(bounds?.isValid())map.fitBounds(bounds,{padding:[35,35],maxZoom:16});};
async function syncRoute(version){
  if(version===null){if(planned)map.removeLayer(planned);planned=null;routeVersion=null;$('routeName').textContent='No planned route';$('routeFit').disabled=true;return;}
  if(version===routeVersion)return;
  const r=await fetch(api+'/route',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('route');const route=await r.json();
  if(planned)map.removeLayer(planned);planned=null;
  if(route){planned=L.polyline(route.segments,{color:'#4968c9',weight:4,dashArray:'9 7',opacity:.85}).addTo(map);$('routeName').textContent=route.name;$('routeFit').disabled=false;routeVersion=route.version;if(!hasFitted){map.fitBounds(planned.getBounds(),{padding:[35,35],maxZoom:16});hasFitted=true;}}
  else{routeVersion=null;$('routeName').textContent='No planned route';$('routeFit').disabled=true;}
}
async function refresh(){if(busy||document.hidden)return;if(!api){message('Tracker setup in progress');$('status').textContent='Not connected yet';return;}busy=true;
try{
  const r=await fetch(api+'/location',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();const data=await r.json();
  let routeError=false;try{await syncRoute(data.routeVersion??null);}catch{if(planned)map.removeLayer(planned);planned=null;routeVersion=undefined;$('routeName').textContent='Route unavailable — retrying';$('routeFit').disabled=true;routeError=true;}
  const p=data.point;
  if(data.status==='paused'){clearPoint();clearTrack();$('badge').textContent='NOT SHARING';$('status').textContent='Paused';if(planned)$('overlay').hidden=true;else message(routeError?'Route unavailable — retrying':'Sharing is paused');return;}
  drawTrack(data.track||[],p);
  if(!p||Date.now()/1000-p.tst>900){clearPoint();$('badge').textContent='WAITING';$('status').textContent='Waiting for location';if(planned||actual)$('overlay').hidden=true;else message('Waiting for a fresh location');return;}
  point=p;$('overlay').hidden=true;$('badge').textContent=Date.now()/1000-p.tst>180?'LAST KNOWN':'SHARING';$('status').textContent=Date.now()/1000-p.tst>180?'Last known location':'Receiving updates';$('time').textContent=new Date(p.tst*1000).toLocaleTimeString();
  if(marker)marker.setLatLng([p.lat,p.lon]);else marker=L.circleMarker([p.lat,p.lon],{radius:9,color:'#fff',weight:3,fillColor:'#197852',fillOpacity:1}).addTo(map);
  if(circle)map.removeLayer(circle);if(p.acc!==null)circle=L.circle([p.lat,p.lon],{radius:p.acc,color:'#197852',weight:1,fillOpacity:.08}).addTo(map);
  if(!hasFitted){map.setView([p.lat,p.lon],15);hasFitted=true;}
}catch{clearPoint();clearTrack();message('Connection unavailable — retrying automatically');$('status').textContent='Connection unavailable';$('badge').textContent='OFFLINE';}finally{busy=false;}}
refresh();setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);
setInterval(()=>{if(point&&Date.now()/1000-point.tst>900){clearPoint();$('status').textContent='Location expired';$('badge').textContent='WAITING';}},5000);
