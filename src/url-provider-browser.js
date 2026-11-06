/**
 * Browser URL Provider
 *
 * @author Takuto Yanagida
 * @version 2026-11-06
 */

export class LibraryError extends Error {}

const MESSAGE_TYPE = 'croqujs-execution';
const TIMEOUT = 30000;

/** Owns one execution URL. Await each createUrl/dispose call before issuing the next. */
export class BrowserUrlProvider {

	#sessionId;
	#exporter;
	#workerUrl;
	#registration = null;
	#runId = null;

	constructor(sessionId, exporter, workerUrl = new URL(/* @vite-ignore */ './url-provider-worker.js', import.meta.url)) {
		this.#sessionId = sessionId;
		this.#exporter  = exporter;
		this.#workerUrl = new URL(workerUrl, import.meta.url);
	}

	async createUrl(codeStr, filePath) {
		const readable = await this.#exporter.checkLibraryReadable(codeStr, filePath);
		if (readable !== true) throw new LibraryError(readable);
		const [success, content] = await this.#exporter.exportForExecution(codeStr, filePath);
		if (!success) throw new LibraryError(content);
		const directoryHandle = await this.#exporter.getDirectoryHandle?.() ?? null;
		const registration = await this.#getRegistration();
		const runId = crypto.randomUUID();
		try {
			const url = await this.#request(registration, { action: 'put', runId, content, directoryHandle });
			await this.dispose();
			this.#runId = runId;
			return url + '#' + this.#sessionId + ',' + content.userCodeOffset;
		} catch (error) {
			try {
				await this.#request(registration, { action: 'delete', runId });
			} catch (cleanupError) {
				console.error(cleanupError);
			}
			throw error;
		}
	}

	async dispose() {
		if (this.#runId === null) return;
		await this.#request(await this.#getRegistration(), { action: 'delete', runId: this.#runId });
		this.#runId = null;
	}

	async #getRegistration() {
		if (!globalThis.navigator?.serviceWorker) throw new Error('Service Workers are unavailable');
		if (this.#registration?.active?.state === 'activated') return this.#registration;
		// Only generated execution pages are controlled; do not replace the host application's worker.
		const scope = new URL('./__croqujs_run__/', this.#workerUrl);
		const registration = await navigator.serviceWorker.register(this.#workerUrl, { type: 'module', scope: scope.href });
		const worker = registration.active ?? registration.installing ?? registration.waiting;
		if (!worker) throw new Error('Execution Service Worker was not installed');
		await new Promise((resolve, reject) => {
			const finish = error => {
				clearTimeout(timer);
				worker.removeEventListener('statechange', changed);
				error ? reject(error) : resolve();
			};
			const changed = () => {
				if (worker.state === 'activated') finish();
				else if (worker.state === 'redundant') finish(new Error('Execution Service Worker installation failed'));
			};
			const timer = setTimeout(() => finish(new Error('Execution Service Worker activation timed out')), TIMEOUT);
			worker.addEventListener('statechange', changed);
			changed();
		});
		this.#registration = registration;
		return registration;
	}

	#request(registration, message) {
		return new Promise((resolve, reject) => {
			const channel = new MessageChannel();
			const finish = (error, value) => {
				clearTimeout(timer);
				channel.port1.close();
				channel.port2.close();
				error ? reject(error) : resolve(value);
			};
			const timer = setTimeout(() => finish(new Error('Execution Service Worker request timed out')), TIMEOUT);
			channel.port1.onmessage = event => {
				const reply = event.data;
				if (reply?.success) finish(null, reply.value);
				else finish(new Error(reply?.error ?? 'Execution Service Worker request failed'));
			};
			channel.port1.onmessageerror = () => finish(new Error('Invalid execution Service Worker reply'));
			try {
				registration.active.postMessage({ type: MESSAGE_TYPE, ...message }, [channel.port2]);
			} catch (error) {
				finish(error);
			}
		});
	}

}
