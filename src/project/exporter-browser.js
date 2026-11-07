/**
 * Browser Exporter
 *
 * @author Takuto Yanagida
 * @version 2026-11-06
 */

import { ExporterCore } from './exporter-core.js';
import { splitPath } from '../fs/fs-common.js';

// Share successful requests across exporters, keeping different URLs independent.
const injectionRequests = new Map();
function loadInjection(url) {
	const key = url.href;
	if (!injectionRequests.has(key)) {
		const request = fetch(key)
			.then(response => {
				if (!response.ok) throw new Error(`Could not load execution hooks: HTTP ${response.status}`);
				return response.text();
			})
			.catch(error => { injectionRequests.delete(key); throw error; });
		injectionRequests.set(key, request);
	}
	return injectionRequests.get(key);
}

/** Generates content without writes, DOM access, or Node dependencies. */
export class BrowserExporter extends ExporterCore {

	/** A URL loads hosted hooks; a string names a file in the supplied filesystem. */
	constructor(fs, injectionPath, injectionContent = null) {
		super(fs, injectionPath instanceof URL ? undefined : injectionPath);
		this._injectionUrl = injectionPath instanceof URL ? new URL(injectionPath.href) : null;
		this._injectionContent = injectionContent;
	}

	/** Share the root handle, not the adapter instance, with the execution worker. */
	getDirectoryHandle() {
		return this._fs.getDirectoryHandle?.() ?? null;
	}

	/** Check local file metadata without preloading static content. */
	async checkLibraryReadable(codeStr, filePath) {
		const base = filePath ? this._fs.directoryName(filePath) : null;
		for (const declaration of this._extractUseDeclarations(codeStr.split('\n'))) {
			const path = Array.isArray(declaration) ? declaration[0] : declaration;
			if (path.startsWith('http')) continue;
			if (base === null || !await this._isSourceFile(this._resolveDependency(base, path))) return path;
		}
		return true;
	}

	/** Resolve declarations against the script directory without leaving the selected root. */
	_resolveDependency(base, relative) {
		const parts = splitPath(base);
		if (relative.startsWith('/')) throw new TypeError('Dependency paths must be relative: ' + relative);
		for (const part of relative.split('/')) {
			if (part === '.' || part === '') continue;
			if (part === '..') {
				if (!parts.length) throw new TypeError('Dependency path escapes the selected root: ' + relative);
				parts.pop();
			} else {
				parts.push(...splitPath(part, false));
			}
		}
		const path = parts.join('/');
		splitPath(path, false);
		return path;
	}

	/** Return runtime files for a browser or Service Worker to serve. */
	async exportForExecution(codeText, filePath) {
		const [success, content] = await this.createWebPage(codeText, filePath, true, {
			deferStaticFiles: true,
			injectionContent: this._injectionUrl ? await loadInjection(this._injectionUrl) : this._injectionContent,
		});
		if (!success) return [false, content];
		const directory = filePath ? this._fs.directoryName(filePath) : '';
		const relocate = entries => new Map([...entries].map(([name, value]) => [this._fs.joinPath(directory, name), value]));
		content.files           = relocate(content.files);
		content.sources         = relocate(content.sources);
		content.entryPath       = this._fs.joinPath(directory, content.entryPath);
		content.sourceDirectory = '';
		return [true, content];
	}

}
