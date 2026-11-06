/**
 * Browser Exporter
 *
 * @author Takuto Yanagida
 * @version 2026-11-06
 */

import { ExporterCore } from './exporter-core.js';

/** Generates content without writes, DOM access, or Node dependencies. */
export class BrowserExporter extends ExporterCore {

	/** Share the root handle, not the adapter instance, with the execution worker. */
	getDirectoryHandle() {
		return this._fs.getDirectoryHandle();
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
		return this.createWebPage(codeText, filePath, true, { deferStaticFiles: true });
	}

}
