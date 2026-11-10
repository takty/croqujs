import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

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
	for (const file of ['electron/main.js', 'electron/preload.js', 'session/session-server.js', 'field/field.html', 'study/index.html']) {
		await assert.rejects(access(new URL(file, root)), { code: 'ENOENT' });
	}
	await access(new URL('assets/croq-mirror.min.css', root));
	await assert.rejects(access(new URL('lib/', root)), { code: 'ENOENT' });
});

test('web pages keep their own scripts and styles with one shared helper bundle', async () => {
	const root = new URL('../dist-web/', import.meta.url);
	const scripts = [];
	const styles = [];
	for (const entry of ['index.html', 'field/index.html']) {
		const url = new URL(entry, root);
		const html = await readFile(url, 'utf8');
		const modules = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)];
		assert.equal(modules.length, 1);
		scripts.push(new URL(modules[0][1], url).href);
		styles.push([...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)]
			.map(([, href]) => new URL(href, url).href));
	}
	assert.notEqual(scripts[0], scripts[1]);
	assert.ok(styles[0].every(href => !styles[1].includes(href)));
	const studyMap = JSON.parse(await readFile(new URL(scripts[0] + '.map'), 'utf8'));
	const fieldMap = JSON.parse(await readFile(new URL(scripts[1] + '.map'), 'utf8'));
	assert.ok(!studyMap.sources.some(source => source.endsWith('/field/main.js')));
	assert.ok(!fieldMap.sources.some(source => source.endsWith('/study/main.js')));
	const files = (await readdir(root, { recursive: true })).filter(name => name.endsWith('.js'));
	assert.equal(files.filter(name => !name.includes('worker') && !name.endsWith('injection.js')).length, 4);
	for (const file of files) {
		const relative = file.replaceAll('\\', '/');
		assert.ok(relative.startsWith('assets/'), file);
	}
	assert.equal(files.filter(name => name.includes('worker')).length, 3);
	await access(new URL('assets/url-provider-worker.js', root));
});

test('both builds keep croq-mirror in a separate editor bundle', async () => {
	for (const directory of ['app', 'dist-web']) {
		const assets = new URL('../' + directory + '/assets/', import.meta.url);
		const maps = (await readdir(assets)).filter(name => name.endsWith('.js.map'));
		const editorMaps = maps.filter(name => /^croq-mirror-/.test(name));
		assert.equal(editorMaps.length, 1, directory);
		for (const name of maps.filter(name => !name.includes('worker'))) {
			const map = JSON.parse(await readFile(new URL(name, assets), 'utf8'));
			const hasEditor = map.sources.some(source => source.replaceAll('\\', '/').includes('/croq-mirror/'));
			assert.equal(hasEditor, name === editorMaps[0], directory + '/' + name);
		}
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
	for (const [directory, resourcePath] of [['app', 'res/'], ['dist-web', 'res/']]) {
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


test('both builds ship identical standalone hooks without embedding them in UI bundles', async () => {
	const hooks = [];
	for (const directory of ['app', 'dist-web']) {
		const root = new URL('../' + directory + '/', import.meta.url);
		const source = await readFile(new URL('assets/injection.js', root), 'utf8');
		new vm.Script(source);
		assert.match(source, /function installInjection/);
		assert.match(source, /class Iwc/);
		assert.doesNotMatch(source, /localStorage/);
		hooks.push(source);
		await access(new URL('index.html', root));
		await assert.rejects(access(new URL('study/', root)), { code: 'ENOENT' });
		await assert.rejects(access(new URL('lib/', root)), { code: 'ENOENT' });
		for (const name of await readdir(new URL('assets/', root))) {
			if (!name.endsWith('.js') || name === 'injection.js') continue;
			assert.doesNotMatch(await readFile(new URL('assets/' + name, root), 'utf8'), /function installInjection|createPseudoConsole/);
		}
	}
	assert.equal(hooks[0], hooks[1]);
});
