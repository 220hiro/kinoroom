export class TTLCache {
 private values = new Map<string,{expires:number;value:unknown}>();
 private pending = new Map<string,Promise<unknown>>();
 constructor(private max=300) {}
 get<T>(key:string):T|undefined { const hit=this.values.get(key); if(!hit)return; if(hit.expires<=Date.now()){this.values.delete(key);return;} return hit.value as T; }
 set<T>(key:string,value:T,ttl:number) { if(this.values.size>=this.max)this.values.delete(this.values.keys().next().value!);this.values.set(key,{value,expires:Date.now()+ttl});return value; }
 delete(key:string){this.values.delete(key);}
 async remember<T>(key:string,ttl:number,load:()=>Promise<T>):Promise<T> { const hit=this.get<T>(key);if(hit!==undefined)return hit;const pending=this.pending.get(key);if(pending)return pending as Promise<T>; const task=load().then(v=>this.set(key,v,ttl)).finally(()=>this.pending.delete(key));this.pending.set(key,task);return task; }
}
export const cache = new TTLCache();
export const HOUR = 3_600_000;
export async function fetchJSON<T>(url:string,init?:RequestInit):Promise<T> { const r=await fetch(url,{...init,signal:AbortSignal.timeout(12_000)});if(!r.ok)throw new Error(`Upstream HTTP ${r.status}`);return r.json() as Promise<T>; }
