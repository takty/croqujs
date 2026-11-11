/**
 * Local Web Server Service Worker
 *
 * @author Takuto Yanagida
 * @version 2026-11-06
 */

import { splitPath, joinPath } from 'fs-nw/base';

const TYPES = {
	html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8',
	js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
	css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8',
	txt: 'text/plain; charset=utf-8', csv: 'text/csv; charset=utf-8', xml: 'application/xml',
	png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
	svg: 'image/svg+xml', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
	wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg', m4a: 'audio/mp4',
	mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg',
	wasm: 'application/wasm', pdf: 'application/pdf',
	woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
};

const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Install the local server on the scope of this Service Worker registration. */
export function installLwsWorker({ namespace = 'lws' } = {}) {
	const databaseName = namespace + '-v1';
	const scope = self.registration.scope;
	const scopePath = new URL(scope).pathname;
	const cacheNameFor = id => databaseName + ':' + scope + id;
	const accessRun = (action, key, value) => accessMapping(databaseName, action, key, value);

	self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
	self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

	self.addEventListener('message', event => {
		if (event.data?.type !== namespace || !event.ports[0]) return;
		const port = event.ports[0];
		event.waitUntil((async () => {
			try {
				if (!event.source || new URL(event.source.url).origin !== self.location.origin) {
					throw new Error('Invalid execution content sender');
				}
				const { action, runId, content, directoryHandle = null } = event.data;
				if (typeof runId !== 'string' || !RUN_ID.test(runId)) throw new Error('Invalid execution ID');
				const cacheName = cacheNameFor(runId);
				let value;
				if (action === 'put') value = await putContent(cacheName, new URL(runId + '/', scope), content, directoryHandle, accessRun);
				else if (action === 'delete') {
					await accessRun('delete', cacheName);
					await caches.delete(cacheName);
				}
				else throw new Error('Unknown execution content action');
				port.postMessage({ success: true, value });
			} catch (error) {
				port.postMessage({ success: false, error: error.message });
			} finally {
				port.close();
			}
		})());
	});

	self.addEventListener('fetch', event => {
		const url = new URL(event.request.url);
		if (!url.href.startsWith(scope)) return;
		const runId = url.pathname.slice(scopePath.length).split('/')[0];
		if (!RUN_ID.test(runId)) return;
		// respondWith must be called synchronously, before any cache lookup awaits.
		event.respondWith(readContent(event.request, url, new URL(runId + '/', scope), cacheNameFor(runId), accessRun));
	});
}

function contentUrl(base, relative) {
	if (typeof relative !== 'string') throw new Error('Invalid execution file path');
	const parts = relative.split('/');
	if (parts.some(part => !part || part === '.' || part === '..' || /[\\\u0000-\u001f]/u.test(part))) {
		throw new Error('Invalid execution file path');
	}
	return new URL(parts.map(encodeURIComponent).join('/'), base).href;
}

async function putContent(cacheName, base, content, directoryHandle, accessRun) {
	if (!(content?.files instanceof Map) || !content.files.has(content.entryPath)) {
		throw new Error('Execution content has no entry file');
	}
	const entries = [];
	for (const [relative, text] of content.files) {
		if (typeof text !== 'string') throw new Error('Execution content must be text');
		const url = contentUrl(base, relative);
		const type = relative.endsWith('.html') ? 'text/html' : 'text/javascript';
		entries.push([url, new Response(text, { headers: {
			'Content-Type': type + '; charset=utf-8',
			'Cache-Control': 'no-store',
			'X-Content-Type-Options': 'nosniff',
		} })]);
	}
	const entryUrl = contentUrl(base, content.entryPath);
	const sources = content.sources ?? new Map();
	const sourceDirectory = content.sourceDirectory ?? '';
	splitPath(sourceDirectory);
	if (!(sources instanceof Map)) throw new Error('Invalid source mapping');
	for (const [relative, source] of sources) {
		contentUrl(base, relative);
		splitPath(source, false);
	}
	if (directoryHandle !== null && !(directoryHandle instanceof FileSystemDirectoryHandle)) {
		throw new Error('Invalid source directory handle');
	}
	if (sources.size && !directoryHandle) throw new Error('Source directory handle is required');
	try {
		const cache = await caches.open(cacheName);
		for (const [url, response] of entries) await cache.put(url, response);
		// Publish the mapping last, so partially registered executions cannot be served.
		await accessRun('put', cacheName, { directoryHandle, sourceDirectory, sources });
	} catch (error) {
		await accessRun('delete', cacheName);
		await caches.delete(cacheName);
		throw error;
	}
	return entryUrl.endsWith('/index.html') ? entryUrl.slice(0, -'index.html'.length) : entryUrl;
}

