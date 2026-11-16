import assert from 'node:assert/strict';
import {trackerRequest,retryDelay} from '../docs/tracker-request.mjs';
await assert.rejects(()=>trackerRequest('https://example.invalid',async()=>{throw Error('offline');}),e=>e.kind==='connection');
await assert.rejects(()=>trackerRequest('https://example.invalid',async()=>new Response('',{status:503})),e=>e.status===503);
await assert.rejects(()=>trackerRequest('https://example.invalid',async()=>new Response('not json')),e=>e.kind==='connection');
assert.equal((await trackerRequest('https://example.invalid',async()=>Response.json({ok:true}))).ok,true);
assert.equal(retryDelay(1),5000);assert.equal(retryDelay(2),10000);assert.equal(retryDelay(10),60000);
console.log('Passed: network/HTTP/invalid-response failures, recovery and bounded retry delays.');
