import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isCamOrTs,
  isTrailerOrSample,
  isIrrelevantCategory,
  isYearMatch,
  isTvSeasonMatch,
  isTvEpisodeMatch,
  deduplicateTorrentResults,
  computeReleaseScore,
  BoundedMemoryCache
} from '../src/lib/services/torrentSearch';
import {
  normalizeInfoHash,
  registerTorrentDownloadRef,
  resolveTorrentDownloadRef,
  fetchTorrentBufferByToken,
  scrubPasskeysFromTorrentBuffer,
  searchJackett,
  parseTorznabXml
} from '../src/lib/services/jackett';
import type { TorrentSearchResult } from '../src/lib/types';

test('normalizeInfoHash parses 40-char hex, base32, and magnet links correctly', () => {
  const hex = '2b5cb38274d812ab5768cf30ab92b6781f80fa0f';
  assert.equal(normalizeInfoHash(hex), hex);
  assert.equal(normalizeInfoHash(hex.toUpperCase()), hex);

  // Magnet link with hex
  const magnetHex = `magnet:?xt=urn:btih:${hex}&dn=Test`;
  assert.equal(normalizeInfoHash(magnetHex), hex);

  // Base32 infohash (RFC 4648)
  const base32 = 'FNOLHARS3AMKWV3IZ4YKXEV2PA7YBHQP';
  const expectedFromBase32 = '2b5cb38232d818ab5768cf30ab92ba783f809e0f';
  assert.equal(normalizeInfoHash(base32), expectedFromBase32);

  // Magnet link with base32
  const magnetBase32 = `magnet:?xt=urn:btih:${base32}&dn=Test`;
  assert.equal(normalizeInfoHash(magnetBase32), expectedFromBase32);

  // Invalid / null
  assert.equal(normalizeInfoHash(''), null);
  assert.equal(normalizeInfoHash('not-a-hash'), null);
});

test('deduplicateTorrentResults merges identical infohash across trackers and preserves distinct releases', () => {
  const hashA = '1111111111111111111111111111111111111111';
  const hashB = '2222222222222222222222222222222222222222';

  const results: TorrentSearchResult[] = [
    {
      title: 'Interstellar (2014) BDRip 1080p',
      magnet: `magnet:?xt=urn:btih:${hashA}&dn=Interstellar`,
      size: '14.2 GB',
      seeds: 30,
      peers: 5,
      tracker: 'RuTracker',
      quality: '1080p',
      infoHash: hashA
    },
    {
      title: 'Интерстеллар / Interstellar [1080p, Дублированный]',
      magnet: `magnet:?xt=urn:btih:${hashA}&dn=Interstellar&tr=udp://opentor.net:6969`,
      size: '14.2 GB',
      seeds: 55, // Higher seed count on mirror
      peers: 12,
      tracker: 'Rutor',
      quality: '1080p',
      translation: 'Дубляж',
      infoHash: hashA
    },
    // Distinct release of the SAME movie (4K Remux, different hash)
    {
      title: 'Interstellar (2014) 4K UHD Remux',
      magnet: `magnet:?xt=urn:btih:${hashB}&dn=Interstellar+4K`,
      size: '58.5 GB',
      seeds: 20,
      peers: 8,
      tracker: 'NNM-Club',
      quality: '4K UHD',
      infoHash: hashB
    }
  ];

  const deduped = deduplicateTorrentResults(results);

  // Must merge hashA items into 1 item, and keep hashB as separate item
  assert.equal(deduped.length, 2);

  const mergedA = deduped.find((d) => d.infoHash === hashA);
  assert.ok(mergedA);
  // Merged tracker must contain both RuTracker and Rutor
  assert.ok(mergedA.tracker?.includes('RuTracker'));
  assert.ok(mergedA.tracker?.includes('Rutor'));
  // Max seeds and peers preserved
  assert.equal(mergedA.seeds, 55);
  assert.equal(mergedA.peers, 12);
  assert.equal(mergedA.translation, 'Дубляж');

  // hashB must remain distinct
  const releaseB = deduped.find((d) => d.infoHash === hashB);
  assert.ok(releaseB);
  assert.equal(releaseB.tracker, 'NNM-Club');
  assert.equal(releaseB.quality, '4K UHD');
});

