import assert from 'node:assert/strict';
// Resolve the browser cache query through the same module in Node.
import {nearestRoutePoint} from '../docs/route-progress.mjs';
const lon=n=>n*1609.344/6371008.8*180/Math.PI;
let r=nearestRoutePoint([[[0,0],[0,lon(10)]]],{lat:.001,lon:lon(5)});
assert.ok(Math.abs(r.alongMiles-5)<.00001);assert.equal(r.lastMarker,4);assert.ok(Math.abs(r.position[0])<1e-8);assert.ok(r.offsetMeters>100);
r=nearestRoutePoint([[[0,0],[0,lon(10)]]],{lat:0,lon:lon(2)});assert.equal(r.lastMarker,2);
r=nearestRoutePoint([[[0,0],[0,lon(10)]]],{lat:0,lon:-1});assert.equal(r.lastMarker,0);
r=nearestRoutePoint([[[0,0],[0,lon(10)]]],{lat:0,lon:2});assert.equal(r.lastMarker,10);
r=nearestRoutePoint([[[0,0],[0,lon(1)]],[[1,0],[1,lon(3)]]],{lat:1,lon:lon(1.5)});assert.ok(Math.abs(r.alongMiles-2.5)<.001);assert.equal(r.lastMarker,2);
assert.equal(nearestRoutePoint([], {lat:0,lon:0}),null);
r=nearestRoutePoint([[[0,0],[0,0],[0,lon(3)]]],{lat:0,lon:lon(2.5)});assert.equal(r.lastMarker,2);
r=nearestRoutePoint([[[0,179.9],[0,-179.9]]],{lat:.001,lon:180});assert.ok(Math.abs(Math.abs(r.position[1])-180)<.0001);
console.log('Passed: perpendicular projection, cumulative distance, two-mile thresholds, clamped endpoints, disconnected segments, duplicates, and date-line crossing.');
