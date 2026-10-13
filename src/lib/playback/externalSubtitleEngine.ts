/**
 * ExternalSubtitleEngine (Step 2F)
 *
 * Reusable subtitle engine for external iframe players (such as CineSrc).
 * Reuses core timestamp and cue utilities from `./subtitles`.
 *
 * Security & Integrity Guarantees:
 *  - Parses both SubRip (.srt) and WebVTT (.vtt) formats.
 *  - Supports UTF-8 (with BOM) and automatic Windows-1251 (CP1251) fallback for Russian .srt files.
 *  - Sanitizes all cue text to plain strings (strips HTML/script/style/ASS tags). Never uses innerHTML.
 *  - Evaluates active cues strictly from verified player timestamps (never uses Date.now() or free-running timers).
 *  - Supports subtitle delay offset from -60 to +60 seconds.
 */

import {
  SubtitleCue,
  SubtitleValidationResult,
  parseTimestamp,
  validateSubtitleCues
} from './subtitles';

export const MIN_SUBTITLE_OFFSET_SEC = -60;
export const MAX_SUBTITLE_OFFSET_SEC = 60;
export const DEFAULT_SUBTITLE_OFFSET_STEP_SEC = 0.5;
export const MAX_SUBTITLE_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB max local file size

export interface ExternalSubtitleTrack {
  id: string;
  label: string;
  lang: string;
  format: 'srt' | 'vtt';
  fileName?: string;
  cues: SubtitleCue[];
  cueCount: number;
  maxEndTime: number;
}

export interface ExternalSubtitleParseResult {
  valid: boolean;
  format: 'srt' | 'vtt' | 'unknown';
  cues: SubtitleCue[];
  cueCount: number;
  errors: string[];
  warnings: string[];
  track?: ExternalSubtitleTrack;
}

/**
 * Clamps subtitle offset strictly within [-60, +60] seconds, rounded to 2 decimal places.
 */
export function clampSubtitleOffset(offsetSeconds: number): number {
  if (typeof offsetSeconds !== 'number' || !Number.isFinite(offsetSeconds)) {
    return 0;
  }
  const clamped = Math.max(MIN_SUBTITLE_OFFSET_SEC, Math.min(MAX_SUBTITLE_OFFSET_SEC, offsetSeconds));
  return Math.round(clamped * 100) / 100;
}

/**
 * Safely strips HTML tags, script payloads, WebVTT voice/class tags, and ASS override blocks `{\...}`.
 * Returns plain text safe for React text node rendering without innerHTML.
 */
export function sanitizeSubtitleText(rawText: string): string {
  if (!rawText || typeof rawText !== 'string') return '';

  let cleaned = rawText
    // Remove null bytes and non-printable control chars except newline and tab
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    // Remove <script>...</script> and <style>...</style> blocks completely
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    // Remove ASS/SSA override tags like {\an8}, {\pos(100,200)}, {\i1}
    .replace(/\{\\[^}]*\}/g, '')
    // Remove all HTML / WebVTT tags (<b...>, </i>, <font color="...">, <v Speaker>, <c.yellow>, etc.)
    .replace(/<\/?[a-zA-Z][^>\n]*>/g, '')
    // Strip any remaining angle brackets that look like malformed tags (<script, <img, etc.)
    .replace(/<\s*\/?\s*(script|img|iframe|svg|object|embed|link|meta)[^>]*>?/gi, '');

  // Decode standard HTML entities safely into plain characters
  cleaned = cleaned
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");

  // Normalize multi-line whitespace while preserving intentional line breaks
  const lines = cleaned
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0);

  return lines.join('\n');
}

/**
 * Decodes an ArrayBuffer from a user-selected subtitle file.
 * Automatically tries strict UTF-8 first, then falls back to windows-1251 (CP1251)
 * so Cyrillic .srt files saved in ANSI/CP1251 render Russian letters properly.
 */
export function decodeSubtitleBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);

  // Strip UTF-8 BOM if present
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }

  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    return utf8Decoder.decode(bytes);
  } catch {
    try {
      const cp1251Decoder = new TextDecoder('windows-1251');
      return cp1251Decoder.decode(bytes);
    } catch {
      return new TextDecoder('utf-8').decode(bytes);
    }
  }
}

/**
 * Detects whether raw subtitle text is WebVTT or SubRip (SRT).
 */
