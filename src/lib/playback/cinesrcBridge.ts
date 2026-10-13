/**
 * CineSrc Player postMessage Bridge & Validator (Step 2F)
 *
 * Official Documentation: https://cinesrc.st/docs
 *
 * Verified Technical Findings:
 *  1. Direct CineSrc (`https://cinesrc.st/embed/...`) sends events via `window.parent.postMessage({ type: "cinesrc:..." }, "*")`.
 *  2. EmbedWave (`https://embedwave.cc/embed/...?server=cinesrc`) wraps `cinesrc.st` inside a nested iframe and
 *     does NOT listen for or forward `cinesrc:*` postMessage events to the top-level KinoRoom window.
 *  3. Therefore, real-time subtitle synchronization works in Direct CineSrc mode (`https://cinesrc.st/embed/...`),
 *     while EmbedWave mode must honestly report that automatic postMessage synchronization is unavailable through the wrapper.
 *
 * Security & Validation Guarantees:
 *  - Verifies `event.origin === 'https://cinesrc.st'`
 *  - Verifies `event.source === expectedIframeWindow`
 *  - Verifies `activeIframeId === currentIframeId`
 *  - Verifies documented `cinesrc:*` event types
 *  - Verifies `currentTime` is a finite non-negative number
 *  - Never uses `Date.now()` or autonomous timers to fabricate playback time
 */

export const CINESRC_ORIGIN = 'https://cinesrc.st';

export const CINESRC_ALLOWED_ORIGINS: readonly string[] = [CINESRC_ORIGIN];

export type CineSrcEventType =
  | 'cinesrc:ready'
  | 'cinesrc:timeupdate'
  | 'cinesrc:play'
  | 'cinesrc:pause'
  | 'cinesrc:seeking'
  | 'cinesrc:seeked'
  | 'cinesrc:ended'
  | 'cinesrc:nextepisode'
  | 'cinesrc:loadedmetadata'
  | 'cinesrc:response'
  | 'cinesrc:sourceused'
  | 'cinesrc:error';

export type CineSrcCommandName =
  | 'getCurrentTime'
  | 'getDuration'
  | 'getPaused'
  | 'seek'
  | 'play'
  | 'pause'
  | 'setVolume'
  | 'setMuted'
  | 'setPlaybackRate';

export interface ValidatedCineSrcEvent {
  type: CineSrcEventType;
  iframeId: string;
  currentTime?: number;
  duration?: number;
  command?: CineSrcCommandName;
  result?: number | boolean;
  sourceId?: string;
  error?: string;
}

export interface CineSrcMessageValidationContext {
  expectedIframeWindow: unknown;
  activeIframeId: string;
  currentIframeId: string;
  allowedOrigins?: readonly string[];
}

const MAX_VALID_MEDIA_SECONDS = 86400; // 24 hours sanity ceiling

function isValidMediaTime(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_VALID_MEDIA_SECONDS
  );
}

function isValidMediaDuration(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= MAX_VALID_MEDIA_SECONDS
  );
}

/**
 * Strictly validates an incoming browser `MessageEvent` from the CineSrc iframe.
 * Returns `null` if origin, source window, active iframe ID, event type, or timestamp is invalid.
 */
