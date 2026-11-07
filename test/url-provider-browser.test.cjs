const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

async function checkProvider() {
	const { BrowserWindow } = require('electron');
	const root = path.resolve(__dirname, '../app');
	const server = http.createServer(async (request, response) => {
		try {
			const pathname = new URL(request.url, 'http://localhost').pathname;
			if (pathname === '/') {
				response.setHeader('Content-Type', 'text/html');
				response.end('<!DOCTYPE html><title>URL provider test</title>');
			} else if (pathname.startsWith('/app/')) {
				const target = path.resolve(root, pathname.slice(5));
				if (!target.startsWith(root + path.sep)) throw new Error('Invalid test path');
				response.setHeader('Content-Type', 'text/javascript');
				response.end(await fs.readFile(target));
			} else response.writeHead(404).end();
		} catch {
			response.writeHead(404).end();
		}
	});
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	const options = { show: false, webPreferences: {
		nodeIntegration: false, contextIsolation: true, sandbox: true,
		partition: 'url-provider-browser-test',
	} };
	const host = new BrowserWindow(options);
	let execution = new BrowserWindow(options);
	try {
		await host.loadURL(`http://127.0.0.1:${server.address().port}/`);
		const urls = await host.webContents.executeJavaScript(`(async () => {
			const { BrowserUrlProvider } = await import('/app/execution/url-provider-browser.js');
			const { BrowserExporter } = await import('/app/project/exporter-browser.js');
			const { BrowserFileSystem } = await import('/app/fs/fs-browser.js');
			const files = new BrowserFileSystem(await navigator.storage.getDirectory());
			await files.makeDirectory('lib', { recursive: true });
			await files.makeDirectory('project/nested', { recursive: true });
			await files.writeText('lib/injection.js', 'window.injected = true;');
			await files.writeText('project/helper.js', 'function twice(x) { return x * 2; }');
			await files.writeText('project/nested/raw.js', 'window.rawValue = 7;');
			window.files = files;
			await files.writeText('root.txt', 'root asset');
			await files.writeText('project/data.json', '{"value":1}');
			await files.writeFile('project/data.bin', new Uint8Array([0, 128, 255, 10]));
			await files.writeText('project/image.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="3"></svg>');
			window.first = new BrowserUrlProvider(1, new BrowserExporter(files));
			window.second = new BrowserUrlProvider(2, new BrowserExporter(files));
			const code = '// @use helper as HELPER\\n// @need nested/raw.js\\nwindow.result = HELPER.twice(window.rawValue);';
			const firstUrl = await first.createUrl(code, 'project/long-title.js');
			const secondUrl = await second.createUrl('window.result = 99;', null);
			let missing;
			try { await first.createUrl('// @need missing.js', 'main.js'); }
			catch (error) { missing = error instanceof (await import('/app/execution/url-provider-browser.js')).LibraryError; }
			window.originalUrl = firstUrl;
			return { firstUrl, secondUrl, missing, outputWritten: await files.exists('index.html'), controller: !!navigator.serviceWorker.controller };
		})()`);
		assert.equal(urls.missing, true);
		assert.equal(urls.outputWritten, false);
		assert.equal(urls.controller, false); // The provider's worker does not take over the host page.
		assert.match(new URL(urls.firstUrl).pathname, /\/__croqujs_run__\/[0-9a-f-]+\/project\/$/);
		assert.notEqual(new URL('.', urls.firstUrl).href, new URL('.', urls.secondUrl).href);
		await execution.loadURL(urls.firstUrl);
		const loaded = await execution.webContents.executeJavaScript(`(async () => {
			const html = await (await fetch(location.href)).text();
			const script = await fetch('nested/raw.js');
			const head = await fetch('index.html', { method: 'HEAD' });
			return { result: window.result, injected: window.injected, html,
				scriptType: script.headers.get('Content-Type'), htmlType: head.headers.get('Content-Type'),
				head: await head.text(), missing: (await fetch('missing.js')).status,
				post: (await fetch('index.html', { method: 'POST' })).status,
				query: (await fetch('index.html?v=1')).status };
		})()`);
		assert.equal(loaded.result, 14);
		assert.equal(loaded.injected, true);
		assert.equal(new URL(urls.firstUrl).hash, '#1,' + loaded.html.indexOf('// @use'));
		assert.equal(loaded.scriptType, 'text/javascript; charset=utf-8');
		assert.equal(loaded.htmlType, 'text/html; charset=utf-8');
		assert.equal(loaded.head, '');
		assert.equal(loaded.missing, 404);
		assert.equal(loaded.post, 405);
		assert.equal(loaded.query, 200);


		const staticFiles = await execution.webContents.executeJavaScript(`(async () => {
			const root = await (await fetch('../root.txt')).text();
			const data = await fetch('data.json');
			const binary = await fetch('data.bin');
			const range = await fetch('data.bin', { headers: { Range: 'bytes=1-2' } });
			const image = new Image();
			image.src = 'image.svg';
			await image.decode();
			return { root, json: await data.json(), jsonType: data.headers.get('Content-Type'),
				cacheControl: data.headers.get('Cache-Control'), bytes: [...new Uint8Array(await binary.arrayBuffer())],
				range: [...new Uint8Array(await range.arrayBuffer())], rangeStatus: range.status,
				image: [image.naturalWidth, image.naturalHeight],
				invalid: (await fetch('%2e%2e%2fdata.json')).status };
		})()`);
		assert.equal(staticFiles.root, 'root asset');
		assert.deepEqual(staticFiles.json, { value: 1 });
		assert.equal(staticFiles.jsonType, 'application/json; charset=utf-8');
		assert.equal(staticFiles.cacheControl, 'no-store');
		assert.deepEqual(staticFiles.bytes, [0, 128, 255, 10]);
		assert.deepEqual(staticFiles.range, [128, 255]);
		assert.equal(staticFiles.rangeStatus, 206);
		assert.deepEqual(staticFiles.image, [2, 3]);
		assert.equal(staticFiles.invalid, 400);
		const responses = await execution.webContents.executeJavaScript(`(async () => {
			const head = await fetch('data.bin', { method: 'HEAD' });
			const ranges = [];
			for (const value of ['bytes=1-2', 'bytes=2-', 'bytes=-2', 'bytes=0-100',
				'bytes=4-', 'bytes=3-1', 'bytes=-0', 'bytes=-', 'bytes=0-1,2-3', 'bytes=999999999999999999-']) {
				const response = await fetch('data.bin', { headers: { Range: value } });
				ranges.push([response.status, response.headers.get('Content-Range'),
					[...new Uint8Array(await response.arrayBuffer())]]);
			}
			return { head: [head.headers.get('Content-Length'), head.headers.get('Cache-Control'), await head.text()], ranges };
		})()`);
		assert.deepEqual(responses.head, ['4', 'no-store', '']);
		assert.deepEqual(responses.ranges.slice(0, 4), [
			[206, 'bytes 1-2/4', [128, 255]],
			[206, 'bytes 2-3/4', [255, 10]],
			[206, 'bytes 2-3/4', [255, 10]],
			[206, 'bytes 0-3/4', [0, 128, 255, 10]],
		]);
		for (const response of responses.ranges.slice(4)) assert.deepEqual(response, [416, 'bytes */4', []]);
		await host.webContents.executeJavaScript(`(async () => {
			await files.writeText('project/data.json', '{"value":2}');
			await files.writeText('project/new.txt', 'created after execution started');
			await files.writeText('project/nested/raw.js', 'window.rawValue = 8;');
		})()`);
		const changed = await execution.webContents.executeJavaScript(`(async () => {
			return { json: await (await fetch('data.json')).json(),
				added: await (await fetch('new.txt')).text(), raw: await (await fetch('nested/raw.js')).text() };
		})()`);
		assert.deepEqual(changed.json, { value: 2 });
		assert.equal(changed.added, 'created after execution started');
		assert.equal(changed.raw, 'window.rawValue = 8;');
		await host.webContents.executeJavaScript(`files.remove('project/new.txt')`);
		assert.equal(await execution.webContents.executeJavaScript(`fetch('new.txt').then(response => response.status)`), 404);
		const cached = await host.webContents.executeJavaScript(`(async () => {
			const names = await caches.keys();
			return (await Promise.all(names.map(async name => (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname.split('/').pop())))).flat().sort();
		})()`);
		assert.deepEqual(cached, ['helper.lib.js', 'index.html', 'index.html']);

		// Terminate the running worker; the next navigation must recover content from Cache Storage.
		execution.destroy();
		host.webContents.debugger.attach('1.3');
		await host.webContents.debugger.sendCommand('ServiceWorker.enable');
		await host.webContents.debugger.sendCommand('ServiceWorker.stopAllWorkers');
		host.webContents.debugger.detach();
		execution = new BrowserWindow(options);
		await execution.loadURL(urls.firstUrl);
		assert.equal(await execution.webContents.executeJavaScript('window.result'), 16);
		assert.deepEqual(await execution.webContents.executeJavaScript(`fetch('data.json').then(response => response.json())`), { value: 2 });

		const replacement = await host.webContents.executeJavaScript(`first.createUrl('window.result = 42;', null)`);
		const previousStatus = await execution.webContents.executeJavaScript('fetch(location.href).then(response => response.status)');
		assert.equal(previousStatus, 404);
		assert.equal(await execution.webContents.executeJavaScript(`fetch('data.json').then(response => response.status)`), 404);
		await execution.loadURL(replacement);
		assert.equal(await execution.webContents.executeJavaScript('window.result'), 42);
		await host.webContents.executeJavaScript('first.dispose()');
		assert.equal(await execution.webContents.executeJavaScript('fetch(location.href).then(response => response.status)'), 404);
		await execution.loadURL(urls.secondUrl);
		assert.equal(await execution.webContents.executeJavaScript('window.result'), 99);

		const failures = await host.webContents.executeJavaScript(`(async () => {
			const { BrowserUrlProvider } = await import('/app/execution/url-provider-browser.js');
			const invalid = new BrowserUrlProvider(3, {
				async checkLibraryReadable() { return true; },
				async exportForExecution() { return [true, { files: new Map([['../escape.html', 'bad']]), entryPath: '../escape.html', userCodeOffset: 0 }]; },
			});
			const before = await caches.keys();
			let rejected = false;
			try { await invalid.createUrl('', null); } catch (error) { rejected = /Invalid execution file path/.test(error.message); }
			const after = await caches.keys();
			await second.dispose();
			await second.dispose();
			await first.dispose();
			return { rejected, unchanged: JSON.stringify(before) === JSON.stringify(after), remaining: await caches.keys(), mappings: await new Promise((resolve, reject) => {
				const request = indexedDB.open('croqujs-execution-v1', 1);
				request.onerror = () => reject(request.error);
				request.onsuccess = () => {
					const db = request.result;
					const transaction = db.transaction('runs');
					const count = transaction.objectStore('runs').count();
					transaction.oncomplete = () => { db.close(); resolve(count.result); };
				};
			}) };
		})()`);
		assert.equal(failures.rejected, true);
		assert.equal(failures.unchanged, true);
		assert.deepEqual(failures.remaining, []);
		assert.equal(failures.mappings, 0);
		assert.equal(await execution.webContents.executeJavaScript('fetch(location.href).then(response => response.status)'), 404);
	} finally {
		if (!execution.isDestroyed()) execution.destroy();
		host.destroy();
		await new Promise(resolve => server.close(resolve));
	}
}

if (process.versions.electron) {
	const { app } = require('electron');
	app.whenReady().then(checkProvider).then(() => app.exit(0), error => {
		console.error(error);
		app.exit(1);
	});
} else {
	test('browser URLs serve generated programs, survive worker restarts, and expire independently', () => {
		const result = spawnSync(process.execPath, [path.join(__dirname, 'run-study-integration.mjs'), pathToFileURL(__filename).href], {
			encoding: 'utf8', timeout: 50000, windowsHide: true,
		});
		assert.ifError(result.error);
		assert.equal(result.status, 0, result.stdout + result.stderr);
	});
}
