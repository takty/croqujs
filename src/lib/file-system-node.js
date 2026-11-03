import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { FileSystemBase, splitPath, toBytes, sortEntries, unsupported } from './file-system-common.js';
export { joinPath, baseName, directoryName, extension, pathSeparator } from './file-system-common.js';

/** With a root, paths are portable and root-relative. Without one, use native OS paths. */
export class NodeFileSystem extends FileSystemBase {
	#root;
	#pickers;

	constructor(root = null, { pickFile, pickDirectory } = {}) {
		super();
		if (root !== null && (typeof root !== 'string' || !path.isAbsolute(root))) {
			throw new TypeError('Root must be an absolute directory path');
		}
		this.#root = root === null ? null : path.resolve(root);
		this.#pickers = { pickFile, pickDirectory };
	}

	get name() {
		return this.#root === null ? '' : path.basename(this.#root) || this.#root;
	}

	get pathSeparator() {
		return this.#root === null ? path.sep : super.pathSeparator;
	}

	joinPath(...parts) {
		return this.#root === null ? path.join(...parts) : super.joinPath(...parts);
	}

	baseName(value, suffix) {
		return this.#root === null ? path.basename(value, suffix) : super.baseName(value, suffix);
	}

	directoryName(value) {
		return this.#root === null ? path.dirname(value) : super.directoryName(value);
	}

	extension(value) {
		return this.#root === null ? path.extname(value) : super.extension(value);
	}

	get capabilities() {
		return { moduleDirectory: true, fileURL: true, hideDirectory: process.platform === 'win32' };
	}

