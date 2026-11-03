// Portable, root-relative paths only. Reject ambiguous Windows names as well.
export function splitPath(path, allowRoot = true) {
	if (typeof path !== 'string') {
		throw new TypeError('Path must be a string');
	}
	if (path === '' && allowRoot) return [];
	const parts = path.split('/');
	if (parts.some(part => !part || part === '.' || part === '..' ||
		/[\\:*?"<>|\u0000-\u001f]/u.test(part) || /[. ]$/u.test(part) ||
		/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part))) {
		throw new TypeError('Expected a portable relative path separated by /');
	}
	return parts;
}

export function toBytes(data) {
	if (typeof data === 'string') return new TextEncoder().encode(data);
	if (data instanceof Uint8Array) return data;
	if (data instanceof ArrayBuffer) return new Uint8Array(data);
	throw new TypeError('Data must be a string, Uint8Array, or ArrayBuffer');
}

export function sortEntries(entries) {
	return entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

// Path helpers deliberately retain the portable, root-relative path contract.
export const pathSeparator = '/';

export function joinPath(...parts) {
	return parts.flatMap(part => splitPath(part)).join('/');
}

export function baseName(relative, suffix = '') {
	const name = splitPath(relative).at(-1) ?? '';
	return suffix && name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
}

export function directoryName(relative) {
	return splitPath(relative).slice(0, -1).join('/');
}

export function extension(relative) {
	const name = baseName(relative);
	const index = name.lastIndexOf('.');
	return index > 0 ? name.slice(index) : '';
}

export function isMissing(error) {
	return error.code === 'ENOENT' || error.name === 'NotFoundError';
}

export function unsupported(operation) {
	const error = new Error(`${operation} is not supported in this environment`);
	error.name = 'NotSupportedError';
	error.code = 'ENOTSUP';
	return error;
}

/** Shared convenience API. I/O always returns a Promise; path helpers are synchronous. */
export class FileSystemBase {

	get pathSeparator() {
		return pathSeparator;
	}

	joinPath(...parts) {
		return joinPath(...parts);
	}

	baseName(relative, suffix) {
		return baseName(relative, suffix);
	}

	directoryName(relative) {
		return directoryName(relative);
	}

	extension(relative) {
		return extension(relative);
	}

	async exists(relative = '') {
		try {
			await this.isDirectory(relative);
			return true;
		} catch (error) {
			if (isMissing(error)) return false;
			throw error;
		}
	}

	async listDirectory(relative = '') {
		return (await this.readDirectory(relative)).map(entry => entry.name);
	}

	async writeText(relative, text) {
		if (typeof text !== 'string') {
			throw new TypeError('Text must be a string');
		}
		await this.writeFile(relative, text);
	}

	async writeTextAsync(relative, text) {
		await this.writeText(relative, text);
	}

	async readTextAsync(relative) {
		splitPath(relative, false);
		try {
			return await this.readText(relative);
		} catch {
			return undefined;
		}
	}

	async readTextOrNull(relative) {
		splitPath(relative, false);
		try {
			return await this.readText(relative);
		} catch {
			return null;
		}
	}

	async copyTextFile(from, to, dest = this) {
		splitPath(from, false);
		splitPath(to, false);
		try {
			const text = await this.readText(from);
			const parent = directoryName(to);
			if (parent) {
				await dest.makeDirectory(parent, { recursive: true });
			}
			await dest.writeText(to, text);
			return true;
		} catch {
			return false;
		}
	}

	async removeDirectoryTree(relative) {
		splitPath(relative, false);
		try {
			if (!(await this.isDirectory(relative))) {
				throw new Error('Not a directory');
			}
			await this.remove(relative, { recursive: true });
		} catch (error) {
			if (!isMissing(error)) throw error;
		}
	}

	moduleDirectory(_url) {
		throw unsupported('moduleDirectory');
	}

	async toFileURL(_relative) {
		throw unsupported('toFileURL');
	}

	async executionFileURL(relative) {
		return this.toFileURL(relative);
	}

	async hideDirectory(_relative) {
		throw unsupported('hideDirectory');
	}

}