export function detectSubtitleFormat(content: string, fileName?: string): 'vtt' | 'srt' | 'unknown' {
  const trimmed = content.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return 'unknown';

  const lowerName = (fileName || '').toLowerCase().trim();
  if (/^WEBVTT($|[\s\r\n])/i.test(trimmed)) {
    return 'vtt';
  }

  if (lowerName.endsWith('.vtt') && trimmed.includes('-->')) {
    return 'vtt';
  }

  if (trimmed.includes('-->')) {
    return 'srt';
  }

  return 'unknown';
}

/**
 * Parses either SRT or WebVTT content into sanitized, chronologically sorted SubtitleCue items.
 */
export function parseExternalSubtitles(
  rawContent: string,
  options: {
    fileName?: string;
    label?: string;
    lang?: string;
    expectedDuration?: number;
  } = {}
): ExternalSubtitleParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!rawContent || typeof rawContent !== 'string') {
    return {
      valid: false,
      format: 'unknown',
      cues: [],
      cueCount: 0,
      errors: ['Файл субтитров пуст или имеет некорректный текстовый формат.'],
      warnings
    };
  }

  const normalized = rawContent
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  if (!normalized) {
    return {
      valid: false,
      format: 'unknown',
      cues: [],
      cueCount: 0,
      errors: ['Файл субтитров не содержит текста.'],
      warnings
    };
  }

  const format = detectSubtitleFormat(normalized, options.fileName);
  if (format === 'unknown') {
    return {
      valid: false,
      format: 'unknown',
      cues: [],
      cueCount: 0,
      errors: ['Неподдерживаемый формат файла. Поддерживаются только файлы .srt и .vtt с таймкодами (-->).'],
      warnings
    };
  }

  const rawCues: SubtitleCue[] = [];
  const blocks = normalized.split(/\n\s*\n/);

  for (let bIndex = 0; bIndex < blocks.length; bIndex++) {
    const block = blocks[bIndex].trim();
    if (!block) continue;

    const lines = block.split('\n').map((l) => l.trim());
    if (lines.length === 0) continue;

    // Skip WebVTT header, NOTE, STYLE, REGION blocks
    const firstLine = lines[0];
    if (
      /^WEBVTT($|\s)/i.test(firstLine) ||
      /^NOTE($|\s)/i.test(firstLine) ||
      /^STYLE($|\s)/i.test(firstLine) ||
      /^REGION($|\s)/i.test(firstLine)
    ) {
      // Check if a cue immediately follows WEBVTT on the next line without blank line
      const arrowIdx = lines.findIndex((l) => l.includes('-->'));
      if (arrowIdx === -1) {
        continue;
      }
      lines.splice(0, arrowIdx);
    }

    const timeLineIndex = lines.findIndex((l) => l.includes('-->'));
    if (timeLineIndex === -1) {
      continue;
    }

    const cueId = timeLineIndex > 0 ? lines[timeLineIndex - 1] : `${rawCues.length + 1}`;
    const timeLine = lines[timeLineIndex];
    const arrowParts = timeLine.split('-->');
    if (arrowParts.length !== 2) {
      warnings.push(`Блок #${bIndex + 1}: некорректная строка таймкода "${timeLine}"`);
      continue;
    }

    // Extract timestamp tokens (strip WebVTT positioning settings like "line:80% position:50%")
    const startRaw = arrowParts[0].trim().split(/\s+/)[0];
    const endRaw = arrowParts[1].trim().split(/\s+/)[0];

    const startTime = parseTimestamp(startRaw);
    const endTime = parseTimestamp(endRaw);

    if (startTime === null || endTime === null || !Number.isFinite(startTime) || !Number.isFinite(endTime)) {
      warnings.push(`Блок #${bIndex + 1}: не удалось распознать таймкод "${timeLine}"`);
      continue;
    }

    if (startTime < 0 || endTime <= startTime) {
      warnings.push(`Блок #${bIndex + 1}: некорректный интервал времени (${startTime}s -> ${endTime}s)`);
      continue;
    }

    const rawTextLines = lines.slice(timeLineIndex + 1).join('\n');
    const cleanText = sanitizeSubtitleText(rawTextLines);
    if (!cleanText) {
      continue;
    }

    rawCues.push({
      id: cueId,
      startTime,
      endTime,
      text: cleanText
    });
  }

  if (rawCues.length === 0) {
    return {
      valid: false,
      format,
      cues: [],
      cueCount: 0,
      errors: ['В файле не найдено ни одной валидной реплики с корректными таймкодами.'],
      warnings
    };
  }

  // Sort chronologically by startTime (many real-world SRT files have slightly out-of-order overlapping cues)
  const sortedCues = [...rawCues].sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);

  // Validate sorted cues using core validator
  const validation: SubtitleValidationResult = validateSubtitleCues(sortedCues);
  if (!validation.valid) {
    return {
      valid: false,
      format,
      cues: [],
      cueCount: 0,
      errors: validation.errors,
      warnings
    };
  }

  const maxEndTime = sortedCues.reduce((max, c) => Math.max(max, c.endTime), 0);
  if (
    options.expectedDuration &&
    Number.isFinite(options.expectedDuration) &&
    options.expectedDuration > 60 &&
    maxEndTime > options.expectedDuration + 300
  ) {
    warnings.push(
      `Последние реплики (${Math.round(maxEndTime / 60)} мин.) выходят за пределы длительности видео (${Math.round(
        options.expectedDuration / 60
      )} мин.). Возможно, субтитры от режиссёрской/расширенной версии.`
    );
  }

  const track: ExternalSubtitleTrack = {
    id: `ext-sub-${Date.now()}`,
    label: options.label || options.fileName || 'Русские субтитры',
    lang: options.lang || 'ru',
    format,
    fileName: options.fileName,
    cues: sortedCues,
    cueCount: sortedCues.length,
    maxEndTime
  };

  return {
    valid: true,
    format,
    cues: sortedCues,
    cueCount: sortedCues.length,
    errors: [],
    warnings,
    track
  };
}

