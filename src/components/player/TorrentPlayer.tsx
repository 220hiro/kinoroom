'use client';
import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Upload } from 'lucide-react';
import type { TorrentFile } from '@/lib/types';
import { alignSubtitles, timestamp, type TorrentMediaInfo } from '@/lib/playback/torrentMedia';
import { decodeSubtitleBuffer, parseExternalSubtitles } from '@/lib/playback/externalSubtitleEngine';

export interface TorrentPlayerProps {
  magnet: string; initialFileIndex?: number; initialTime?: number; season?: number; episode?: number;
  onTimeUpdate?: (time: number, duration: number) => void;
  onSwitchToOnline?: () => void;
}
interface Prepared { session: string; info: TorrentMediaInfo; files: TorrentFile[]; fileIndex: number }
const label = (seconds: number) => timestamp(seconds).split('.')[0].replace(/^00:/, '');
const button = 'min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-amber-400';
const select = 'mt-1 min-h-11 w-full min-w-0 rounded-xl border border-white/10 bg-[#191b24] px-3 text-sm text-white';

export function TorrentPlayer({ magnet, initialFileIndex, initialTime = 0, season, episode, onTimeUpdate, onSwitchToOnline }: TorrentPlayerProps) {
  const video = useRef<HTMLVideoElement>(null), engine = useRef<Hls | null>(null), sessionRef = useRef<string | null>(null);
  const [prepared, setPrepared] = useState<Prepared | null>(null), [files, setFiles] = useState<TorrentFile[]>([]);
  const [file, setFile] = useState<number | undefined>(initialFileIndex), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [playing, setPlaying] = useState(false), [waiting, setWaiting] = useState(false), [time, setTime] = useState(initialTime), [offset, setOffset] = useState(0);
  const [audio, setAudio] = useState(0), [subtitle, setSubtitle] = useState('off'), [subtitleError, setSubtitleError] = useState('');
  const [localVtt, setLocalVtt] = useState(''), [trackUrl, setTrackUrl] = useState(''), [muted, setMuted] = useState(false), [scrub, setScrub] = useState<number | null>(null);
  const requestRef = useRef<AbortController | null>(null), generation = useRef(0), autoPlay = useRef(false), lastProgress = useRef(0), resume = useRef(initialTime);
  const playbackRevision = useRef(0);

  useEffect(() => {
    const element = video.current;
    setPrepared(null); setFiles([]); setFile(initialFileIndex); setTime(initialTime); setOffset(0);
    setError(''); setSubtitle('off'); setLocalVtt(''); setLoading(false); setPlaying(false);
    resume.current = initialTime;
    return () => {
      generation.current++; requestRef.current?.abort(); engine.current?.destroy();
      if (element) { element.pause(); element.removeAttribute('src'); element.load(); }
      if (sessionRef.current) void fetch(`/api/torrent/playback/${sessionRef.current}`, { method: 'DELETE', keepalive: true }).catch(() => {});
      sessionRef.current = null;
    };
  }, [magnet]);

  const prepare = async (selectedFile = file) => {
    requestRef.current?.abort();
    const controller = new AbortController(); requestRef.current = controller;
    const version = ++generation.current;
    setLoading(true); setError(''); setSubtitleError('');
    if (sessionRef.current) { void fetch(`/api/torrent/playback/${sessionRef.current}`, { method: 'DELETE' }).catch(() => {}); sessionRef.current = null; }
    engine.current?.destroy();
    if (video.current) { video.current.pause(); video.current.removeAttribute('src'); video.current.load(); }
    setPrepared(null);
    const deadline = Date.now() + 60000;
    try {
      while (Date.now() < deadline) {
        const response = await fetch('/api/torrent/playback', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ torrent: magnet, file: selectedFile, season, episode }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]) });
        const result = await response.json();
        if (version !== generation.current) return;
        if (result.files) setFiles(result.files);
        if (response.status === 202) { await new Promise(r => setTimeout(r, 1500)); continue; }
        if (!response.ok) throw new Error(result.error || 'Не удалось открыть раздачу.');
        const data = result as Prepared;
        sessionRef.current = data.session; setPrepared(data); setFile(data.fileIndex);
        setAudio((data.info.audio.find(t => ['rus', 'ru'].includes(t.language)) || data.info.audio.find(t => t.isDefault) || data.info.audio[0])?.id ?? 0);
        setOffset(Math.min(Math.floor(resume.current), Math.max(0, Math.floor(data.info.duration - 1))));
        setTime(resume.current); setSubtitle('off'); setLocalVtt(''); autoPlay.current = true;
        return;
      }
      throw new Error('Раздача не загрузилась за минуту. Выберите другую.');
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Ошибка подключения.'); }
    finally { if (version === generation.current) setLoading(false); }
  };

  useEffect(() => {
    const element = video.current; if (!prepared || !element) return;
    setWaiting(true); setError(''); engine.current?.destroy();
    const source = `/api/torrent/playback/${prepared.session}/index.m3u8?audio=${audio}&seek=${offset}&revision=${++playbackRevision.current}`;
    const start = () => { setWaiting(false); if (autoPlay.current) void element.play().catch(() => setPlaying(false)); };
    element.addEventListener('loadeddata', start, { once: true });
    if (element.canPlayType('application/vnd.apple.mpegurl')) {
      element.src = source; element.load();
      if (autoPlay.current) void element.play().catch(() => setPlaying(false));
    }
    else if (Hls.isSupported()) {
      const hls = new Hls({ startPosition: 0, maxBufferLength: 30, backBufferLength: 15, manifestLoadingTimeOut: 50000, manifestLoadingMaxRetry: 1 });
      engine.current = hls;
      hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) { setWaiting(false); setError('Поток прервался. Повторите подключение или выберите другую раздачу.'); } });
      hls.loadSource(source); hls.attachMedia(element);
    } else { setWaiting(false); setError('Браузер не поддерживает этот видеопоток.'); }
    return () => { element.removeEventListener('loadeddata', start); engine.current?.destroy(); engine.current = null; };
  }, [prepared, audio, offset]);

  const subtitleWindow = Math.floor(time / 240) * 240;
  useEffect(() => {
    setSubtitleError('');
    if (subtitle === 'off' || !prepared) { setTrackUrl(''); return; }
    if (subtitle === 'local') {
      const url = URL.createObjectURL(new Blob([alignSubtitles(localVtt, 0, offset)], { type: 'text/vtt' }));
      setTrackUrl(url); return () => URL.revokeObjectURL(url);
    }
    const controller = new AbortController(); let url = '';
    fetch(`/api/torrent/playback/${prepared.session}/subtitles.vtt?track=${subtitle}&start=${subtitleWindow}&offset=${offset}`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(await response.text()); return response.text(); })
      .then(vtt => { if (!controller.signal.aborted) { url = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' })); setTrackUrl(url); } })
      .catch(cause => { if (!controller.signal.aborted) { setSubtitleError(cause.message); setTrackUrl(''); } });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [subtitle, subtitleWindow, offset, prepared, localVtt]);

  const seek = (target: number) => {
    if (!prepared) return;
    const next = Math.max(0, Math.min(Math.floor(target), Math.floor(prepared.info.duration - 1)));
    autoPlay.current = playing; setTime(next); setOffset(next); setScrub(null);
  };
  const upload = async (selected?: File) => {
    if (!selected || selected.size > 5 * 1024 * 1024) { setSubtitleError('Выберите SRT/VTT размером до 5 МБ.'); return; }
    const parsed = parseExternalSubtitles(decodeSubtitleBuffer(await selected.arrayBuffer()), { fileName: selected.name });
    if (!parsed.valid) { setSubtitleError(parsed.errors[0] || 'Не удалось прочитать субтитры.'); return; }
    setLocalVtt('WEBVTT\n\n' + parsed.cues.map(c => `${timestamp(c.startTime)} --> ${timestamp(c.endTime)}\n${c.text}\n`).join('\n')); setSubtitle('local');
  };

  return <section aria-label="Торрент-плеер КАДР" className="overflow-hidden rounded-2xl border border-white/10 bg-[#101117]">
    <div className="relative bg-black">
      <video ref={video} playsInline preload="auto" controls={false} muted={muted} aria-label="Видео" className="aspect-video w-full object-contain"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onWaiting={() => setWaiting(true)} onPlaying={() => setWaiting(false)}
        onError={() => { if (prepared) { setWaiting(false); setError('Не удалось воспроизвести поток. Повторите подключение.'); } }}
        onTimeUpdate={() => {
          if (!prepared || !video.current) return;
          const current = Math.min(prepared.info.duration, offset + video.current.currentTime); setTime(current); resume.current = current;
          if (Date.now() - lastProgress.current > 3000) { onTimeUpdate?.(current, prepared.info.duration); lastProgress.current = Date.now(); }
        }}>
        {trackUrl && <track key={trackUrl} kind="subtitles" label="Субтитры" srcLang="ru" src={trackUrl} default onLoad={event => { event.currentTarget.track.mode = 'showing'; }} />}
      </video>
      {!prepared && <div className="absolute inset-0 grid place-items-center p-4"><button disabled={loading} onClick={() => void prepare()} className="min-h-12 rounded-full bg-amber-400 px-6 font-semibold text-black disabled:opacity-60">{loading ? 'Подготовка раздачи…' : 'Смотреть раздачу'}</button></div>}
      {prepared && waiting && <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/75 px-3 py-2 text-xs" role="status">Загрузка видео…</div>}
    </div>
    {error && <div role="alert" className="space-y-3 p-4 text-sm text-amber-200"><p>{error}</p><button className={button + ' px-3'} onClick={() => void prepare()}>Повторить</button>{onSwitchToOnline && <button onClick={onSwitchToOnline} className={button + ' ml-2 px-3'}>CineSrc</button>}</div>}
    {prepared && <div className="space-y-3 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3 text-xs tabular-nums text-gray-300"><span>{label(scrub ?? time)}</span><span>{label(prepared.info.duration)}</span></div>
      <input aria-label="Позиция фильма" type="range" min={0} max={prepared.info.duration} step={1} value={scrub ?? time} onChange={event => setScrub(Number(event.target.value))}
        onPointerUp={event => seek(Number(event.currentTarget.value))} onKeyUp={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) seek(Number(event.currentTarget.value)); }} className="h-8 w-full accent-amber-400" />
      <div className="flex flex-wrap items-center gap-2">
        <button aria-label={playing ? 'Пауза' : 'Воспроизвести'} className={button} onClick={() => { const element = video.current; if (!element) return; if (playing) element.pause(); else { autoPlay.current = true; void element.play().catch(() => setError('Нажмите воспроизведение после загрузки потока.')); } }}>{playing ? <Pause size={20} /> : <Play size={20} />}</button>
        <button aria-label="Назад на 10 секунд" className={button} onClick={() => seek(time - 10)}><RotateCcw size={18} /></button>
        <button aria-label="Вперёд на 10 секунд" className={button} onClick={() => seek(time + 10)}><RotateCw size={18} /></button>
        <button aria-label={muted ? 'Включить звук' : 'Выключить звук'} className={button} onClick={() => setMuted(!muted)}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="min-w-0 text-xs text-gray-400">Озвучка<select aria-label="Озвучка" value={audio} disabled={!prepared.info.audio.length} className={select} onChange={event => { autoPlay.current = playing; setOffset(Math.floor(time)); setAudio(Number(event.target.value)); }}>{prepared.info.audio.length ? prepared.info.audio.map(t => <option key={t.id} value={t.id}>{t.label} · {t.codec.toUpperCase()}</option>) : <option>В файле нет звука</option>}</select></label>
        <label className="min-w-0 text-xs text-gray-400">Субтитры<select aria-label="Субтитры" value={subtitle} className={select} onChange={event => setSubtitle(event.target.value)}><option value="off">Выключены</option>{prepared.info.subtitles.map(t => <option key={t.id} value={t.id} disabled={!t.supported}>{t.label}{!t.supported ? ' — графические, не поддерживаются' : ''}</option>)}{localVtt && <option value="local">Мой файл SRT/VTT</option>}</select></label>
      </div>
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-white/10 px-3 text-xs text-gray-300"><Upload size={16} />Загрузить SRT/VTT<input aria-label="Файл субтитров" className="sr-only" type="file" accept=".srt,.vtt" onChange={event => void upload(event.target.files?.[0])} /></label>
      {!prepared.info.subtitles.length && <p className="text-xs text-gray-400">В файле нет встроенных субтитров. Можно загрузить свой SRT/VTT.</p>}
      {subtitleError && <p role="alert" className="text-xs text-amber-300">{subtitleError}</p>}
    </div>}
    {files.length > 1 && <label className="block p-3 text-xs text-gray-400">Файл раздачи<select aria-label="Файл раздачи" value={file ?? ''} onChange={event => { const next = Number(event.target.value); setFile(next); resume.current = 0; void prepare(next); }} className={select}><option value="" disabled>Выберите файл</option>{files.map(f => <option key={f.index} value={f.index}>{f.name}</option>)}</select></label>}
  </section>;
}
