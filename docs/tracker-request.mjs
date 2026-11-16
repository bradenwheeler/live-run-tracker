export async function trackerRequest(url,fetchImpl=fetch){
  let response;
  try{response=await fetchImpl(url,{cache:'no-store',signal:AbortSignal.timeout(20000)});}catch(cause){throw Object.assign(new Error('Receiver request failed'),{kind:'connection',cause});}
  if(!response.ok)throw Object.assign(new Error('Receiver returned '+response.status),{kind:'connection',status:response.status});
  try{return await response.json();}catch(cause){throw Object.assign(new Error('Receiver returned invalid data'),{kind:'connection',cause});}
}
export const retryDelay=failures=>Math.min(60000,5000*2**Math.min(4,Math.max(0,failures-1)));
