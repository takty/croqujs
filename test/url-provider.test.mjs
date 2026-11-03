import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { LibraryError, UrlProvider } from '../app/url-provider.js';

test('issued URLs locate the injected program and expire independently per session', () => {
	const first = new UrlProvider(1);
	const second = new UrlProvider(2);
	const text = 'console.log("first");';
	try {
		const url = new URL(first.createUrl(text, null));
		const file = fileURLToPath(url);
		const html = fs.readFileSync(file, 'utf8');
		assert.equal(url.hash, '#1,' + html.indexOf(text));
		assert.ok(fs.existsSync(path.join(path.dirname(file), 'lib/injection.js')));
		const otherFile = fileURLToPath(second.createUrl('console.log(2);', null));
		assert.notEqual(path.dirname(otherFile), path.dirname(file));

		assert.throws(() => first.createUrl('// @need missing.js', null), LibraryError);
		assert.ok(fs.existsSync(file)); // Validation failed before replacing the URL.
		const nextFile = fileURLToPath(first.createUrl('console.log(3);', null));
		assert.equal(fs.existsSync(file), false);
		first.dispose();
		assert.equal(fs.existsSync(nextFile), false);
		assert.ok(fs.existsSync(otherFile));
	} finally {
		first.dispose();
		second.dispose();
	}
});