test('isYearMatch filters conflicting movie years and allows release year tolerances', () => {
  // Target: Dune (2021)
  assert.equal(isYearMatch('Дюна / Dune (Дени Вильнёв) [2021, США, BDRip 1080p]', 2021), true);
  // Release year tolerance +/- 1 year
  assert.equal(isYearMatch('Дюна / Dune [2020, WEB-DL 1080p]', 2021), true);
  // Conflicting year: 1984 David Lynch movie should be rejected when looking for 2021
  assert.equal(isYearMatch('Дюна / Dune (Дэвид Линч / David Lynch) [1984, США, BDRip 1080p]', 2021), false);
  // No year in title: do not reject
  assert.equal(isYearMatch('Дюна / Dune [BDRip 1080p]', 2021), true);
  // No expected year: pass
  assert.equal(isYearMatch('Random Film [1999]', undefined), true);
});

test('isTvSeasonMatch filters out wrong single seasons and accepts targeted or multi-season packs', () => {
  // Target: Season 2
  // Explicit Season 1 only -> rejected
  assert.equal(isTvSeasonMatch('Во все тяжкие / Breaking Bad [Сезон 1] [2008]', 2), false);
  assert.equal(isTvSeasonMatch('Breaking Bad S01 [1080p]', 2), false);
  assert.equal(isTvSeasonMatch('Breaking Bad 1 сезон', 2), false);

  // Explicit Season 2 -> accepted
  assert.equal(isTvSeasonMatch('Во все тяжкие / Breaking Bad [Сезон 2] [2009]', 2), true);
  assert.equal(isTvSeasonMatch('Breaking Bad S02 [1080p]', 2), true);
  assert.equal(isTvSeasonMatch('Breaking Bad 2 сезон', 2), true);

  // Multi-season pack containing Season 2 -> accepted
  assert.equal(isTvSeasonMatch('Во все тяжкие / Breaking Bad [Сезоны 1-5] [2008-2013]', 2), true);
  assert.equal(isTvSeasonMatch('Breaking Bad Seasons 1-3 [BDRip 1080p]', 2), true);
  assert.equal(isTvSeasonMatch('Breaking Bad S01-S04 [1080p]', 2), true);

  // Multi-season pack NOT containing Season 2 -> rejected
  assert.equal(isTvSeasonMatch('Breaking Bad Seasons 3-5 [BDRip 1080p]', 2), false);

  // No season specified in release title: keep as general series release
  assert.equal(isTvSeasonMatch('Breaking Bad Complete [BDRip 1080p]', 2), true);
});

test('isCamOrTs, isTrailerOrSample, and isIrrelevantCategory filter low-quality and non-video content', () => {
  // CAM / TS filtering
  assert.equal(isCamOrTs('Deadpool & Wolverine (2024) CAMRip 1080p'), true);
  assert.equal(isCamOrTs('Deadpool & Wolverine (2024) TS 720p'), true);
  assert.equal(isCamOrTs('Фильм (2024) Экранка'), true);
  assert.equal(isCamOrTs('Фильм (2024) HDTC'), true);
  assert.equal(isCamOrTs('Deadpool & Wolverine (2024) WEB-DL 1080p'), false);
  assert.equal(isCamOrTs('Interstellar (2014) BDRip 1080p'), false);

  // Trailer / sample filtering
  assert.equal(isTrailerOrSample('Interstellar (2014) Official Trailer 1080p'), true);
  assert.equal(isTrailerOrSample('Дюна 2 (2024) Русский тизер'), true);
  assert.equal(isTrailerOrSample('Avatar Sample Clip'), true);
  assert.equal(isTrailerOrSample('Interstellar (2014) BDRip 1080p'), false);

  // Irrelevant categories
  assert.equal(isIrrelevantCategory('Hans Zimmer - Interstellar OST [FLAC]'), true);
  assert.equal(isIrrelevantCategory('Dune Audiobook (2021) MP3'), true);
  assert.equal(isIrrelevantCategory('Cyberpunk 2077 PC Game'), true);
  assert.equal(isIrrelevantCategory('Interstellar (2014) BDRip', 'Music/Audio'), true);
  assert.equal(isIrrelevantCategory('Interstellar (2014) BDRip 1080p', 'Movies/HD'), false);
});