async function readContent(request, url, base, cacheName, accessRun) {
	if (request.method !== 'GET' && request.method !== 'HEAD') {
		return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
	}
	url.search = '';
	url.hash = '';
	if (url.pathname.endsWith('/')) url.pathname += 'index.html';
	try {
		const run = await accessRun('get', cacheName);
		if (!run) return failure(404);
		const response = await caches.match(url.href, { cacheName });
		if (response) {
			if (request.method === 'HEAD') return new Response(null, { status: response.status, headers: response.headers });
			return response;
		}
		if (!run.directoryHandle) return failure(404);
		const parts = url.pathname.slice(base.pathname.length).split('/').map(part => {
			const decoded = decodeURIComponent(part);
			if (decoded.includes('/')) throw new TypeError('Invalid source path');
			return decoded;
		});
		const relative = parts.join('/');
		splitPath(relative, false);
		const source = run.sources.get(relative) ?? joinPath(run.sourceDirectory, relative);
		const sourceParts = splitPath(source, false);
		const name = sourceParts.pop();
		let directory = run.directoryHandle;
		for (const part of sourceParts) directory = await directory.getDirectoryHandle(part);
		const handle = await directory.getFileHandle(name);
		// Neither the File nor its bytes are retained in memory, IndexedDB, or Cache Storage.
		return fileResponse(await handle.getFile(), request);
	} catch (error) {
		if (error.name === 'NotFoundError' || error.name === 'TypeMismatchError') return failure(404);
		if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return failure(403);
		if (error instanceof TypeError || error instanceof URIError) return failure(400);
		console.error(error);
		return failure(500);
	}
}

function failure(status) {
	return new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Persist execution mappings across Service Worker restarts; never store file contents here. */
async function accessMapping(databaseName, action, key, value) {
	const database = await new Promise((resolve, reject) => {
		const request = indexedDB.open(databaseName, 1);
		request.onupgradeneeded = () => request.result.createObjectStore('runs');
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
	try {
		return await new Promise((resolve, reject) => {
			const transaction = database.transaction('runs', action === 'get' ? 'readonly' : 'readwrite');
			const store = transaction.objectStore('runs');
			let request;
			if (action === 'put') request = store.put(value, key);
			else if (action === 'delete') request = store.delete(key);
			else request = store.get(key);
			transaction.oncomplete = () => resolve(request.result);
			transaction.onabort = () => reject(transaction.error ?? new Error('Execution mapping transaction aborted'));
			transaction.onerror = () => reject(transaction.error);
		});
	} finally {
		database.close();
	}
}

/** Serve a fresh File snapshot, including single byte ranges used by media players. */
function fileResponse(file, request) {
	const extension = file.name.split('.').at(-1).toLowerCase();
	const headers = new Headers({
		'Content-Type': TYPES[extension] ?? (file.type || 'application/octet-stream'),
		'Cache-Control': 'no-store',
		'X-Content-Type-Options': 'nosniff',
		'Accept-Ranges': 'bytes',
		'Content-Length': String(file.size),
	});
	if (request.method === 'HEAD') return new Response(null, { headers });
	const range = request.headers.get('Range');
	if (!range) return new Response(file, { headers });
	const match = /^bytes=(\d*)-(\d*)$/.exec(range);
	let start = NaN, end = NaN;
	if (match && (match[1] || match[2])) {
		start = match[1] ? Number(match[1]) : Math.max(0, file.size - Number(match[2]));
		end = match[1] && match[2] ? Math.min(Number(match[2]), file.size - 1) : file.size - 1;
	}
	if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= file.size) {
		headers.set('Content-Range', 'bytes */' + file.size);
		headers.set('Content-Length', '0');
		return new Response(null, { status: 416, headers });
	}
	headers.set('Content-Range', `bytes ${start}-${end}/${file.size}`);
	headers.set('Content-Length', String(end - start + 1));
	return new Response(file.slice(start, end + 1), { status: 206, headers });
}
