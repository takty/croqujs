import * as fs from 'node:fs/promises';
import path from 'node:path';

// Disk-backed File System Access handles for the shared consumer tests.
function handleError(error) {
	if (error.code === 'ENOENT') return new DOMException(error.message, 'NotFoundError');
	if (error.code === 'ENOTDIR' || error.code === 'EISDIR') return new DOMException(error.message, 'TypeMismatchError');
	return error;
}

function fileHandle(location) {
	return {
		kind: 'file', name: path.basename(location), location,
		async getFile() { return new File([await fs.readFile(location)], this.name); },
		async createWritable() {
			let bytes;
			return {
				async write(data) { bytes = data; },
				async close() { await fs.writeFile(location, bytes); },
				async abort() {},
			};
		},
	};
}

export function directoryHandle(location) {
	async function get(name, kind, { create = false } = {}) {
		const target = path.join(location, name);
		try {
			if (create) {
				if (kind === 'directory') await fs.mkdir(target).catch(error => { if (error.code !== 'EEXIST') throw error; });
				else await (await fs.open(target, 'a')).close();
			}
			const stat = await fs.stat(target);
			if (stat.isDirectory() !== (kind === 'directory')) throw new DOMException('Entry type mismatch', 'TypeMismatchError');
			return kind === 'directory' ? directoryHandle(target) : fileHandle(target);
		} catch (error) { throw handleError(error); }
	}
	return {
		kind: 'directory', name: path.basename(location), location,
		async queryPermission() { return 'granted'; },
		getDirectoryHandle(name, options) { return get(name, 'directory', options); },
		getFileHandle(name, options) { return get(name, 'file', options); },
		async *entries() {
			for (const entry of await fs.readdir(location, { withFileTypes: true })) {
				if (!entry.isFile() && !entry.isDirectory()) continue;
				yield [entry.name, await get(entry.name, entry.isDirectory() ? 'directory' : 'file')];
			}
		},
		async removeEntry(name, { recursive = false } = {}) {
			const target = path.join(location, name);
			try {
				if ((await fs.stat(target)).isDirectory() && !recursive) await fs.rmdir(target);
				else await fs.rm(target, { recursive });
			} catch (error) { throw handleError(error); }
		},
		async resolve(handle) {
			const relative = path.relative(location, handle.location);
			if (path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep)) return null;
			return relative ? relative.split(path.sep) : [];
		},
	};
}
