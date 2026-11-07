import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BrowserUrlProvider, LibraryError } from '../src/execution/url-provider-browser.js';

test('unreadable libraries fail before browser registration or generation', async () => {
	const provider = new BrowserUrlProvider(1, {
		async checkLibraryReadable() { return 'missing.js'; },
		async exportForExecution() { assert.fail('Generation must not run'); },
	});
	await assert.rejects(provider.createUrl('', null), error => error instanceof LibraryError && error.message === 'missing.js');
	await provider.dispose();
});

test('generation failures are reported without requiring a browser environment', async () => {
	const provider = new BrowserUrlProvider(1, {
		async checkLibraryReadable() { return true; },
		async exportForExecution() { return [false, 'injection.js']; },
	});
	await assert.rejects(provider.createUrl('', null), error => error instanceof LibraryError && error.message === 'injection.js');
	await provider.dispose();
});
