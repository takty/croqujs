import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { NodeExporter } from '../app/exporter-node.js';
import { NodeFileSystem } from '../app/lib/fs-node.js';
import { LibraryError, NodeUrlProvider } from '../app/url-provider-node.js';

test('issued URLs locate the injected program and expire independently per session', async () => {
	const files = new NodeFileSystem();
	const injection = fileURLToPath(new URL('../app/lib/injection.js', import.meta.url));
	const first = new NodeUrlProvider(files, 1, new NodeExporter(files, injection));
	const second = new NodeUrlProvider(files, 2, new NodeExporter(files, injection));
	const text = 'console.log("first");';
	try {
		const url = new URL(await first.createUrl(text, null));
		const file = fileURLToPath(url);
		const html = fs.readFileSync(file, 'utf8');
		assert.equal(url.hash, '#1,' + html.indexOf(text));
		assert.ok(fs.existsSync(path.join(path.dirname(file), 'lib/injection.js')));
		const otherFile = fileURLToPath(await second.createUrl('console.log(2);', null));
		assert.notEqual(path.dirname(otherFile), path.dirname(file));

		await assert.rejects(() => first.createUrl('// @need missing.js', null), LibraryError);
		assert.ok(fs.existsSync(file)); // Validation failed before replacing the URL.
		const nextFile = fileURLToPath(await first.createUrl('console.log(3);', null));
		assert.equal(fs.existsSync(file), false);
		await first.dispose();
		assert.equal(fs.existsSync(nextFile), false);
		assert.ok(fs.existsSync(otherFile));
	} finally {
		await first.dispose();
		await second.dispose();
	}
});

test('async generation cleans up on failure and allows a subsequent request', async () => {
	const events = [];
	let serial = 0;
	const pause = () => new Promise(resolve => setImmediate(resolve));
	const files = {
		async createTempDirectory() {
			await pause();
			const dir = `temp-${++serial}`;
			events.push(`create:${dir}`);
			return path.resolve(dir);
		},
		async removeDirectoryTree(dir) {
			await pause();
			events.push(`remove:${path.basename(dir)}`);
		},
		async executionFileURL(file) {
			await pause();
			const relative = `${path.basename(path.dirname(file))}/${path.basename(file)}`;
			events.push(`url:${relative}`);
			return `file:///${relative}`;
		},
	};
	const exporter = {
		async checkLibraryReadable() { await pause(); return true; },
		async exportForExecution(code, _file, dir) {
			await pause();
			assert.equal(path.isAbsolute(dir), true);
			events.push(`export:${path.basename(dir)}`);
			if (code === 'bad') throw new Error('export failed');
			return [true, `${dir}/index.html`];
		},
		userCodeOffset() { return 12; },
	};
	const provider = new NodeUrlProvider(files, 7, exporter);
	await assert.rejects(provider.createUrl('bad', null), /export failed/);
	assert.equal(await provider.createUrl('ok', null), 'file:///temp-2/index.html#7,12');
	await provider.dispose();
	assert.deepEqual(events, ['create:temp-1', 'export:temp-1', 'remove:temp-1',
		'create:temp-2', 'export:temp-2', 'url:temp-2/index.html', 'remove:temp-2']);
	await provider.dispose();
	assert.equal(events.length, 7);
});
