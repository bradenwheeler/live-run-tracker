import assert from 'node:assert/strict';
import {completedRoute} from '../docs/course-progress.mjs';
import {distanceMeters} from '../docs/mile-markers.mjs';
const segments=[[[0,0],[0,1]],[[1,1],[1,2]]];
const first=distanceMeters(...segments[0]);
assert.deepEqual(completedRoute(segments,0,[0,0]),[]);
assert.deepEqual(completedRoute(segments,first/2,[0,.5]),[[[0,0],[0,.5]]]);
assert.deepEqual(completedRoute(segments,first+10,[1,1.0001]),[segments[0],[[1,1],[1,1.0001]]]);
console.log('Completed course splitting and segment gaps passed');
