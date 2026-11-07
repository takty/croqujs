const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

async function checkWorker() {
	const { BrowserWindow } = require('electron');
	const worker = `
import { BrowserExporter } from '/app/project/exporter-browser.js';
import { BrowserFileSystem } from '/app/fs/fs-browser.js';
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
	const pathname = new URL(event.request.url).pathname;
	if (pathname !== '/runtime' && pathname !== '/saved') return;
	event.respondWith((async () => {
		if (typeof process !== 'undefined' || typeof document !== 'undefined') throw new Error('Unexpected host globals');
		const files = new BrowserFileSystem(await navigator.storage.getDirectory());
		await files.makeDirectory('lib', { recursive: true });
		await files.writeText('lib/injection.js', '// runtime hooks');
		await files.writeText('helper.js', 'function twice(x) { return x * 2; }');
		const exporter = new BrowserExporter(files);
		const code = '// @use helper as HELPER\\nconsole.log(HELPER.twice(3));';
		const [success, content] = pathname === '/runtime'
			? await exporter.exportForExecution(code, 'long-title.js')
			: await exporter.createWebPage(code, 'long-title.js');
		if (!success) throw new Error(content);
		return Response.json({
			html: content.files.get(content.entryPath),
			library: content.files.get('helper.lib.js'),
			offset: content.userCodeOffset,
			injection: content.sources?.has('lib/injection.js') ?? false,
			written: await files.exists('index.html'),
		});
	})());
});`;
	const appRoot = path.resolve(__dirname, '../app');
	const server = http.createServer(async (request, response) => {
		try {
			const pathname = new URL(request.url, 'http://localhost').pathname;
			if (pathname === '/') {
				response.setHeader('Content-Type', 'text/html');
				response.end('<!DOCTYPE html><title>Exporter worker test</title>');
			} else if (pathname === '/sw.js') {
				response.setHeader('Content-Type', 'text/javascript');
				response.end(worker);
			} else if (pathname.startsWith('/app/')) {
				const target = path.resolve(appRoot, pathname.slice(5));
				if (!target.startsWith(appRoot + path.sep)) throw new Error('Invalid test path');
				response.setHeader('Content-Type', 'text/javascript');
				response.end(await fs.readFile(target));
			} else {
				response.writeHead(404).end();
			}
		} catch (error) {
			response.writeHead(500).end(String(error));
		}
	});
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	const window = new BrowserWindow({ show: false, webPreferences: {
		nodeIntegration: false, contextIsolation: true, sandbox: true,
		partition: 'exporter-worker-test',
	} });
	try {
		await window.loadURL(`http://127.0.0.1:${server.address().port}/`);
		const results = await window.webContents.executeJavaScript(`(async () => {
			await navigator.serviceWorker.register('/sw.js', { type: 'module' });
			await navigator.serviceWorker.ready;
			if (!navigator.serviceWorker.controller) await new Promise(resolve => {
				navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
			});
			return [await (await fetch('/runtime')).json(), await (await fetch('/saved')).json()];
		})()`);
		for (const result of results) {
			assert.equal(result.offset, result.html.indexOf('// @use'));
			assert.match(result.library, /var HELPER/);
			assert.equal(result.written, false);
		}
		assert.equal(results[0].injection, true);
		assert.equal(results[1].injection, false);
	} finally {
		window.destroy();
		await new Promise(resolve => server.close(resolve));
	}
}

if (process.versions.electron) {
	const { app } = require('electron');
	app.whenReady().then(checkWorker).then(() => app.exit(0), error => {
		console.error(error);
		app.exit(1);
	});
} else {
	test('Chromium Service Worker generates responses from real OPFS handles without Node globals', () => {
		const result = spawnSync(process.execPath, [path.join(__dirname, 'run-study-integration.mjs'), pathToFileURL(__filename).href], {
			encoding: 'utf8', timeout: 50000, windowsHide: true,
		});
		assert.ifError(result.error);
		assert.equal(result.status, 0, result.stdout + result.stderr);
	});
}
