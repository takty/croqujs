/**
 * Session Local - provisional browser-only session
 *
 * @author Takuto Yanagida
 * @version 2026-11-07
 */

import { Backup } from '../project/backup.js';
import { BrowserExporter } from '../project/exporter-browser.js';
import { BrowserUrlProvider } from '../execution/url-provider-browser.js';
import { FileSystemBase } from 'fs-nw/base';
import { Lsc } from '../lib/lsc.js';
import { WebFileSystem } from 'fs-nw/web';
import { showOpenProjectDialog, showSaveProjectDialog } from '../study/ui/project-dialog.js';

export class SessionLocal {

	#id;
	#res;
	#field = null;
	#hiddenFrame = null;
	#provider = null;
	#running = null;
	#cleanup = Promise.resolve();
	#generation = 0;
	#openError = null;
	#files;
	#filePath;
	#opening = null;
	#backup;
	#modified = false;
	#modificationVersion = 0;
	#codeCache = '';

	constructor(id, { files = new FileSystemBase(), filePath = null } = {}) {
		this.#id = id;
		this.#files = files;
		this.#filePath = filePath;
		this.#resetBackup();
		window.addEventListener('pagehide', () => {
			this.onStudyProgramClosed();
			this.#field?.close();
		});
	}

	setResources(res) {
		this.#res = res;
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
		const exporter = new BrowserExporter(this.#files, new URL('assets/injection.js', document.baseURI));
		this.#provider = new BrowserUrlProvider(this.#id, exporter, new URL('assets/url-provider-worker.js', document.baseURI));
		return this.#provider;
	}

	addWindowCloseListener() {
		// Study handles unsaved changes through beforeunload in the browser.
	}

	getPathForFile() { return null; }

	// Browser UI owns developer tools.
	onStudyToggleDevTools() {}
	onStudyModified() {
		this.#modified = true;
		this.#modificationVersion++;
	}
	async onStudyErrorOccurred(info) {
		if (await this.#canWrite()) await this.#backup.backupErrorLog(info, this.#codeCache);
	}
	onStudyToggleDevToolsField() {}
	onStudyProgramClosed() {
		this.#removeHiddenFrame();
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
		this.#resetBackup();
		return ['init', [null, '', '', '', false, [], '']];
	}

	async doUnmaximize() {
		// Browser pages cannot change the OS maximized state.
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
		} catch (error) {
			console.warn(error.message);
		}
		return ['nop'];
	}

	doOpen() {
		return this.#openDialog(this.#files.getDirectoryHandle?.() ?? null);
	}

	async #openDocument(root, filePath) {
		const files = new WebFileSystem(root);
		const text = await files.readText(filePath);
		const definitions = await new BrowserExporter(files).loadDefJsons(text, filePath);
		this.onStudyProgramClosed();
		await this.#cleanup;
		this.#provider = null;
		this.#files = files;
		this.#filePath = filePath;
		this.#resetBackup();
		return ['init', [filePath, files.baseName(filePath, '.js'), files.baseName(filePath),
			files.directoryName(filePath), false, definitions, text]];
	}

