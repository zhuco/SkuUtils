// This adapter deliberately supports one configured OpenAI-compatible endpoint,
// n=1, PNG and base64 only. Never trust client model, URL, n, price or credentials.
export function png(value) {
 if(typeof value!=='string'||value.length>28_000_000||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw Error('invalid image');
 const bytes=Buffer.from(value,'base64');if(bytes.length<8||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('not PNG');return bytes;
}
export async function generate(payload,config) {
 // Missing configuration is a definite local failure before dispatch.
 if(!config.apiKey||!config.model||!config.endpoint)return {status:'failed',note:'模型尚未配置，未调用上游'};
 try {
  const response=await fetch(config.endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(180000),headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.apiKey}`},body:JSON.stringify({model:config.model,prompt:payload.prompt,n:1,size:'1024x1024',response_format:'b64_json'})});
  // Even HTTP errors can be ambiguous with third-party proxies. Only an audited
  // provider adapter should classify documented rejection codes as definite failure.
  if(!response.ok)return {status:'unknown'};
  const reader=response.body.getReader();let size=0;const parts=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>30_000_000){await reader.cancel();return {status:'unknown'};}parts.push(Buffer.from(value));}
  const body=JSON.parse(Buffer.concat(parts).toString());if(body.data?.length!==1)return {status:'unknown'};
  return {status:'succeeded',image:png(body.data[0].b64_json)};
 }catch{return {status:'unknown'};}
}
