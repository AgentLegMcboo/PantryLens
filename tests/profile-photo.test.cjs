const fs = require('node:fs');
const ts = require('typescript');
const { test } = require('node:test');
const assert = require('node:assert/strict');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const core = fs.existsSync(require('node:path').join(__dirname, '../lib/profile-photo-core.ts'))
  ? require('../lib/profile-photo-core.ts') : {};
const change = core.changeProfilePhoto || (async () => assert.fail('Profile photo saving is not implemented'));
const next = { path: 'alice/new.jpg', bytes: new Uint8Array([255, 216, 255, 217]).buffer };

test('replacement saves the new photo before deleting the old photo', async () => {
  const events = [];
  await change('alice', 'alice/old.jpg', next, {
    upload: async path => events.push(['upload', path]),
    save: async path => events.push(['save', path]),
    remove: async path => events.push(['remove', path]),
  });
  assert.deepEqual(events, [['upload', next.path], ['save', next.path], ['remove', 'alice/old.jpg']]);
});

test('a failed profile save removes the new upload and preserves the old photo', async () => {
  const removed = [];
  await assert.rejects(change('alice', 'alice/old.jpg', next, {
    upload: async () => {}, save: async () => { throw new Error('Offline'); },
    remove: async path => removed.push(path),
  }), /Offline/);
  assert.deepEqual(removed, [next.path]);
});

test('upload failure never changes the saved profile', async () => {
  let saved = false;
  await assert.rejects(change('alice', 'alice/old.jpg', next, {
    upload: async () => { throw new Error('Upload failed'); },
    save: async () => { saved = true; }, remove: async () => {},
  }), /Upload failed/);
  assert.equal(saved, false);
});

test('removal clears the profile before deleting its photo, and cleanup failure is recoverable', async () => {
  const events = [];
  await change('alice', 'alice/old.jpg', null, {
    upload: async () => assert.fail('No upload on removal'),
    save: async path => events.push(['save', path]),
    remove: async path => { events.push(['remove', path]); throw new Error('Offline'); },
  });
  assert.deepEqual(events, [['save', null], ['remove', 'alice/old.jpg']]);
});

test('refuses oversized uploads and paths belonging to a different user', async () => {
  const io = { upload: async () => assert.fail('Invalid upload'), save: async () => assert.fail('Invalid save'), remove: async () => {} };
  await assert.rejects(change('alice', null, { ...next, path: 'bob/new.jpg' }, io), /photo path/i);
  await assert.rejects(change('alice', null, { ...next, bytes: new ArrayBuffer(2097153) }, io), /2 MB/);
});

test('base64 JPEG bytes are decoded without trailing zero padding', () => {
  const decode = core.profilePhotoBytes;
  assert.equal(typeof decode, 'function');
  for (const length of [1, 2, 3, 4, 17]) {
    const source = Buffer.from(Array.from({ length }, (_, index) => (index * 73 + 255) % 256));
    const result = decode(source.toString('base64'));
    assert.equal(result.byteLength, source.byteLength);
    assert.deepEqual(Buffer.from(result), source);
  }
});

test('stale profile references never delete another users stored photo', async () => {
  const removed = [];
  await change('alice', 'bob/old.jpg', next, {
    upload: async () => {}, save: async () => {}, remove: async path => removed.push(path),
  });
  assert.deepEqual(removed, []);
});

test('failed removal keeps the saved photo and does not delete its object', async () => {
  let deleted = false;
  await assert.rejects(change('alice', 'alice/old.jpg', null, {
    upload: async () => assert.fail('No upload on removal'),
    save: async () => { throw new Error('Save failed'); },
    remove: async () => { deleted = true; },
  }), /Save failed/);
  assert.equal(deleted, false);
});