	async isDirectory(relative = '') {
		return (await fs.stat(await this.#resolve(relative))).isDirectory();
	}

	async isFile(relative) {
		return (await fs.stat(await this.#resolve(relative))).isFile();
	}

	// Match fs-node's owner-write-bit policy; this is not a guarantee that a write will succeed.
	async isWritable(relative = '') {
		return ((await fs.stat(await this.#resolve(relative))).mode & 0x0080) !== 0;
	}

	async createDirectory(relative) {
		await fs.mkdir(await this.#resolve(relative, { allowRoot: false, missing: true }));
	}

	async createTempDirectory(prefix = 'tmp-') {
		if (typeof prefix !== 'string' || prefix.includes('/')) {
			throw new TypeError('Expected a name prefix');
		}
		splitPath(prefix + 'temp', false);
		const root = this.#root === null ? tmpdir() : await this.#resolve('');
		const created = await fs.mkdtemp(root + path.sep + prefix);
		return this.#root === null ? created : path.basename(created);
	}

	moduleDirectory(url) {
		return path.dirname(fileURLToPath(url));
	}

	async toFileURL(relative) {
		return pathToFileURL(await this.#resolve(relative, { missing: true })).href;
	}

	async executionFileURL(relative) {
		return 'file:///' + (await this.#resolve(relative, { missing: true })).replace(/\\/g, '/');
	}

	async hideDirectory(relative) {
		if (!this.capabilities.hideDirectory) {
			throw unsupported('hideDirectory');
		}
		if (!(await this.isDirectory(relative))) {
			throw new Error('Not a directory');
		}
		await promisify(execFile)('attrib', ['+H', await this.#resolve(relative)], { windowsHide: true });
	}

	async #resolve(relative, { allowRoot = true, missing = false } = {}) {
		if (this.#root === null) {
			if (typeof relative !== 'string' || (!allowRoot && relative === '')) {
				throw new TypeError('Expected a non-empty filesystem path');
			}
			return path.resolve(relative);
		}
		const parts = splitPath(relative, allowRoot);
		let current = await fs.realpath(this.#root);
		if (!(await fs.stat(current)).isDirectory()) {
			throw new Error('Root is not a directory');
		}
		for (const [index, part] of parts.entries()) {
			current = path.join(current, part);
			let stat;
			try {
				stat = await fs.lstat(current);
			} catch (error) {
				if (missing && error.code === 'ENOENT') continue;
				throw error;
			}
			if (stat.isSymbolicLink()) {
				throw new Error('Symbolic links are not supported');
			}
			if (index < parts.length - 1 && !stat.isDirectory()) {
				throw new Error('Parent is not a directory');
			}
		}
		return current;
	}

	async readDirectory(relative = '') {
		const directory = await this.#resolve(relative);
		const entries = await fs.readdir(directory, { withFileTypes: true });
		if (this.#root === null) {
			const result = [];
			for (const entry of entries) {
				let stat = entry;
				if (entry.isSymbolicLink()) {
					try {
						stat = await fs.stat(path.join(directory, entry.name));
					} catch (error) {
						if (error.code === 'ENOENT') continue;
						throw error;
					}
				}
				if (stat.isFile() || stat.isDirectory()) {
					result.push({ name: entry.name, kind: stat.isDirectory() ? 'directory' : 'file' });
				}
			}
			return sortEntries(result);
		}
		return sortEntries(entries.filter(e => e.isFile() || e.isDirectory())
			.map(e => ({ name: e.name, kind: e.isDirectory() ? 'directory' : 'file' })));
	}

	async readFile(relative) {
		const target = await this.#resolve(relative, { allowRoot: false });
		if (!(await fs.stat(target)).isFile()) {
			throw new Error('Not a regular file');
		}
		return new Uint8Array(await fs.readFile(target));
	}

	async readText(relative) {
		return new TextDecoder('utf-8', { ignoreBOM: true }).decode(await this.readFile(relative));
	}

	async readTextAsync(relative) {
		if (this.#root !== null) return super.readTextAsync(relative);
		try {
			return await this.readText(relative);
		} catch {
			return undefined;
		}
	}

	async readTextOrNull(relative) {
		if (this.#root !== null) return super.readTextOrNull(relative);
		try {
			return await this.readText(relative);
		} catch {
			return null;
		}
	}

	async copyTextFile(from, to, dest = this) {
		if (this.#root !== null) return super.copyTextFile(from, to, dest);
		try {
			const text = await this.readText(from);
			const parent = dest.directoryName(to);
			if (parent) await dest.makeDirectory(parent, { recursive: true });
			await dest.writeText(to, text);
			return true;
		} catch {
			return false;
		}
	}

	async removeDirectoryTree(relative) {
		if (this.#root !== null) return super.removeDirectoryTree(relative);
		const target = await this.#resolve(relative, { allowRoot: false });
		try {
			if (!(await fs.lstat(target)).isDirectory()) throw new Error('Not a directory');
			await fs.rm(target, { recursive: true });
		} catch (error) {
			if (error.code !== 'ENOENT') throw error;
		}
	}

	async writeFile(relative, data) {
		const bytes = toBytes(data);
		await fs.writeFile(await this.#resolve(relative, { allowRoot: false, missing: true }), bytes);
	}

	async makeDirectory(relative, { recursive = false } = {}) {
		const target = await this.#resolve(relative, { allowRoot: false, missing: true });
		try {
			await fs.mkdir(target, { recursive });
		} catch (error) {
			if (error.code !== 'EEXIST' || !(await fs.stat(target)).isDirectory()) {
				throw error;
			}
		}
	}

	async remove(relative, { recursive = false } = {}) {
		const target = await this.#resolve(relative, { allowRoot: false });
		if ((await fs.lstat(target)).isDirectory()) {
			if (recursive) {
				await fs.rm(target, { recursive: true });
			} else {
				await fs.rmdir(target);
			}
		} else {
			await fs.unlink(target);
		}
	}

	async #pick(kind, options) {
		const picker = this.#pickers[kind === 'file' ? 'pickFile' : 'pickDirectory'];
		if (!picker) {
			throw new Error('Provide a picker callback in the constructor');
		}
		const selected = await picker({ ...options, root: this.#root });
		if (selected == null) return null;
		if (typeof selected !== 'string' || !path.isAbsolute(selected)) {
			throw new TypeError('Picker must return an absolute path or null');
		}
		const relative = this.#root === null ? selected : path.relative(this.#root, selected).split(path.sep).join('/');
		const target = await this.#resolve(relative, { allowRoot: kind === 'directory' });
		const stat = await fs.stat(target);
		if (kind === 'file' ? !stat.isFile() : !stat.isDirectory()) {
			throw new Error('Unexpected selection type');
		}
		return relative;
	}

	async pickFile(options = {}) {
		return this.#pick('file', options);
	}

	async pickDirectory(options = {}) {
		return this.#pick('directory', options);
	}

}

export default NodeFileSystem;
