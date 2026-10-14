/** A title hint, never a verified container or a guarantee of iPhone compatibility. */
export function isDeclaredMp4Release(title: string): boolean {
  return /\bmp4\b/i.test(title);
}

export function playbackStartErrorMessage(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
  if (name === 'NotSupportedError') return 'Браузер не может воспроизвести этот формат видео или аудио. Выберите совместимый файл MP4/HLS.';
  if (name === 'NotAllowedError') return 'Браузер не разрешил запуск видео. Нажмите «Воспроизвести» ещё раз после загрузки источника.';
  if (name === 'AbortError') return 'Запуск прерван загрузкой источника. Нажмите «Воспроизвести» ещё раз.';
  return 'Не удалось начать воспроизведение. Проверьте источник и попробуйте ещё раз.';
}
