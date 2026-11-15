const $=id=>document.getElementById(id);
const api=window.TRACKER_API?.replace(/\/$/,'');
const map=L.map('map').setView([20,0],2);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
let marker,circle,point,busy=false;
function clear(message){if(marker)map.removeLayer(marker);if(circle)map.removeLayer(circle);marker=circle=point=null;$('overlay').hidden=false;$('overlay').textContent=message;$('time').textContent='—';$('badge').textContent='NOT SHARING';}
$('center').onclick=()=>{if(point)map.setView([point.lat,point.lon],15);};
async function refresh(){if(busy||document.hidden)return;if(!api){clear('Tracker setup in progress');$('status').textContent='Not connected yet';return;}busy=true;
try{const r=await fetch(api+'/location',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();const data=await r.json();const p=data.point;
if(!p||Date.now()/1000-p.tst>900){clear(data.status==='paused'?'Sharing is paused':'Waiting for a fresh location');$('status').textContent=data.status==='paused'?'Paused':'Waiting';return;}
const first=!marker;point=p;$('overlay').hidden=true;$('badge').textContent=Date.now()/1000-p.tst>180?'LAST KNOWN':'SHARING';$('status').textContent=Date.now()/1000-p.tst>180?'Last known location':'Receiving updates';$('time').textContent=new Date(p.tst*1000).toLocaleTimeString();
if(marker)marker.setLatLng([p.lat,p.lon]);else marker=L.circleMarker([p.lat,p.lon],{radius:9,color:'#fff',weight:3,fillColor:'#197852',fillOpacity:1}).addTo(map);
if(circle)map.removeLayer(circle);if(p.acc!==null)circle=L.circle([p.lat,p.lon],{radius:p.acc,color:'#197852',weight:1,fillOpacity:.08}).addTo(map);if(first)map.setView([p.lat,p.lon],15);
}catch{clear('Connection unavailable — retrying automatically');$('status').textContent='Connection unavailable';}finally{busy=false;}}
refresh();setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);
// Clear expired points even between refreshes or after a suspended tab resumes.
setInterval(()=>{if(point&&Date.now()/1000-point.tst>900){clear('Waiting for a fresh location');$('status').textContent='Location expired';}},5000);
