export function cleanTorrentQuery(query: string): string {
  return query
    .replace(/\b(19\d\d|20\d\d)\b/g, '') // remove 4-digit release years that break sphinx search
    .replace(/[:\-—–_()[\]{}«»"']/g, ' ')  // remove punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectTranslation(rawTitle: string): string | undefined {
  if (/Red\s*Head\s*Sound|RHS/i.test(rawTitle)) return 'Red Head Sound';
  if (/LostFilm|Лостфильм/i.test(rawTitle)) return 'LostFilm';
  if (/HDRezka|Rezka|Резка/i.test(rawTitle)) return 'HDRezka';
  if (/Кубик\s*в\s*Кубе/i.test(rawTitle)) return 'Кубик в кубе';
  if (/Студийная\s*Банда|StudioBand/i.test(rawTitle)) return 'Студийная Банда';
  if (/AniLibria|Анилибрия/i.test(rawTitle)) return 'AniLibria';
  if (/AnimeVost|Анимевост/i.test(rawTitle)) return 'AnimeVost';
  if (/NewStudio/i.test(rawTitle)) return 'NewStudio';
  if (/AlexFilm/i.test(rawTitle)) return 'AlexFilm';
  if (/TVShows/i.test(rawTitle)) return 'TVShows';
  if (/Гоблин|Пучков/i.test(rawTitle)) return 'Гоблин (П/П)';
  if (/(?:\|\s*|\[|\(|\b)(?:D|ДБ|Дубляж|Дублированный)(?:\s*\||\]|\)|\b)/i.test(rawTitle)) return 'Дубляж';
  if (/(?:\|\s*|\[|\(|\b)(?:MVO|П|Многоголосый|Проф\.\s*многоголосый)(?:\s*\||\]|\)|\b)/i.test(rawTitle)) return 'Многоголосый';
  if (/ТВ-?3|ТВ3/i.test(rawTitle)) return 'ТВ-3';
  if (/Кураж\s*[-–]?\s*Бамбей/i.test(rawTitle)) return 'Кураж-Бамбей';
  if (/BaibaKo|Байбако/i.test(rawTitle)) return 'BaibaKo';
  if (/Кравец/i.test(rawTitle)) return 'Кравец-Рекордз';
  if (/Jaskier|Яскьер/i.test(rawTitle)) return 'Jaskier';
  if (/(?:\|\s*|\[|\(|\b)(?:AVO|Авторский|Одноголосый|А)(?:\s*\||\]|\)|\b)/i.test(rawTitle)) return 'Авторский';
  if (/Субтитры|Subtitles|SoftSub/i.test(rawTitle)) return 'Субтитры';
  return undefined;
}

export const DEFAULT_TRACKERS = [
  'udp://opentor.net:6969',
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://explodie.org:6969/announce',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz'
];

export function enrichMagnet(magnet: string, additionalTrackers?: string[]): string {
  let enriched = magnet;
  const list = additionalTrackers ? [...additionalTrackers, ...DEFAULT_TRACKERS] : DEFAULT_TRACKERS;
  for (const tr of list) {
    if (!enriched.includes(encodeURIComponent(tr)) && !enriched.includes(tr)) {
      enriched += `&tr=${encodeURIComponent(tr)}`;
    }
  }
  return enriched;
}

export function formatBytes(bytes: number, decimals = 1) {
  if (!bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