/**
 * Stateful ExternalSubtitleEngine for synchronizing parsed SRT/VTT cues with an external player's time events.
 */
export class ExternalSubtitleEngine {
  private cues: SubtitleCue[] = [];
  private track: ExternalSubtitleTrack | null = null;
  private offsetSeconds = 0;
  private currentTime: number | null = null;
  private isPaused = true;
  private isEnded = false;
  private activeCues: SubtitleCue[] = [];

  /**
   * Loads subtitle cues from a raw SRT or WebVTT string.
   */
  public loadFromText(
    content: string,
    options: {
      fileName?: string;
      label?: string;
      lang?: string;
      expectedDuration?: number;
    } = {}
  ): ExternalSubtitleParseResult {
    const result = parseExternalSubtitles(content, options);
    if (result.valid && result.track) {
      this.cues = result.cues;
      this.track = result.track;
      this.isEnded = false;
      this.recalculateActiveCues();
    }
    return result;
  }

  /**
   * Loads subtitle cues from an ArrayBuffer (supports UTF-8 and Windows-1251 Cyrillic encodings).
   */
  public loadFromBuffer(
    buffer: ArrayBuffer,
    options: {
      fileName?: string;
      label?: string;
      lang?: string;
      expectedDuration?: number;
    } = {}
  ): ExternalSubtitleParseResult {
    if (buffer.byteLength > MAX_SUBTITLE_FILE_SIZE_BYTES) {
      return {
        valid: false,
        format: 'unknown',
        cues: [],
        cueCount: 0,
        errors: [
          `Размер файла превышает максимально допустимый лимит (${Math.round(
            MAX_SUBTITLE_FILE_SIZE_BYTES / (1024 * 1024)
          )} МБ).`
        ],
        warnings: []
      };
    }

    const decoded = decodeSubtitleBuffer(buffer);
    return this.loadFromText(decoded, options);
  }

  /**
   * Returns currently loaded track metadata, or null if no track is loaded.
   */
  public getTrack(): ExternalSubtitleTrack | null {
    return this.track;
  }

  /**
   * Sets subtitle delay offset in seconds (clamped to [-60, +60]).
   * Positive offset (+1.5s) delays subtitles (they appear 1.5s later in the movie).
   * Negative offset (-1.5s) hastens subtitles (they appear 1.5s earlier in the movie).
   */
  public setOffsetSeconds(offsetSeconds: number): number {
    this.offsetSeconds = clampSubtitleOffset(offsetSeconds);
    this.recalculateActiveCues();
    return this.offsetSeconds;
  }

  /**
   * Adjusts current subtitle offset by a delta in seconds (clamped to [-60, +60]).
   */
  public adjustOffsetSeconds(deltaSeconds: number): number {
    return this.setOffsetSeconds(this.offsetSeconds + deltaSeconds);
  }

  public getOffsetSeconds(): number {
    return this.offsetSeconds;
  }

