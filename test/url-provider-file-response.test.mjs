import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileResponse } from '../src/url-provider-file-response.js';

const file = new File([new Uint8Array([0, 128, 255, 10])], 'sound.wav');
const request = (options = {}) => new Request('https://example.test/sound.wav', options);

test('static binary content and HEAD responses have no-store and correct metadata', async () => {
	const response = fileResponse(file, request());
	assert.equal(response.headers.get('Cache-Control'), 'no-store');
	assert.equal(response.headers.get('Content-Type'), 'audio/wav');
	assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [0, 128, 255, 10]);
	const head = fileResponse(file, request({ method: 'HEAD' }));
	assert.equal(head.headers.get('Content-Length'), '4');
	assert.equal(await head.text(), '');
});

test('media byte ranges support bounded, open-ended, and suffix requests', async () => {
	for (const [range, bytes, contentRange] of [
		['bytes=1-2', [128, 255], 'bytes 1-2/4'],
		['bytes=2-', [255, 10], 'bytes 2-3/4'],
		['bytes=-2', [255, 10], 'bytes 2-3/4'],
		['bytes=0-100', [0, 128, 255, 10], 'bytes 0-3/4'],
	]) {
		const response = fileResponse(file, request({ headers: { Range: range } }));
		assert.equal(response.status, 206);
		assert.equal(response.headers.get('Content-Range'), contentRange);
		assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], bytes);
	}
});

test('unsatisfiable and malformed ranges do not return file content', async () => {
	for (const range of ['bytes=4-', 'bytes=3-1', 'bytes=-0', 'bytes=-', 'bytes=0-1,2-3', 'bytes=999999999999999999-']) {
		const response = fileResponse(file, request({ headers: { Range: range } }));
		assert.equal(response.status, 416, range);
		assert.equal(response.headers.get('Content-Range'), 'bytes */4');
		assert.equal(await response.text(), '');
	}
});
