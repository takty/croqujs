/**
 * Session Local - provisional browser-only session
 *
 * @author Takuto Yanagida
 * @version 2026-11-06
 */

import { BrowserExporter } from '../exporter-browser.js';
import { BrowserUrlProvider } from '../url-provider-browser.js';
import { FileSystemBase } from '../lib/fs-common.js';
import { Lsc } from '../lib/lsc.js';
import { BrowserFileSystem } from '../lib/fs-browser.js';
import { showOpenProjectDialog } from './ui/open-project-dialog.js';

export class SessionLocal {

	#id;
	#field = null;
	#provider = null;
	#running = null;
	#cleanup = Promise.resolve();
	#generation = 0;
	#openError = null;
	#files;
	#filePath;
	#opening = null;

	constructor(id, { files = new FileSystemBase(), filePath = null } = {}) {
		this.#id = id;
		this.#files = files;
		this.#filePath = filePath;
		window.addEventListener('pagehide', () => {
			this.onStudyProgramClosed();
			this.#field?.close();
		});
	}

	prepareRun() {
		this.#openError = null;
		if (!this.#field || this.#field.closed) {
			const url = new URL('field/', document.baseURI);
			url.hash = this.#id;
			this.#field = window.open(url.href, 'croqujs-field-' + this.#id);
		}
		if (!this.#field) this.#openError = new Error('Allow pop-ups to open the execution window.');
	}

	async #waitForField() {
		if (this.#openError) throw this.#openError;
		if (!this.#field || this.#field.closed) throw new Error('The execution window is closed.');
		await new Promise((resolve, reject) => {
			const finish = error => {
				clearInterval(poller);
				clearTimeout(timeout);
				window.removeEventListener('message', receive);
				error ? reject(error) : resolve();
			};
			const receive = event => {
				if (event.origin === location.origin && event.source === this.#field &&
					event.data?.type === 'croqujs-field-ready' && event.data.id === this.#id) finish();
			};
			const poller = setInterval(() => {
				if (this.#field.closed) finish(new Error('The execution window is closed.'));
				else this.#field.postMessage({ type: 'croqujs-field-ping', id: this.#id }, location.origin);
			}, 50);
			const timeout = setTimeout(() => finish(new Error('Execution window did not become ready.')), 10000);
			window.addEventListener('message', receive);
		});
	}

	async #getProvider() {
		if (this.#provider) return this.#provider;
		const response = await fetch(new URL('lib/injection.js', document.baseURI));
		if (!response.ok) throw new Error('Could not load execution hooks.');
		const exporter = new BrowserExporter(this.#files, undefined, await response.text());
		this.#provider = new BrowserUrlProvider(this.#id, exporter, new URL('url-provider-worker.js', document.baseURI));
		return this.#provider;
	}


	addWindowCloseListener() {
		// Study handles unsaved changes through beforeunload in the browser.
	}

	getPathForFile() { return null; }

	onStudyToggleDevTools() {}
	onStudyModified() {}
	onStudyErrorOccurred() {}
	onStudyToggleDevToolsField() {}
	onStudyProgramClosed() {
		new Lsc('#study_' + this.#id).send('#field_' + this.#id, { message: 'callFieldMethod', params: { method: 'closeProgram', args: [] } });
		this.#generation += 1;
		// Serialize disposal after any in-flight registration.
		this.#cleanup = Promise.all([this.#cleanup, this.#running]).then(() => this.#provider?.dispose()).catch(console.error);
	}

	onStudyTitleChanged(title) {
		document.title = title;
	}

	doReady() {
		return this.doNew();
	}

	async doNew() {
		this.onStudyProgramClosed();
		await this.#cleanup;
		this.#provider = null;
		this.#filePath = null;
		return ['init', [null, '', '', '', false, [], '']];
	}

	doUnmaximize() { return ['nop']; }

	// File commands will be connected to the browser adapters later.
	async doOpen() {
		if (this.#opening) return ['nop'];
		this.#opening = showOpenProjectDialog({
			root: this.#files.getDirectoryHandle?.() ?? null,
			open: async (root, filePath) => {
				const files = new BrowserFileSystem(root);
				const text = await files.readText(filePath);
				const definitions = await new BrowserExporter(files).loadDefJsons(text, filePath);
				this.onStudyProgramClosed();
				await this.#cleanup;
				this.#provider = null;
				this.#files = files;
				this.#filePath = filePath;
				return ['init', [filePath, files.baseName(filePath, '.js'), files.baseName(filePath),
					files.directoryName(filePath), false, definitions, text]];
			},
		});
		try { return await this.#opening ?? ['nop']; }
		finally { this.#opening = null; }
	}
	doClose() { return this.#unsupported(); }
	doFileDropped() { return this.#unsupported(); }
	doSave() { return this.#unsupported(); }
	doSaveAs() { return this.#unsupported(); }
	doSaveCopy() { return this.#unsupported(); }
	doExportAsWebPage() { return this.#unsupported(); }
	doExportAsLibrary() { return this.#unsupported(); }
	async doRun(text) {
		if (this.#running) return ['nop'];
		const generation = ++this.#generation;
		const cleanup = this.#cleanup;
		this.#running = (async () => {
			try {
				await cleanup;
				await this.#waitForField();
				const provider = await this.#getProvider();
				const url = await provider.createUrl(text, this.#filePath);
				if (generation !== this.#generation || this.#field.closed) {
					await provider.dispose();
					return ['nop'];
				}
				return ['open', url];
			} catch (error) {
				return ['alert_error', '\n' + error.message];
			}
		})();
		try { return await this.#running; }
		finally { this.#running = null; }
	}
	doRunWithoutWindow() { return this.#unsupported(); }

	#unsupported() {
		const message = navigator.language.startsWith('ja')
			? 'Web版ではこの操作はまだ利用できません。'
			: 'This operation is not yet available in the web version.';
		return ['alert_error', '\n' + message];
	}
}

export { SessionLocal as Session };
