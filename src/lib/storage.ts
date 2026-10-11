'use client';

import { Media } from './types';

export type UserProfile = {
  id: string;
  name: string;
  avatar: string;
};

export type WatchProgress = {
  media: Media;
  currentTime: number;
  duration: number;
  season?: number;
  episode?: number;
  updatedAt: number;
};

const DEFAULT_PROFILES: UserProfile[] = [
  { id: 'profile-main', name: 'Я', avatar: '🎬' },
  { id: 'profile-friend1', name: 'Друг 1', avatar: '🍿' },
  { id: 'profile-friend2', name: 'Друг 2', avatar: '🚀' }
];

const STORAGE_PREFIX = 'kinoroom:';

export function getProfiles(): UserProfile[] {
  if (typeof window === 'undefined') return DEFAULT_PROFILES;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}profiles`);
    return raw ? JSON.parse(raw) : DEFAULT_PROFILES;
  } catch {
    return DEFAULT_PROFILES;
  }
}

export function saveProfiles(profiles: UserProfile[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`${STORAGE_PREFIX}profiles`, JSON.stringify(profiles));
}

export function getActiveProfileId(): string {
  if (typeof window === 'undefined') return DEFAULT_PROFILES[0].id;
  return localStorage.getItem(`${STORAGE_PREFIX}active_profile`) || DEFAULT_PROFILES[0].id;
}

export function setActiveProfileId(id: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`${STORAGE_PREFIX}active_profile`, id);
}

// Watch history / Continue watching
export function getHistory(profileId: string): WatchProgress[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${profileId}:history`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveHistory(profileId: string, item: WatchProgress) {
  if (typeof window === 'undefined') return;
  const history = getHistory(profileId).filter(
    (h) => !(h.media.id === item.media.id && h.media.type === item.media.type)
  );
  history.unshift(item);
  localStorage.setItem(`${STORAGE_PREFIX}${profileId}:history`, JSON.stringify(history.slice(0, 50)));
}

export function getWatchProgress(
  profileId: string,
  mediaId: number,
  mediaType: string,
  season?: number,
  episode?: number
): WatchProgress | null {
  const history = getHistory(profileId);
  return (
    history.find((h) => {
      const matchMedia = h.media.id === mediaId && h.media.type === mediaType;
      if (!matchMedia) return false;
      if (season !== undefined && h.season !== undefined) {
        return h.season === season && (episode === undefined || h.episode === episode);
      }
      return true;
    }) || null
  );
}

export type AppSettings = {
  torrServerUrl: string;
  torrServerAuth?: string;
  useTorrServer: boolean;
  defaultExternalPlayer: 'vlc' | 'potplayer' | 'none';
};

const DEFAULT_SETTINGS: AppSettings = {
  torrServerUrl: 'http://127.0.0.1:8090',
  torrServerAuth: '',
  useTorrServer: false,
  defaultExternalPlayer: 'none'
};

export function getSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}settings`);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Partial<AppSettings>) {
  if (typeof window === 'undefined') return;
  const current = getSettings();
  const updated = { ...current, ...settings };
  localStorage.setItem(`${STORAGE_PREFIX}settings`, JSON.stringify(updated));
}
export function getBookmarks(profileId: string): Media[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${profileId}:bookmarks`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function toggleBookmark(profileId: string, media: Media): boolean {
  if (typeof window === 'undefined') return false;
  const bookmarks = getBookmarks(profileId);
  const exists = bookmarks.some((b) => b.id === media.id && b.type === media.type);
  let updated: Media[];
  if (exists) {
    updated = bookmarks.filter((b) => !(b.id === media.id && b.type === media.type));
  } else {
    updated = [media, ...bookmarks];
  }
  localStorage.setItem(`${STORAGE_PREFIX}${profileId}:bookmarks`, JSON.stringify(updated));
  return !exists;
}

export function isBookmarked(profileId: string, mediaId: number, mediaType: string): boolean {
  if (typeof window === 'undefined') return false;
  return getBookmarks(profileId).some((b) => b.id === mediaId && b.type === mediaType);
}