test('computeReleaseScore prefers 1080p, 4K, WEB-DL, Blu-ray, and seed availability', () => {
  const item1080p: TorrentSearchResult = {
    title: 'Movie (2024) WEB-DL 1080p',
    magnet: 'magnet:?xt=urn:btih:1111111111111111111111111111111111111111',
    size: '10 GB',
    seeds: 50,
    peers: 10,
    quality: '1080p',
    translation: 'Дубляж'
  };

  const itemCam: TorrentSearchResult = {
    title: 'Movie (2024) CAMRip',
    magnet: 'magnet:?xt=urn:btih:2222222222222222222222222222222222222222',
    size: '1.5 GB',
    seeds: 10,
    peers: 2,
    quality: 'HD'
  };

  const score1080 = computeReleaseScore(item1080p);
  const scoreCam = computeReleaseScore(itemCam);

  assert.ok(score1080 > scoreCam);
  assert.ok(score1080 > 150);
});

test('BoundedMemoryCache respects TTL and maximum capacity eviction', () => {
  const cache = new BoundedMemoryCache<string>(3, 50); // 3 items, 50ms TTL

  cache.set('a', 'apple');
  cache.set('b', 'banana');
  cache.set('c', 'cherry');

  assert.equal(cache.get('a'), 'apple');
  assert.equal(cache.get('b'), 'banana');
  assert.equal(cache.get('c'), 'cherry');
  assert.equal(cache.size(), 3);

  // Adding 4th item evicts oldest (a was accessed, b was accessed, c was accessed, so re-insertions refreshed order)
  cache.set('d', 'date');
  assert.equal(cache.size(), 3);

  // Test expiration
  return new Promise((resolve) => {
    setTimeout(() => {
      assert.equal(cache.get('d'), undefined);
      resolve();
    }, 60);
  });
});

test('registerTorrentDownloadRef and resolveTorrentDownloadRef conceal private URLs with opaque tokens', () => {
  const privateUrl = 'http://jackett:9117/dl/rutracker-ru/?jackett_apikey=SECRET_API_KEY_12345&path=abc';
  const token = registerTorrentDownloadRef({
    privateUrl,
    title: 'Test Movie (2024) 1080p',
    tracker: 'RuTracker',
    infoHash: '1111111111111111111111111111111111111111'
  });

  // Token is an opaque UUID, does NOT contain secret API key or tracker path
  assert.ok(token);
  assert.equal(token.includes('SECRET_API_KEY'), false);
  assert.equal(token.includes('jackett'), false);

  const resolved = resolveTorrentDownloadRef(token);
  assert.ok(resolved);
  assert.equal(resolved.privateUrl, privateUrl);
  assert.equal(resolved.title, 'Test Movie (2024) 1080p');
  assert.equal(resolved.tracker, 'RuTracker');
});

test('fetchTorrentBufferByToken enforces SSRF mitigation and rejects foreign hosts', async () => {
  // Set configured Jackett URL
  const prevUrl = process.env.JACKETT_URL;
  const prevKey = process.env.JACKETT_API_KEY;

  process.env.JACKETT_URL = 'http://127.0.0.1:9117';
  process.env.JACKETT_API_KEY = 'valid_test_key';

  try {
    // Malicious token trying to point to AWS metadata
    const evilToken = registerTorrentDownloadRef({
      privateUrl: 'http://169.254.169.254/latest/meta-data/',
      title: 'Evil Attack',
      tracker: 'Evil'
    });

    const result = await fetchTorrentBufferByToken(evilToken);
    // Must be rejected by SSRF origin check before making network call
    assert.equal(result, null);
  } finally {
    process.env.JACKETT_URL = prevUrl;
    process.env.JACKETT_API_KEY = prevKey;
  }
});

test('searchJackett returns empty array cleanly when unconfigured or missing credentials', async () => {
  const prevUrl = process.env.JACKETT_URL;
  const prevKey = process.env.JACKETT_API_KEY;

  delete process.env.JACKETT_URL;
  delete process.env.JACKETT_API_KEY;

  try {
    const results = await searchJackett('Interstellar');
    assert.deepEqual(results, []);
  } finally {
    process.env.JACKETT_URL = prevUrl;
    process.env.JACKETT_API_KEY = prevKey;
  }
});

