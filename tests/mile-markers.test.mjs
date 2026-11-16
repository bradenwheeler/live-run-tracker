import assert from 'node:assert/strict';
import {mileMarkers,distanceMeters} from '../docs/mile-markers.mjs';
const mile=1609.344,lonForMiles=n=>n*mile/6371008.8*180/Math.PI;
const line=n=>[[0,0],[0,lonForMiles(n)]];
let r=mileMarkers([line(10)]);
assert.equal(r.markers.length,5);assert.equal(r.markers[4].mile,10);
for(const m of r.markers)assert.ok(Math.abs(distanceMeters([0,0],m.position)-m.mile*mile)<.01);
assert.equal(mileMarkers([line(1.9)]).markers.length,0);
assert.equal(mileMarkers([[[0,0],[0,0],[0,lonForMiles(2)]]]).markers.length,1);
// A turn: mile two must be placed one mile into the second edge.
r=mileMarkers([[[0,0],[0,lonForMiles(1)],[lonForMiles(2),lonForMiles(1)]]]);
assert.equal(r.markers.length,1);assert.ok(Math.abs(r.markers[0].position[0]-lonForMiles(1))<1e-6);
// Ignore the distance between disconnected segments, but keep cumulative mileage.
r=mileMarkers([line(1),[[0,100],[0,100+lonForMiles(2)]]]);assert.equal(r.markers.length,1);assert.ok(r.markers[0].position[1]>100);
r=mileMarkers([[[0,179.99],[0,-179.9]]]);assert.ok(r.markers.length>0);assert.ok(r.markers[0].position[1]<-179.9||r.markers[0].position[1]>179.99);
assert.equal(mileMarkers([]).markers.length,0);
r=mileMarkers([line(2100)]);assert.equal(r.markers.length,1000);assert.equal(r.truncated,true);
console.log('Passed: 2-mile spacing, exact endpoint, turns, zero-length edges, short routes, disconnected segments, date-line interpolation, marker-count bound.');
