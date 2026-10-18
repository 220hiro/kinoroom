import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHttpRange } from '../src/lib/playback/httpRange';

test('tail metadata requests address the final bytes of a media file', () => {
  assert.deepEqual(parseHttpRange('bytes=-128', 1000), { start: 872, end: 999 });
  assert.deepEqual(parseHttpRange('bytes=-2000', 1000), { start: 0, end: 999 });
});

test('open and bounded seek ranges stay inside the file', () => {
  assert.deepEqual(parseHttpRange('bytes=750-', 1000), { start: 750, end: 999 });
  assert.deepEqual(parseHttpRange('bytes=750-2000', 1000), { start: 750, end: 999 });
  assert.deepEqual(parseHttpRange('bytes=0-0', 1000), { start: 0, end: 0 });
});

test('invalid and unsatisfiable ranges never reach a media read stream', () => {
  for (const value of ['bytes=-0', 'bytes=-', 'bytes=1000-', 'bytes=10-9', 'bytes=nope-20', 'bytes=0-1,4-5', 'items=0-1', 'bytes=9007199254740992-']) {
    assert.equal(parseHttpRange(value, 1000), null, value);
  }
  assert.equal(parseHttpRange('bytes=0-', 0), null);
});
