import { notFound } from 'next/navigation';
import { TorrentPlayer } from '@/components/player/TorrentPlayer';
import { hlsPilotEnabled, hlsPilotOrigin } from '@/lib/playback/hlsPilot';

export const dynamic = 'force-dynamic';

export default async function TorrentPilotPage() {
  if (!hlsPilotEnabled()) notFound();
  let hash: string | undefined;
  let source: { durationSeconds?: number; mode?: string; uploadRateBytes?: number } | undefined;
  try {
    const response = await fetch(`${hlsPilotOrigin()}/status`, { cache: 'no-store',
      redirect: 'error', signal: AbortSignal.timeout(2000) });
    if (response.ok) { const status = await response.json(); hash = status.infoHash; source = status.pilotSource; }
  } catch { /* Show a fixed message, never an upstream URL/error. */ }
  return <main className="max-w-5xl mx-auto p-4 space-y-4">
    <h1 className="text-xl font-bold">Локальная проверка торрент → HLS</h1>
    <p className="text-sm text-gray-400">Собственный тестовый MKV: HEVC и MP3, {Math.round((source?.durationSeconds || 120) / 60)} минут.
      Два настоящих торрент-клиента на ноутбуке; публичный рой не используется.
      Видео переупаковывается без перекодирования, звук преобразуется в AAC.</p>
    {source?.mode === 'progressive' && <p className="text-sm text-gray-400">
      Этап 2: общий таймлайн {Math.round((source?.durationSeconds || 5400) / 60)} минут. Холодная перемотка (например, на 45:00) запрашивает только целевые байты через HTTP Range без скачивания предыдущей части.
    </p>}
    {hash && /^[a-f0-9]{40}$/i.test(hash)
      ? <TorrentPlayer magnet={`magnet:?xt=urn:btih:${hash}`} initialFileIndex={0} hlsPilot hlsPilotProgressive={source?.mode === 'progressive'} />
      : <p>Локальный тестовый процесс не запущен.</p>}
  </main>;
}
