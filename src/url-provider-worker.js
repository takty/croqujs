/**
 * Execution Content Service Worker
 *
 * @author Takuto Yanagida
 * @version 2026-11-06
 */

import { splitPath, joinPath } from './lib/fs-common.js';
import { accessRun } from './url-provider-store.js';
import { fileResponse } from './url-provider-file-response.js';

const MESSAGE_TYPE = 'croqujs-execution';
const CACHE_PREFIX = 'croqujs-execution-v1:';
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('message', event => {
	if (event.data?.type !== MESSAGE_TYPE || !event.ports[0]) return;
	const port = event.ports[0];
	event.waitUntil((async () => {
		try {
			if (!event.source || new URL(event.source.url).origin !== self.location.origin) {
				throw new Error('Invalid execution content sender');
			}
			const { action, runId, content, directoryHandle } = event.data;
			if (typeof runId !== 'string' || !RUN_ID.test(runId)) throw new Error('Invalid execution ID');
			const cacheName = CACHE_PREFIX + self.registration.scope + runId;
			let value;
			if (action === 'put') value = await putContent(cacheName, runId, content, directoryHandle);
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
	if (!url.href.startsWith(self.registration.scope)) return;
	const runId = url.pathname.slice(new URL(self.registration.scope).pathname.length).split('/')[0];
	if (!RUN_ID.test(runId)) return;
	// respondWith must be called synchronously, before any cache lookup awaits.
	event.respondWith(readContent(event.request, url, runId));
});

function contentUrl(base, relative) {
	if (typeof relative !== 'string') throw new Error('Invalid execution file path');
	const parts = relative.split('/');
	if (parts.some(part => !part || part === '.' || part === '..' || /[\\\u0000-\u001f]/u.test(part))) {
		throw new Error('Invalid execution file path');
	}
	return new URL(parts.map(encodeURIComponent).join('/'), base).href;
}

async function putContent(cacheName, runId, content, directoryHandle = null) {
	if (!(content?.files instanceof Map) || !content.files.has(content.entryPath)) {
		throw new Error('Execution content has no entry file');
	}
	const base = new URL(runId + '/', self.registration.scope);
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
	return entryUrl;
}

async function readContent(request, url, runId) {
	if (request.method !== 'GET' && request.method !== 'HEAD') {
		return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
	}
	url.search = '';
	url.hash = '';
	try {
		const cacheName = CACHE_PREFIX + self.registration.scope + runId;
		const run = await accessRun('get', cacheName);
		if (!run) return failure(404);
		const response = await caches.match(url.href, { cacheName });
		if (response) {
			if (request.method === 'HEAD') return new Response(null, { status: response.status, headers: response.headers });
			return response;
		}
		if (!run.directoryHandle) return failure(404);
		const base = new URL(runId + '/', self.registration.scope);
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
