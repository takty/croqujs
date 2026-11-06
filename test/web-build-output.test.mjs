import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';

test('web output resolves local assets and includes versioned resources without Electron files', async () => {
	const root = new URL('../dist-web/', import.meta.url);
	for (const entry of ['index.html', 'field/index.html']) {
		const url = new URL(entry, root);
		const html = await readFile(url, 'utf8');
		if (entry === 'index.html') assert.match(html, /id="editor"/);
		assert.doesNotMatch(html, /http-equiv="refresh"/);
		for (const [, relative] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
			await access(new URL(relative, url));
		}
	}
	const resource = await readFile(new URL('res/resource.json', root), 'utf8');
	const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
	assert.ok(resource.includes(version + '-web'));
	assert.doesNotMatch(resource, /%VERSION/);
	for (const file of ['main.js', 'preload.js', 'session-server.js', 'field/field.html', 'study/study.html']) {
		await assert.rejects(access(new URL(file, root)), { code: 'ENOENT' });
	}
	for (const file of ['analysis-worker.min.js', 'croq-mirror.min.js', 'croq-mirror.min.css']) {
		await access(new URL('lib/croq-mirror/dist/' + file, root));
	}
});

test('renderer bundles select only the session implementation for their build target', async () => {
	for (const [directory, included, excluded] of [
		['app', 'session-client.js', 'session-local.js'],
		['dist-web', 'session-local.js', 'session-client.js'],
	]) {
		const assets = new URL('../' + directory + '/assets/', import.meta.url);
		const sources = [];
		for (const file of await readdir(assets)) {
			if (!file.endsWith('.js.map')) continue;
			const map = JSON.parse(await readFile(new URL(file, assets), 'utf8'));
			sources.push(...map.sources);
		}
		assert.ok(sources.some(source => source.endsWith('/' + included)), directory);
		assert.ok(!sources.some(source => source.endsWith('/' + excluded)), directory);
		assert.equal(sources.some(source => source.endsWith('/open-project-dialog.js')), directory === 'dist-web');
	}
});
