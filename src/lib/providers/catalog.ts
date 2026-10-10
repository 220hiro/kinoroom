import type {Media,MediaSource,SubtitleTrack} from '@/lib/types';
export const openCatalog:Media[] = [
 {id:45745,type:'movie',title:'Синтел',originalTitle:'Sintel',year:2010,overview:'В поисках маленького дракона одинокая путешественница пересекает заснеженные горы. История о дружбе, привязанности и цене долгого пути.',poster:'/art/sintel.jpg',backdrop:'/art/sintel.jpg',runtime:15,genres:['Фэнтези','Приключения','Анимация'],cast:['Halina Reijn','Thom Hoffman'],originalLanguage:'en',imdbId:'tt1727587',license:'CC BY 3.0 · Blender Foundation'},
 {id:133701,type:'movie',title:'Слёзы стали',originalTitle:'Tears of Steel',year:2012,overview:'В будущем Амстердаме группа учёных пытается восстановить события прошлого, чтобы остановить войну с машинами.',poster:'/art/tears.jpg',backdrop:'/art/tears.jpg',runtime:12,genres:['Фантастика','Короткометражный'],cast:['Derek de Lint','Sergio Hasselbaink','Vanja Rukavina','Denise Rebergen'],originalLanguage:'en',imdbId:'tt2285752',license:'CC BY 3.0 · Blender Foundation'},
 {id:10378,type:'movie',title:'Большой Бак',originalTitle:'Big Buck Bunny',year:2008,overview:'Тихий день большого добродушного кролика превращается в приключение, когда лесные хулиганы нарушают его покой.',poster:'/art/bunny.jpg',backdrop:'/art/bunny.jpg',runtime:10,genres:['Комедия','Анимация'],cast:[],originalLanguage:'und',imdbId:'tt1254207',license:'CC BY 3.0 · Blender Foundation'},
 {id:18573,type:'movie',title:'Мечта слонов',originalTitle:'Elephants Dream',year:2006,overview:'Два странника исследуют механический мир, который меняется вместе с их воображением. Первый открытый фильм Blender.',poster:'/art/elephants.jpg',backdrop:'/art/elephants.jpg',runtime:11,genres:['Фантастика','Анимация'],cast:['Cas Jansen','Tygo Gernandt'],originalLanguage:'en',imdbId:'tt0807840',license:'CC BY 2.5 · Blender Foundation'},
];
export function openSubtitles(id:number):SubtitleTrack[] {
 if(id===45745)return (['en','ru'] as const).map(l=>({id:`sintel-${l}`,provider:'open',language:l,label:`${l==='en'?'English':'Русский'} · Blender`,url:`/subtitles/sintel-${l}.vtt`,score:100}));
 if(id===133701)return (['en','ru'] as const).map(l=>({id:`tears-${l}`,provider:'open',language:l,label:`${l==='en'?'English':'Русский'} · Blender`,url:`/subtitles/tears-${l}.srt`,score:100}));
 return [];
}
export function publicSources(id:number):MediaSource[] {
 const film=openCatalog.find(x=>x.id===id);if(!film)return [];
 const common={provider:'open-films',providerName:'Blender Open Movies',category:'PUBLIC' as const,audioTracks:[{id:'original',language:film.originalLanguage,label:film.originalLanguage==='und'?'Без диалогов':'Original — English',original:true}],subtitles:openSubtitles(id),stable:true,license:film.license};
 if(id===45745)return [
  {...common,id:'sintel-dash',format:'dash',url:'https://storage.googleapis.com/shaka-demo-assets/sintel/dash.mpd',resolution:1080},
  {...common,id:'sintel-trailer',format:'mp4',url:'https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4',resolution:480,subtitles:[]}
 ].slice(0,1) as MediaSource[];
 const urls:Record<number,string>={133701:'https://media.xiph.org/mango/tears_of_steel_1080p.webm',10378:'https://storage.googleapis.com/shaka-demo-assets/bbb-dark-truths/dash.mpd',18573:'https://download.blender.org/ED/ED_1024.avi'};
 return [{...common,id:`open-${id}`,format:id===10378?'dash':'webm',url:urls[id],resolution:1080}];
}