	async #openDialog(root, droppedFile = null) {
		if (this.#opening) return ['nop'];
		this.#opening = showOpenProjectDialog({
			res: this.#res,
			root, droppedFile,
			open: (root, path) => this.#openDocument(root, path),
		});
		try { return await this.#opening ?? ['nop']; }
		finally { this.#opening = null; }
	}

	getDroppedFile(dataTransfer) {
		// Capture the handle before the drop event ends, including before confirmation.
		const item = [...dataTransfer.items].find(item => item.kind === 'file');
		if (!item?.getAsFileSystemHandle) return Promise.resolve(null);
		return item.getAsFileSystemHandle().catch(error => ({ error }));
	}

	async doFileDropped(pendingHandle) {
		try {
			const handle = await pendingHandle;
			if (handle?.error) throw handle.error;
			if (!handle) return this.#unsupported();
			if (this.#opening) return ['nop'];
			if (handle.kind === 'directory') return await this.#openDialog(handle);
			if (!handle.name.toLowerCase().endsWith('.js')) throw new Error(this.#res.projectDialog.script);
			const root = this.#files.getDirectoryHandle?.();
			const parts = root ? await root.resolve(handle) : null;
			if (parts?.length) return await this.#openDocument(root, parts.join('/'));
			return await this.#openDialog(null, handle);
		} catch (error) {
			return ['alert_error', '\n' + error.message];
		}
	}

	async doClose(text = this.#codeCache) {
		if (this.#modified && await this.#canWrite()) await this.#backup.backupText(text);
		// Study has already asked whether to discard edits. If closing is refused,
		// preserve both the document and its beforeunload protection.
		const beforeUnload = window.onbeforeunload;
		if (window.opener) {
			try {
				window.onbeforeunload = null;
				window.close();
				await new Promise(resolve => setTimeout(resolve, 0));
				if (window.closed) return ['nop'];
			} finally {
				if (!window.closed) window.onbeforeunload = beforeUnload;
			}
		}
		const ja = (document.documentElement.lang || navigator.language).startsWith('ja');
		return ['alert_error', '\n' + (ja ? 'このタブはブラウザの操作で閉じてください。' : 'Please close this tab using the browser controls.')];
	}
	async doSave(text, title) {
		if (!this.#filePath) return this.doSaveAs(text, title);
		const modificationVersion = this.#modificationVersion;
		try {
			await this.#requireWrite();
			const files = this.#files, path = this.#filePath;
			const definitions = await new BrowserExporter(files).loadDefJsons(text, path);
			await this.#backup.backupExistingFile(text, path);
			await files.writeText(path, text.replace(/\r?\n/g, '\r\n'));
			this.#modified = this.#modificationVersion !== modificationVersion;
			return ['path', [path, files.baseName(path, '.js'), files.baseName(path),
				files.directoryName(path), false, definitions]];
		} catch (error) {
			return ['alert_error', '\n' + error.message];
		}
	}
	doSaveAs(text, title) {
		return this.#saveAs(text, title, false);
	}

	doSaveCopy(text, title) {
		return this.#saveAs(text, title, true);
	}

	async #saveAs(text, title, copy) {
		if (this.#opening) return ['nop'];
		const modificationVersion = this.#modificationVersion;
		this.#opening = showSaveProjectDialog({
			res: this.#res,
			root: this.#files.getDirectoryHandle?.() ?? null,
			title,
			suggestedName: this.#filePath ? this.#files.baseName(this.#filePath) : 'untitled.js',
			save: async (root, path) => {
				await this.#requireWrite(root);
				const files = new WebFileSystem(root);
				const definitions = copy ? null : await new BrowserExporter(files).loadDefJsons(text, path);
				const backup = new Backup(files);
				backup.setFilePath(path);
				await backup.backupExistingFile(text, path);
				await files.writeText(path, text.replace(/\r?\n/g, '\r\n'));
				if (copy) {
					// Remember a newly chosen root, but keep the document untitled.
					if (!this.#files.getDirectoryHandle?.()) {
						this.onStudyProgramClosed();
						await this.#cleanup;
						this.#provider = null;
						this.#files = files;
					}
					return ['nop'];
				}
				this.onStudyProgramClosed();
				await this.#cleanup;
				this.#provider = null;
				this.#files = files;
				this.#filePath = path;
				this.#backup = backup;
				this.#modified = this.#modificationVersion !== modificationVersion;
				return ['path', [path, files.baseName(path, '.js'), files.baseName(path),
					files.directoryName(path), false, definitions]];
			},
		});
		try { return await this.#opening ?? ['nop']; }
		finally { this.#opening = null; }
	}
	async doExportAsWebPage(text) {
		if (!this.#filePath) return this.#unsupported();
		try {
			await this.#requireWrite();
			const files = this.#files, path = this.#filePath;
			// Generate everything before replacing an existing explicit export.
			const [success, content] = await new BrowserExporter(files).createWebPage(text, path);
			if (!success) throw new Error('Could not export: ' + content);
			const directory = files.joinPath(files.directoryName(path), files.baseName(path, files.extension(path)) + '.export');
			await files.removeDirectoryTree(directory);
			await files.createDirectory(directory);
			for (const [relative, value] of content.files) {
				const destination = files.joinPath(directory, relative);
				await files.makeDirectory(files.directoryName(destination), { recursive: true });
				await files.writeText(destination, value);
			}
			return ['success_export', 'exportedAsWebPage'];
		} catch (error) {
			return ['alert_error', '\n' + error.message];
		}
	}

	async doExportAsLibrary(text, libName, isUseDecIncluded, jsonCodeStructure) {
		if (!this.#filePath) return this.#unsupported();
		try {
			await this.#requireWrite();
			const files = this.#files;
			const name = libName.replace(/[ .+\/\\-]/g, '_');
			const path = files.joinPath(files.directoryName(this.#filePath), name + '.lib.js');
			const [success, content] = await new BrowserExporter(files).createLibrary(
				text, this.#filePath, name.toUpperCase(), JSON.parse(jsonCodeStructure), isUseDecIncluded);
			if (!success) throw new Error('Could not export: ' + content);
			await files.writeText(path, content);
			return ['success_export', 'exportedAsLibrary'];
		} catch (error) {
			return ['alert_error', '\n' + error.message];
		}
	}

	#resetBackup() {
		this.#backup = new Backup(this.#files);
		this.#backup.setFilePath(this.#filePath);
		this.#modified = false;
		this.#codeCache = '';
	}

	async #canWrite() {
		if (!this.#filePath) return false;
		try {
			return await this.#files.isWritable('');
		} catch { return false; }
	}

	async #requireWrite(root = this.#files.getDirectoryHandle()) {
		if (await root.requestPermission({ mode: 'readwrite' }) !== 'granted') {
			throw new Error('Write permission to the root directory is required.');
		}
	}

	doRun(text) {
		return this.#execute(text, true);
	}

	doRunWithoutWindow(text) {
		return this.#execute(text, false);
	}

	#removeHiddenFrame() {
		this.#hiddenFrame?.remove();
		this.#hiddenFrame = null;
	}

	async #execute(text, visible) {
		if (this.#running) return ['nop'];
		this.#removeHiddenFrame();
		new Lsc('#study_' + this.#id).send('#field_' + this.#id, { message: 'callFieldMethod', params: { method: 'closeProgram', args: [] } });
		const generation = ++this.#generation;
		const cleanup = this.#cleanup;
		this.#running = (async () => {
			try {
				await cleanup;
				this.#codeCache = text;
				if (this.#modified && await this.#canWrite()) await this.#backup.backupText(text);
				if (visible) await this.#waitForField();
				const provider = await this.#getProvider();
				const url = await provider.createUrl(text, this.#filePath);
				if (generation !== this.#generation || (visible && this.#field.closed)) {
					await provider.dispose();
					return ['nop'];
				}
				if (visible) return ['open', url];
				const frame = document.createElement('iframe');
				frame.hidden = true;
				frame.title = 'Croqujs background execution';
				frame.dataset.croqujsExecution = this.#id;
				frame.src = url;
				this.#hiddenFrame = frame;
				document.body.appendChild(frame);
				return ['nop'];
			} catch (error) {
				return ['alert_error', '\n' + error.message];
			}
		})();
		try { return await this.#running; }
		finally { this.#running = null; }
	}

	#unsupported() {
		const message = navigator.language.startsWith('ja')
			? 'Web版ではこの操作はまだ利用できません。'
			: 'This operation is not yet available in the web version.';
		return ['alert_error', '\n' + message];
	}
}

export { SessionLocal as Session };
