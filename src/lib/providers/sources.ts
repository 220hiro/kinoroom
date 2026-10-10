import {z} from 'zod';
import type {MediaSourceProvider,MediaSource,SourceInput} from '@/lib/types';
import {publicSources} from './catalog';
import {hasTMDB,tmdb} from './metadata';
export class OpenFilmsProvider implements MediaSourceProvider {
 id='open-films';name='Blender Open Movies';
 async search(input:SourceInput){return input.type==='movie'?publicSources(input.tmdbId):[];}
 async resolve(source:MediaSource){return {...source,resolvedAt:Date.now()};}
}
export class WatchProvidersProvider implements MediaSourceProvider {
 id='watch-providers';name='JustWatch';
 async search(input:SourceInput):Promise<MediaSource[]>{
  if(!hasTMDB())return [];
  type Provider={provider_id:number;provider_name:string};type Country={link:string;flatrate?:Provider[];rent?:Provider[];buy?:Provider[];free?:Provider[];ads?:Provider[]};
  const r=await tmdb<{results:Record<string,Country>}>(`${input.type}/${input.tmdbId}/watch/providers`);const c=r.results[process.env.WATCH_REGION||'KZ'];if(!c)return [];
  return [...new Map([...(c.flatrate||[]),...(c.free||[]),...(c.ads||[]),...(c.rent||[]),...(c.buy||[])].map(p=>[p.provider_id,p])).values()].map(p=>({id:`watch-${p.provider_id}`,provider:this.id,providerName:p.provider_name,category:'EXTERNAL',format:'external',url:c.link,audioTracks:[],subtitles:[],stable:true}));
 }
 async resolve(s:MediaSource){return {...s,resolvedAt:Date.now()};}
}
const https=z.string().url().refine(s=>new URL(s).protocol==='https:','HTTPS required');
const entry=z.object({tmdbId:z.number().int().positive(),type:z.enum(['movie','tv']),season:z.number().int().positive().optional(),episode:z.number().int().positive().optional(),id:z.string(),name:z.string(),url:https,format:z.enum(['mp4','webm','hls','dash','embed','external']),resolution:z.number().optional(),license:z.string().min(1),audioTracks:z.array(z.object({id:z.string(),language:z.string(),label:z.string(),original:z.boolean().optional()})).default([]),subtitles:z.array(z.object({id:z.string(),language:z.enum(['en','ru']),label:z.string(),url:https})).default([])}).refine(x=>x.type!=='tv'||(x.season!==undefined&&x.episode!==undefined),'TV entries require episode identity');
export class LicensedCatalogProvider implements MediaSourceProvider {
 id='licensed';name='Личная медиатека';
 async search(input:SourceInput):Promise<MediaSource[]>{
  if(!process.env.MEDIA_CATALOG_JSON)return [];
  const entries=z.array(entry).parse(JSON.parse(process.env.MEDIA_CATALOG_JSON));
  return entries.filter(e=>e.tmdbId===input.tmdbId&&e.type===input.type&&(e.type==='movie'||e.season===input.season&&e.episode===input.episode)).map(e=>({id:e.id,provider:this.id,providerName:e.name,url:e.url,format:e.format,category:e.format==='embed'?'EMBED':e.format==='external'?'EXTERNAL':'DIRECT',resolution:e.resolution,audioTracks:e.audioTracks,subtitles:e.subtitles.map(s=>({...s,provider:'licensed',score:90})),stable:true,license:e.license}));
 }
 async resolve(s:MediaSource){return {...s,resolvedAt:Date.now()};}
}
export const sourceProviders:MediaSourceProvider[]=[new OpenFilmsProvider(),new LicensedCatalogProvider(),new WatchProvidersProvider()];
