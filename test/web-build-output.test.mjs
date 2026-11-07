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
	for (const file of ['electron/main.js', 'electron/preload.js', 'session/session-server.js', 'field/field.html', 'study/study.html']) {
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
		assert.equal(sources.some(source => source.endsWith('/project-dialog.js')), directory === 'dist-web');
	}
});

test('Study icons are embedded rather than copied as separate assets', async () => {
	for (const [directory, resourcePath] of [['app', 'study/res/'], ['dist-web', 'res/']]) {
		const root = new URL('../' + directory + '/', import.meta.url);
		assert.ok(!(await readdir(new URL(resourcePath, root))).some(name => /^icon-.*\.svg$/.test(name)));
		const assets = new URL('assets/', root);
		const names = await readdir(assets);
		assert.ok(!names.some(name => /^icon-.*\.svg$/.test(name)));
		const scripts = await Promise.all(names.filter(name => name.endsWith('.js')).map(name => readFile(new URL(name, assets), 'utf8')));
		assert.ok(scripts.some(text => text.includes('data:image/svg+xml')));
		const styles = await Promise.all(names.filter(name => name.endsWith('.css')).map(name => readFile(new URL(name, assets), 'utf8')));
		assert.ok(styles.some(text => /--side-menu-check:url\(["']?data:image\/svg\+xml/.test(text)));
	}
});