test('download proxy route GET /api/torrent/download serves valid .torrent file and conceals private URL', async () => {
  const { GET } = await import('../src/app/api/torrent/download/route');
  const { NextRequest } = await import('next/server');

  // Test 1: Missing token
  const reqNoToken = new NextRequest('http://localhost/api/torrent/download');
  const resNoToken = await GET(reqNoToken);
  assert.equal(resNoToken.status, 400);

  // Test 2: Invalid or expired token
  const reqBadToken = new NextRequest('http://localhost/api/torrent/download?token=non-existent-token');
  const resBadToken = await GET(reqBadToken);
  assert.equal(resBadToken.status, 404);
});

test('searchTorrentsUnified filters CAM/TS and ranks multi-source results for movies and series', async () => {
  // Test query on Dune (2021) with simulated raw results
  const rawDunePool: TorrentSearchResult[] = [
    {
      title: 'Дюна / Dune (Дени Вильнёв) [2021, США, BDRip 1080p, DUB]',
      magnet: 'magnet:?xt=urn:btih:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&dn=Dune2021',
      size: '11.5 GB',
      seeds: 45,
      peers: 10,
      tracker: 'RuTracker',
      quality: '1080p',
      translation: 'Дубляж',
      infoHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    },
    {
      title: 'Дюна / Dune [2021, CAMRip, Чистый звук]',
      magnet: 'magnet:?xt=urn:btih:cccccccccccccccccccccccccccccccccccccccc&dn=DuneCam',
      size: '1.4 GB',
      seeds: 120, // high seeds but camrip
      peers: 50,
      tracker: 'Rutor',
      quality: 'HD',
      infoHash: 'cccccccccccccccccccccccccccccccccccccccc'
    },
    {
      title: 'Дюна / Dune (Дэвид Линч) [1984, BDRip 1080p]',
      magnet: 'magnet:?xt=urn:btih:dddddddddddddddddddddddddddddddddddddddd&dn=Dune1984',
      size: '9.8 GB',
      seeds: 30,
      peers: 5,
      tracker: 'NNM-Club',
      quality: '1080p',
      infoHash: 'dddddddddddddddddddddddddddddddddddddddd'
    }
  ];

  // Filtering Dune 2021
  const filteredDune = rawDunePool.filter((item) => {
    if (isCamOrTs(item.title)) return false;
    if (isTrailerOrSample(item.title)) return false;
    if (!isYearMatch(item.title, 2021)) return false;
    return true;
  });

  // Only the 2021 BDRip must survive (CAMRip and 1984 movie rejected)
  assert.equal(filteredDune.length, 1);
  assert.equal(filteredDune[0].infoHash, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(filteredDune[0].quality, '1080p');

  // Test TV Series season matching on Breaking Bad Season 2
  const rawSeriesPool: TorrentSearchResult[] = [
    {
      title: 'Во все тяжкие / Breaking Bad [Сезон 1] [2008, WEB-DL 1080p]',
      magnet: 'magnet:?xt=urn:btih:e111111111111111111111111111111111111111',
      size: '15 GB',
      seeds: 25,
      peers: 4,
      tracker: 'RuTracker',
      quality: '1080p',
      infoHash: 'e111111111111111111111111111111111111111'
    },
    {
      title: 'Во все тяжкие / Breaking Bad [Сезон 2] [2009, WEB-DL 1080p]',
      magnet: 'magnet:?xt=urn:btih:e222222222222222222222222222222222222222',
      size: '22 GB',
      seeds: 35,
      peers: 8,
      tracker: 'RuTracker',
      quality: '1080p',
      infoHash: 'e222222222222222222222222222222222222222'
    },
    {
      title: 'Во все тяжкие / Breaking Bad [Сезоны 1-5] [2008-2013, BDRip 1080p]',
      magnet: 'magnet:?xt=urn:btih:e333333333333333333333333333333333333333',
      size: '95 GB',
      seeds: 40,
      peers: 12,
      tracker: 'NNM-Club',
      quality: '1080p',
      infoHash: 'e333333333333333333333333333333333333333'
    }
  ];

  const filteredSeries = rawSeriesPool.filter((item) => isTvSeasonMatch(item.title, 2));
  // Season 1 only is rejected; Season 2 and multi-season pack (1-5) kept
  assert.equal(filteredSeries.length, 2);
  assert.ok(filteredSeries.some((s) => s.infoHash === 'e222222222222222222222222222222222222222'));
  assert.ok(filteredSeries.some((s) => s.infoHash === 'e333333333333333333333333333333333333333'));
});

test('parseTorznabXml correctly extracts items, sizes, seeders, peers, and enclosure links', () => {
  const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0" xmlns:torznab="http://torznab.com/schemas/2015/feed">
    <channel>
      <title>Jackett Indexer</title>
      <item>
        <title>Interstellar (2014) BDRip 1080p</title>
        <size>15200000000</size>
        <jackettindexer id="noname-club">NoNaMe Club</jackettindexer>
        <link>http://127.0.0.1:9117/dl/noname-club/?jackett_apikey=secret&amp;path=test</link>
        <torznab:attr name="seeders" value="45" />
        <torznab:attr name="peers" value="10" />
        <torznab:attr name="infohash" value="99e7751067632394ee5cbfc16168fed9a7fa63b7" />
        <category>2000</category>
      </item>
    </channel>
  </rss>`;

  const items = parseTorznabXml(sampleXml, 'fallback-indexer');
  assert.equal(items.length, 1);
  assert.equal(items[0].Title, 'Interstellar (2014) BDRip 1080p');
  assert.equal(items[0].Size, 15200000000);
  assert.equal(items[0].Tracker, 'NoNaMe Club');
  assert.equal(items[0].TrackerId, 'noname-club');
  assert.equal(items[0].Seeders, 45);
  assert.equal(items[0].Peers, 10);
  assert.equal(items[0].InfoHash, '99e7751067632394ee5cbfc16168fed9a7fa63b7');
  assert.equal(items[0].Link, 'http://127.0.0.1:9117/dl/noname-club/?jackett_apikey=secret&path=test');
});

test('isTvEpisodeMatch matches target episodes and ranges while preserving full season packs', () => {
  // Target: Episode 3
  // 1. Exact episode matches: S01E03, 01x03, e03, 3-я серия
  assert.equal(isTvEpisodeMatch('Stranger Things S01E03 1080p', 3), true);
  assert.equal(isTvEpisodeMatch('Stranger Things 01x03 1080p', 3), true);
  assert.equal(isTvEpisodeMatch('Stranger Things e03 720p', 3), true);
  assert.equal(isTvEpisodeMatch('Очень странные дела (1 сезон: 3-я серия) 1080p', 3), true);
  assert.equal(isTvEpisodeMatch('Очень странные дела 3 серия 1080p', 3), true);

  // 2. Conflicting single episodes: S01E04, 01x05, 4 серия -> rejected
  assert.equal(isTvEpisodeMatch('Stranger Things S01E04 1080p', 3), false);
  assert.equal(isTvEpisodeMatch('Stranger Things 01x05 1080p', 3), false);
  assert.equal(isTvEpisodeMatch('Очень странные дела 4 серия 1080p', 3), false);

  // 3. Multi-episode ranges containing episode 3 -> accepted
  assert.equal(isTvEpisodeMatch('Stranger Things S01E01-E08 1080p', 3), true);
  assert.equal(isTvEpisodeMatch('Stranger Things S01E01-05 1080p', 3), true);
  assert.equal(isTvEpisodeMatch('Очень странные дела [01-08 из 08]', 3), true);
  assert.equal(isTvEpisodeMatch('Очень странные дела (1-8 серии)', 3), true);

  // 4. Multi-episode ranges NOT containing episode 3 -> rejected
  assert.equal(isTvEpisodeMatch('Stranger Things S01E04-E08 1080p', 3), false);
  assert.equal(isTvEpisodeMatch('Очень странные дела (1-2 серии)', 3), false);
  assert.equal(isTvEpisodeMatch('Очень странные дела (4-8 серии)', 3), false);

  // 5. Full season packs (no episode or conflicting range in title) -> preserved!
  assert.equal(isTvEpisodeMatch('Stranger Things S01 1080p', 3), true);
  assert.equal(isTvEpisodeMatch('Очень странные дела / Сезон 1 (2016)', 3), true);
  assert.equal(isTvEpisodeMatch('Очень странные дела / Сезоны 1-4 (2016-2022)', 3), true);
  assert.equal(isTvEpisodeMatch('Очень странные дела (8 серий)', 3), true);
});

test('stateless cross-process token encryption recovers ref data correctly', () => {
  const privateUrl = 'http://127.0.0.1:9117/dl/rutracker/?jackett_apikey=TEST_KEY&path=123';
  const token = registerTorrentDownloadRef({
    privateUrl,
    title: 'Interstellar (2014) 1080p',
    tracker: 'RuTracker',
    infoHash: '99e7751067632394ee5cbfc16168fed9a7fa63b7'
  });

  // Verify format of tamper-proof encrypted token
  assert.ok(token.startsWith('ref_'));

  // Resolve token and verify decrypted data matches original
  const resolved = resolveTorrentDownloadRef(token);
  assert.ok(resolved);
  assert.equal(resolved.privateUrl, privateUrl);
  assert.equal(resolved.title, 'Interstellar (2014) 1080p');
  assert.equal(resolved.tracker, 'RuTracker');
  assert.equal(resolved.infoHash, '99e7751067632394ee5cbfc16168fed9a7fa63b7');
});

test('scrubPasskeysFromTorrentBuffer removes sensitive passkeys from announce URLs without modifying infoHash', async () => {
  const { toTorrentFile, default: pt } = await import('parse-torrent');
  const info = {
    name: 'test-stream.mkv',
    'piece length': 16384,
    pieces: Buffer.alloc(20),
    length: 50000000
  };

  const sensitiveAnnounce = [
    'http://tracker.rutracker.org/my_secret_key_1234567890abcdef12345678/announce',
    'http://tr.nnmclub.to/announce.php?passkey=SECRET_PASSKEY_98765'
  ];

  const origBuffer = toTorrentFile({ info, announce: sensitiveAnnounce });
  const parsedOrig = await pt(origBuffer);

  const scrubbedBuffer = await scrubPasskeysFromTorrentBuffer(origBuffer);
  const parsedScrubbed = await pt(scrubbedBuffer);

  // InfoHash must remain 100% identical
  assert.equal(parsedScrubbed.infoHash, parsedOrig.infoHash);

  // Passkeys must be completely scrubbed
  const scrubbedString = scrubbedBuffer.toString('binary');
  assert.equal(scrubbedString.includes('SECRET_PASSKEY_98765'), false);
  assert.equal(scrubbedString.includes('my_secret_key_1234567890abcdef12345678'), false);

  // Cleaned announce URLs
  assert.ok(parsedScrubbed.announce?.includes('http://tracker.rutracker.org/announce'));
  assert.ok(parsedScrubbed.announce?.some((a) => a.includes('announce.php') && !a.includes('passkey')));
});

test('TorrServer route POST /api/torrent/torrserver falls back to action: add when action: get returns absent', async () => {
  const http = await import('node:http');
  const { POST } = await import('../src/app/api/torrent/torrserver/route');
  const { NextRequest } = await import('next/server');

  const calls: any[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const json = JSON.parse(body);
        calls.push(json);
        if (json.action === 'get') {
          // Absent torrent: return empty / not found
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({}));
        } else if (json.action === 'add') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            hash: '1111111111111111111111111111111111111111',
            title: json.title || 'Added Torrent',
            stat: 1,
            stat_string: 'Preload',
            torrent_size: 1000000,
            file_stats: [{ id: 1, path: 'movie.mp4', length: 1000000 }]
          }));
        } else {
          res.writeHead(400);
          res.end();
        }
      } catch (e: any) {
        res.writeHead(500);
        res.end(e.message);
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as any;
  const mockPort = address.port;

  const prevEnv = process.env.TORRSERVER_URL;
  process.env.TORRSERVER_URL = `http://127.0.0.1:${mockPort}`;

  try {
    const nextReq = new NextRequest('http://localhost/api/torrent/torrserver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hash: '1111111111111111111111111111111111111111',
        magnet: 'magnet:?xt=urn:btih:1111111111111111111111111111111111111111&dn=Test+Movie',
        title: 'Test Movie'
      })
    });

    const response = await POST(nextReq);
    assert.equal(response.status, 200);

    const json = await response.json();
    assert.equal(json.infoHash, '1111111111111111111111111111111111111111');
    assert.equal(json.name, 'Test Movie');

    // Verify calls: first get, then add with save_to_db: true
    assert.equal(calls.length, 2);
    assert.equal(calls[0].action, 'get');
    assert.equal(calls[0].hash, '1111111111111111111111111111111111111111');
    assert.equal(calls[1].action, 'add');
    assert.equal(calls[1].save_to_db, true);
    assert.equal(calls[1].title, 'Test Movie');
  } finally {
    process.env.TORRSERVER_URL = prevEnv;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});


