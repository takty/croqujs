/**
 * Browser URL Provider
 *
 * @author Takuto Yanagida
 * @version 2026-11-06
 */

import { Lws } from '../lib/lws.js';

export class LibraryError extends Error {}

/** Owns one execution URL. Await each createUrl/dispose call before issuing the next. */
export class BrowserUrlProvider {

	#sessionId;
	#exporter;
	#server;
	#runId = null;

	constructor(sessionId, exporter, workerUrl = new URL(/* @vite-ignore */ '../url-provider-worker.js', import.meta.url)) {
		this.#sessionId = sessionId;
		this.#exporter  = exporter;
		this.#server = new Lws(new URL(workerUrl, import.meta.url), {
			scope: './__croqujs_run__/',
			namespace: 'croqujs-execution',
		});
	}

	async createUrl(codeStr, filePath) {
		const readable = await this.#exporter.checkLibraryReadable(codeStr, filePath);
		if (readable !== true) throw new LibraryError(readable);
		const [success, result] = await this.#exporter.exportForExecution(codeStr, filePath);
		if (!success) throw new LibraryError(result);
		const { userCodeOffset, ...content } = result;
		const directoryHandle = await this.#exporter.getDirectoryHandle?.() ?? null;
		const { id, url } = await this.#server.publish(content, directoryHandle);
		try {
			await this.dispose();
		} catch (error) {
			try {
				await this.#server.remove(id);
			} catch (cleanupError) {
				console.error(cleanupError);
			}
			throw error;
		}
		this.#runId = id;
		return url + '#' + this.#sessionId + ',' + userCodeOffset;
	}

	async dispose() {
		if (this.#runId === null) return;
		await this.#server.remove(this.#runId);
		this.#runId = null;
	}

}
