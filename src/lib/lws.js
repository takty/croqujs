/**
 * Local Web Server client
 *
 * @author Takuto Yanagida
 */

const TIMEOUT = 30000;

export class Lws {

	#workerUrl;
	#scope;
	#namespace;
	#registration = null;

	constructor(workerUrl, { scope, namespace = 'lws' }) {
		this.#workerUrl = new URL(workerUrl);
		this.#scope = new URL(scope, this.#workerUrl);
		this.#namespace = namespace;
	}

	/**
	 * Serve a Map of generated text files and its entryPath under a new URL.
	 * An optional directory handle provides files resolved through content.sources
	 * or relative to content.sourceDirectory. Remove the allocation using its id.
	 */
	async publish(content, directoryHandle = null) {
		const registration = await this.#getRegistration();
		const id = crypto.randomUUID();
		try {
			const url = await this.#request(registration, { action: 'put', runId: id, content, directoryHandle });
			return { id, url };
		} catch (error) {
			try {
				await this.#request(registration, { action: 'delete', runId: id });
			} catch (cleanupError) {
				console.error(cleanupError);
			}
			throw error;
		}
	}

	async remove(id) {
		await this.#request(await this.#getRegistration(), { action: 'delete', runId: id });
	}

	async #getRegistration() {
		if (!globalThis.navigator?.serviceWorker) throw new Error('Service Workers are unavailable');
		if (this.#registration?.active?.state === 'activated') return this.#registration;
		const registration = await navigator.serviceWorker.register(this.#workerUrl, { type: 'module', scope: this.#scope.href });
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
				registration.active.postMessage({ type: this.#namespace, ...message }, [channel.port2]);
			} catch (error) {
				finish(error);
			}
		});
	}

}
