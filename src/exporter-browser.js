/**
 * Browser Exporter
 *
 * @author Takuto Yanagida
 * @version 2026-11-06
 */

import { ExporterCore } from './exporter-core.js';

/** Generates content without writes, DOM access, or Node dependencies. */
export class BrowserExporter extends ExporterCore {

	constructor(fs, injectionPath, injectionContent = null) {
		super(fs, injectionPath);
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
			if (base === null || !await this._isSourceFile(this._fs.joinPath(base, path))) return path;
		}
		return true;
	}

	/** Return runtime files for a browser or Service Worker to serve. */
	async exportForExecution(codeText, filePath) {
		const [success, content] = await this.createWebPage(codeText, filePath, true, {
			deferStaticFiles: true, injectionContent: this._injectionContent,
		});
		if (!success) return [false, content];
		const directory = filePath ? this._fs.directoryName(filePath) : '';
		const relocate = entries => new Map([...entries].map(([name, value]) => [this._fs.joinPath(directory, name), value]));
		content.files = relocate(content.files);
		content.sources = relocate(content.sources);
		content.entryPath = this._fs.joinPath(directory, content.entryPath);
		content.sourceDirectory = '';
		return [true, content];
	}

}
