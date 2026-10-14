import test from 'node:test';
import assert from 'node:assert/strict';
import { isDeclaredMp4Release, playbackStartErrorMessage } from '../src/lib/playback/torrentCompatibility';

test('AVC/H.264 and mobile release names do not prove an MP4 container', () => {
  for (const title of ['Release BDRip-AVC', 'Release H.264 MKV', 'Release для iPhone', 'Release КПК', 'Release WEB-DLRip-AVC']) {
    assert.equal(isDeclaredMp4Release(title), false, title);
  }
  assert.equal(isDeclaredMp4Release('Release [MP4]'), true);
  assert.equal(isDeclaredMp4Release('release.mp4'), true);
});

test('play rejection reports a fixed actionable message without exposing error details', () => {
  for (const name of ['NotSupportedError', 'NotAllowedError', 'AbortError', 'UnknownError']) {
    const message = playbackStartErrorMessage({ name, message: 'private-fixture-url?token=private-fixture' });
    assert.equal(message.includes('private-fixture'), false);
    assert.ok(message.length > 0);
  }
  assert.match(playbackStartErrorMessage({ name: 'NotSupportedError' }), /формат/);
  assert.match(playbackStartErrorMessage({ name: 'NotAllowedError' }), /не разрешил/);
  assert.match(playbackStartErrorMessage({ name: 'AbortError' }), /прерван/);
});
