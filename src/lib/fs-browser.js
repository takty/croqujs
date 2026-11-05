import { FileSystemBase, splitPath, toBytes, sortEntries, unsupported } from './fs-common.js';
export { joinPath, baseName, directoryName, extension, pathSeparator } from './fs-common.js';

/** File System Access adapter. */
export class BrowserFileSystem extends FileSystemBase {
	#root;

	constructor(root) {
		super();
		if (root?.kind !== 'directory') {
			throw new TypeError('Root must be a directory handle');
		}
		this.#root = root;
	}

	get name() {
		return this.#root.name;

	}
	get capabilities() {
		return { moduleDirectory: false, fileURL: false, hideDirectory: false };
	}

	async #handle(relative) {
		if (relative === '') return this.#root;
		const { parent, name } = await this.#parent(relative);
		try {
			return await parent.getFileHandle(name);
		} catch (error) {
			if (error.name !== 'TypeMismatchError') {
				throw error;
			}
			return parent.getDirectoryHandle(name);
		}
	}
	async isDirectory(relative = '') {
		return (await this.#handle(relative)).kind === 'directory';
	}

	async isFile(relative) {
		return (await this.#handle(relative)).kind === 'file';
	}
	async isWritable(relative = '') {
		const handle = await this.#handle(relative);
		if (typeof handle.queryPermission !== 'function') {
			throw unsupported('isWritable');
		}
		return await handle.queryPermission({ mode: 'readwrite' }) === 'granted';
	}
	async createDirectory(relative) {
		const { parent, name } = await this.#parent(relative);
		if (await this.exists(relative)) {
			const error = new Error('Entry already exists');
			error.code = 'EEXIST';
			throw error;
		}
		// File System Access has no exclusive directory creation primitive.
		await parent.getDirectoryHandle(name, { create: true });
	}
	async createTempDirectory(prefix = 'tmp-') {
		if (typeof prefix !== 'string' || prefix.includes('/')) {
			throw new TypeError('Expected a name prefix');
		}
		splitPath(prefix + 'temp', false);
		for (let attempt = 0; attempt < 10; ++attempt) {
			const name = prefix + globalThis.crypto.randomUUID();
			try {
				await this.createDirectory(name);
				return name;
			} catch (error) {
				if (error.code !== 'EEXIST') {
					throw error;
				}
			}
		}
		throw new Error('Unable to create a unique temporary directory');
	}

	static async open(options = {}) {
		if (typeof globalThis.showDirectoryPicker !== 'function') {
			throw new Error('Directory picker is not supported');
		}
		try {
			return new BrowserFileSystem(await globalThis.showDirectoryPicker({ mode: 'readwrite', ...options }));
		} catch (error) {
			if (error.name === 'AbortError') return null;
			throw error;
		}
	}

	async #directory(parts, create = false) {
		let handle = this.#root;
		for (const part of parts) handle = await handle.getDirectoryHandle(part, { create });
		return handle;
	}

	async #parent(relative) {
		const parts = splitPath(relative, false);
		const name = parts.pop();
		return { parent: await this.#directory(parts), name };
	}

	async readDirectory(relative = '') {
		const directory = await this.#directory(splitPath(relative));
		const entries = [];
		for await (const [name, handle] of directory.entries()) {
			entries.push({ name, kind: handle.kind });
		}
		return sortEntries(entries);
	}

	async readFile(relative) {
		const { parent, name } = await this.#parent(relative);
		const handle = await parent.getFileHandle(name);
		return new Uint8Array(await (await handle.getFile()).arrayBuffer());
	}

	async readText(relative) {
		return new TextDecoder('utf-8', { ignoreBOM: true }).decode(await this.readFile(relative));
	}

	async writeFile(relative, data) {
		const bytes = toBytes(data);
		const { parent, name } = await this.#parent(relative);
		const handle = await parent.getFileHandle(name, { create: true });
		const writable = await handle.createWritable();
		try {
			await writable.write(bytes);
			await writable.close();
		} catch (error) {
			try {
				await writable.abort();
			} catch {
				/* Preserve the original failure. */
			}
			throw error;
		}
	}

	async makeDirectory(relative, { recursive = false } = {}) {
		const parts = splitPath(relative, false);
		if (recursive) {
			await this.#directory(parts, true);
			return;
		}
		const name = parts.pop();
		await (await this.#directory(parts)).getDirectoryHandle(name, { create: true });
	}

	async remove(relative, { recursive = false } = {}) {
		const { parent, name } = await this.#parent(relative);
		await parent.removeEntry(name, { recursive });
	}

	async #pick(kind, options) {
		const picker = kind === 'file' ? globalThis.showOpenFilePicker : globalThis.showDirectoryPicker;
		if (typeof picker !== 'function') {
			throw new Error('Picker is not supported');
		}
		let handle;
		try {
			const result = await picker.call(globalThis, { ...options, startIn: this.#root, multiple: false });
			handle = kind === 'file' ? result[0] : result;
		} catch (error) {
			if (error.name === 'AbortError') return null;
			throw error;
		}
		const parts = await this.#root.resolve(handle);
		if (parts === null) {
			throw new Error('Selection is outside the root directory');
		}
		const relative = parts.join('/');
		splitPath(relative, kind === 'directory');
		return relative;
	}

	async pickFile(options = {}) {
		return this.#pick('file', options);
	}

	async pickDirectory(options = {}) {
		return this.#pick('directory', options);
	}

}

export default BrowserFileSystem;