export function validateCineSrcMessageEvent(
  event: { origin: string; source: unknown; data: unknown },
  context: CineSrcMessageValidationContext
): ValidatedCineSrcEvent | null {
  if (!event || typeof event !== 'object') return null;

  // 1. Verify active iframe identifier
  if (
    !context.activeIframeId ||
    !context.currentIframeId ||
    context.activeIframeId !== context.currentIframeId
  ) {
    return null;
  }

  // 2. Verify event.origin
  const allowedOrigins = context.allowedOrigins ?? CINESRC_ALLOWED_ORIGINS;
  if (typeof event.origin !== 'string' || !allowedOrigins.includes(event.origin)) {
    return null;
  }

  // 3. Verify event.source matches the active iframe's contentWindow
  if (!context.expectedIframeWindow || event.source !== context.expectedIframeWindow) {
    return null;
  }

  // 4. Verify event.data object and type
  if (!event.data || typeof event.data !== 'object' || Array.isArray(event.data)) {
    return null;
  }

  const raw = event.data as Record<string, unknown>;
  const type = raw.type;
  if (typeof type !== 'string') {
    return null;
  }

  switch (type) {
    case 'cinesrc:ready':
    case 'cinesrc:play':
    case 'cinesrc:pause':
    case 'cinesrc:ended':
    case 'cinesrc:nextepisode':
      return {
        type,
        iframeId: context.activeIframeId
      };

    case 'cinesrc:timeupdate':
    case 'cinesrc:seeking':
    case 'cinesrc:seeked': {
      // currentTime is mandatory and must be a valid finite non-negative number
      if (!isValidMediaTime(raw.currentTime)) {
        return null;
      }
      const duration = isValidMediaDuration(raw.duration) ? raw.duration : undefined;
      return {
        type,
        iframeId: context.activeIframeId,
        currentTime: raw.currentTime,
        duration
      };
    }

    case 'cinesrc:loadedmetadata': {
      if (!isValidMediaDuration(raw.duration)) {
        return null;
      }
      return {
        type,
        iframeId: context.activeIframeId,
        duration: raw.duration
      };
    }

    case 'cinesrc:response': {
      const cmd = raw.command;
      if (cmd === 'getCurrentTime') {
        if (!isValidMediaTime(raw.result)) return null;
        return {
          type,
          iframeId: context.activeIframeId,
          command: 'getCurrentTime',
          currentTime: raw.result,
          result: raw.result
        };
      }
      if (cmd === 'getDuration') {
        if (!isValidMediaDuration(raw.result)) return null;
        return {
          type,
          iframeId: context.activeIframeId,
          command: 'getDuration',
          duration: raw.result,
          result: raw.result
        };
      }
      if (cmd === 'getPaused') {
        if (typeof raw.result !== 'boolean') return null;
        return {
          type,
          iframeId: context.activeIframeId,
          command: 'getPaused',
          result: raw.result
        };
      }
      return null;
    }

    case 'cinesrc:sourceused': {
      const sourceId = typeof raw.sourceId === 'string' ? raw.sourceId.slice(0, 64) : undefined;
      return {
        type,
        iframeId: context.activeIframeId,
        sourceId
      };
    }

    case 'cinesrc:error': {
      const errorMsg = typeof raw.error === 'string' ? raw.error.slice(0, 200) : 'Unknown error';
      return {
        type,
        iframeId: context.activeIframeId,
        error: errorMsg
      };
    }

    default:
      return null;
  }
}

/**
 * Sends a documented command (`getCurrentTime`, `getDuration`, `seek`, `play`, `pause`)
 * to the direct CineSrc iframe via postMessage.
 */
export function sendCineSrcCommand(
  targetWindow: { postMessage: (message: unknown, targetOrigin: string) => void } | null | undefined,
  command: CineSrcCommandName,
  args: unknown[] = [],
  targetOrigin: string = CINESRC_ORIGIN
): boolean {
  if (!targetWindow || typeof targetWindow.postMessage !== 'function') {
    return false;
  }

  if (command === 'seek') {
    const targetSec = args[0];
    if (!isValidMediaTime(targetSec)) {
      return false;
    }
  }

  if (command === 'setVolume') {
    const vol = args[0];
    if (typeof vol !== 'number' || !Number.isFinite(vol) || vol < 0 || vol > 1) {
      return false;
    }
  }

  try {
    targetWindow.postMessage(
      {
        type: 'cinesrc:command',
        command,
        action: command,
        args,
        value: args[0],
        time: command === 'seek' ? args[0] : undefined,
        volume: command === 'setVolume' ? args[0] : undefined
      },
      targetOrigin
    );
    return true;
  } catch {
    return false;
  }
}