  /**
   * Updates current playback time from a verified player event (timeupdate / response).
   * Rejects invalid, negative, or non-finite timestamps.
   */
  public updatePlaybackTime(currentTimeSeconds: number, options?: { isPaused?: boolean }): SubtitleCue[] {
    if (typeof currentTimeSeconds !== 'number' || !Number.isFinite(currentTimeSeconds) || currentTimeSeconds < 0) {
      return this.activeCues;
    }

    this.currentTime = currentTimeSeconds;
    this.isEnded = false;
    if (options?.isPaused !== undefined) {
      this.isPaused = options.isPaused;
    }

    this.recalculateActiveCues();
    return this.activeCues;
  }

  /**
   * Handles player pause event. Does not advance time during pause.
   */
  public onPause(currentTimeSeconds?: number): SubtitleCue[] {
    this.isPaused = true;
    if (typeof currentTimeSeconds === 'number' && Number.isFinite(currentTimeSeconds) && currentTimeSeconds >= 0) {
      this.currentTime = currentTimeSeconds;
      this.recalculateActiveCues();
    }
    return this.activeCues;
  }

  /**
   * Handles player play event.
   */
  public onPlay(currentTimeSeconds?: number): SubtitleCue[] {
    this.isPaused = false;
    this.isEnded = false;
    if (typeof currentTimeSeconds === 'number' && Number.isFinite(currentTimeSeconds) && currentTimeSeconds >= 0) {
      this.currentTime = currentTimeSeconds;
      this.recalculateActiveCues();
    }
    return this.activeCues;
  }

  /**
   * Immediately recalculates active cues on seek (seeking / seeked).
   * Prevents stale cues from remaining visible after jumping forward or backward.
   */
  public onSeek(currentTimeSeconds: number): SubtitleCue[] {
    if (typeof currentTimeSeconds !== 'number' || !Number.isFinite(currentTimeSeconds) || currentTimeSeconds < 0) {
      return this.activeCues;
    }
    this.currentTime = currentTimeSeconds;
    this.isEnded = false;
    this.recalculateActiveCues();
    return this.activeCues;
  }

  /**
   * Clears active subtitles when playback finishes (`cinesrc:ended`).
   */
  public onEnded(): SubtitleCue[] {
    this.isEnded = true;
    this.isPaused = true;
    this.activeCues = [];
    return this.activeCues;
  }

  /**
   * Resets playback state (e.g. when switching iframe or reloading player) while keeping loaded track.
   */
  public resetPlaybackState(): void {
    this.currentTime = null;
    this.isPaused = true;
    this.isEnded = false;
    this.activeCues = [];
  }

  /**
   * Completely clears loaded subtitle track and playback state.
   */
  public clear(): void {
    this.cues = [];
    this.track = null;
    this.currentTime = null;
    this.isPaused = true;
    this.isEnded = false;
    this.activeCues = [];
  }

  public getCurrentTime(): number | null {
    return this.currentTime;
  }

  public getIsPaused(): boolean {
    return this.isPaused;
  }

  public getIsEnded(): boolean {
    return this.isEnded;
  }

  /**
   * Returns active cues at the current (or explicitly provided) playback timestamp,
   * taking `offsetSeconds` into account.
   */
  public getActiveCues(explicitTimeSeconds?: number): SubtitleCue[] {
    if (explicitTimeSeconds !== undefined) {
      return this.computeCuesAtTime(explicitTimeSeconds);
    }
    return this.activeCues;
  }

  /**
   * Returns flat array of sanitized lines to display in the UI overlay.
   */
  public getActiveLines(explicitTimeSeconds?: number): string[] {
    const cues = this.getActiveCues(explicitTimeSeconds);
    const lines: string[] = [];
    for (const cue of cues) {
      const split = cue.text.split('\n').map((l) => l.trim()).filter(Boolean);
      lines.push(...split);
    }
    return lines;
  }

  private computeCuesAtTime(videoTimeSeconds: number): SubtitleCue[] {
    if (
      !Number.isFinite(videoTimeSeconds) ||
      videoTimeSeconds < 0 ||
      this.cues.length === 0 ||
      this.isEnded
    ) {
      return [];
    }

    // With offsetSeconds: a cue scheduled at [startTime, endTime] is displayed during
    // [startTime + offsetSeconds, endTime + offsetSeconds].
    const offset = this.offsetSeconds;
    return this.cues.filter((cue) => {
      const effectiveStart = cue.startTime + offset;
      const effectiveEnd = cue.endTime + offset;
      return effectiveStart <= videoTimeSeconds && videoTimeSeconds < effectiveEnd;
    });
  }

  private recalculateActiveCues(): void {
    if (this.currentTime === null || this.isEnded || this.cues.length === 0) {
      this.activeCues = [];
      return;
    }
    this.activeCues = this.computeCuesAtTime(this.currentTime);
  }
}
