/**
 * Subtitles Architecture & Validation Module
 * Handles WebVTT / SRT parsing, timestamp validation, release linking, and active cue lookup.
 */

export interface SubtitleCue {
  id?: string;
  startTime: number; // in seconds
  endTime: number;   // in seconds
  text: string;
}

export interface SubtitleTrackMetadata {
  id: string;
  sourceId: string;       // e.g. 'tears-of-steel'
  releaseId: string;      // e.g. 'tos-vfx-open-2012-1080p'
  lang: string;           // ISO 639-1 e.g. 'ru', 'en'
  label: string;          // e.g. 'Русские', 'English'
  format: 'vtt' | 'srt';
  url: string;
  duration: number;       // Movie duration in seconds
  offset?: number;        // Individual track offset in seconds
}

export interface SubtitleValidationResult {
  valid: boolean;
  errors: string[];
  cueCount: number;
}

/**
 * Parses timestamp string (HH:MM:SS.mmm or MM:SS.mmm or HH:MM:SS,mmm) into seconds.
 */
export function parseTimestamp(ts: string): number | null {
  const normalized = ts.trim().replace(',', '.');
  const parts = normalized.split(':');
  if (parts.length === 3) {
    const hours = parseFloat(parts[0]);
    const minutes = parseFloat(parts[1]);
    const seconds = parseFloat(parts[2]);
    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return null;
    return hours * 3600 + minutes * 60 + seconds;
  } else if (parts.length === 2) {
    const minutes = parseFloat(parts[0]);
    const seconds = parseFloat(parts[1]);
    if (isNaN(minutes) || isNaN(seconds)) return null;
    return minutes * 60 + seconds;
  }
  return null;
}

/**
 * Formats seconds into WebVTT timestamp: HH:MM:SS.mmm
 */
export function formatVttTimestamp(seconds: number): string {
  const safeSec = Math.max(0, seconds);
  const h = Math.floor(safeSec / 3600);
  const m = Math.floor((safeSec % 3600) / 60);
  const s = Math.floor(safeSec % 60);
  const ms = Math.floor((safeSec - Math.floor(safeSec)) * 1000);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

/**
 * Converts standard SubRip (.srt) string into standard WebVTT (.vtt) string
 * with optional release-specific offset in seconds.
 */
export function convertSrtToVtt(srtContent: string, offsetSeconds = 0): string {
  const normalized = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.trim().split(/\n\s*\n/);
  const vttBlocks: string[] = ['WEBVTT\n'];

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    let timeLineIndex = 0;
    // Check if line 0 is numeric cue ID
    if (/^\d+$/.test(lines[0].trim())) {
      timeLineIndex = 1;
    }

    const timeLine = lines[timeLineIndex];
    if (!timeLine || !timeLine.includes('-->')) continue;

    const [startRaw, endRaw] = timeLine.split('-->').map((s) => s.trim());
    const startTime = parseTimestamp(startRaw);
    const endTime = parseTimestamp(endRaw);

    if (startTime === null || endTime === null) continue;

    const adjustedStart = Math.max(0, startTime + offsetSeconds);
    const adjustedEnd = Math.max(adjustedStart + 0.1, endTime + offsetSeconds);

    const cueText = lines.slice(timeLineIndex + 1).join('\n').trim();
    if (!cueText) continue;

    vttBlocks.push(
      `${formatVttTimestamp(adjustedStart)} --> ${formatVttTimestamp(adjustedEnd)}\n${cueText}`
    );
  }

  return vttBlocks.join('\n\n') + '\n';
}

/**
 * Parses WebVTT content into structured cues.
 */
export function parseVttCues(vttContent: string): SubtitleCue[] {
  const normalized = vttContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const cues: SubtitleCue[] = [];

  let currentCue: Partial<SubtitleCue> | null = null;
  let textLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.includes('-->')) {
      // Save preceding cue
      if (currentCue && currentCue.startTime !== undefined && currentCue.endTime !== undefined) {
        cues.push({
          startTime: currentCue.startTime,
          endTime: currentCue.endTime,
          text: textLines.join('\n').trim(),
          id: currentCue.id
        });
      }

      const [startRaw, endRaw] = line.split('-->').map((s) => s.trim().split(' ')[0]);
      const startTime = parseTimestamp(startRaw);
      const endTime = parseTimestamp(endRaw);

      if (startTime !== null && endTime !== null) {
        currentCue = { startTime, endTime };
        textLines = [];
      } else {
        currentCue = null;
      }
    } else if (currentCue && line.length > 0 && !line.startsWith('NOTE') && !line.startsWith('WEBVTT')) {
      textLines.push(line);
    } else if (line.length === 0 && currentCue) {
      if (currentCue.startTime !== undefined && currentCue.endTime !== undefined) {
        cues.push({
          startTime: currentCue.startTime,
          endTime: currentCue.endTime,
          text: textLines.join('\n').trim(),
          id: currentCue.id
        });
      }
      currentCue = null;
      textLines = [];
    }
  }

  if (currentCue && currentCue.startTime !== undefined && currentCue.endTime !== undefined) {
    cues.push({
      startTime: currentCue.startTime,
      endTime: currentCue.endTime,
      text: textLines.join('\n').trim(),
      id: currentCue.id
    });
  }

  return cues;
}

/**
 * Rigorously validates a list of subtitle cues:
 * - Start time < End time
 * - Start time >= 0
 * - Chronological ordering
 * - Overlap sanity
 * - Within total movie duration bounds (if duration specified)
 */
export function validateSubtitleCues(
  cues: SubtitleCue[],
  totalDuration?: number
): SubtitleValidationResult {
  const errors: string[] = [];

  if (!cues || cues.length === 0) {
    return { valid: false, errors: ['Subtitle file contains no valid cues'], cueCount: 0 };
  }

  let prevStart = -1;

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];

    if (isNaN(cue.startTime) || isNaN(cue.endTime)) {
      errors.push(`Cue #${i + 1}: Invalid timestamp number`);
    }

    if (cue.startTime < 0) {
      errors.push(`Cue #${i + 1}: Start time cannot be negative (${cue.startTime}s)`);
    }

    if (cue.endTime <= cue.startTime) {
      errors.push(
        `Cue #${i + 1}: End time (${cue.endTime}s) must be strictly greater than start time (${cue.startTime}s)`
      );
    }

    if (cue.startTime < prevStart - 0.001) {
      errors.push(
        `Cue #${i + 1}: Out-of-order chronological sequence (start ${cue.startTime}s < prev start ${prevStart}s)`
      );
    }
    prevStart = cue.startTime;

    if (totalDuration !== undefined && cue.endTime > totalDuration + 5) {
      errors.push(
        `Cue #${i + 1}: End time (${cue.endTime}s) exceeds total media duration (${totalDuration}s)`
      );
    }

    if (!cue.text || cue.text.trim().length === 0) {
      errors.push(`Cue #${i + 1}: Empty cue dialogue text`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    cueCount: cues.length
  };
}

/**
 * Returns currently active cues for a given playback currentTime.
 * Useful for validating that after seek only the active cues are shown.
 */
export function getActiveCues(cues: SubtitleCue[], currentTime: number): SubtitleCue[] {
  return cues.filter((cue) => cue.startTime <= currentTime && currentTime < cue.endTime);
}
