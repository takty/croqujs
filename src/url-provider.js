/**
 * URL Provider
 *
 * @author Takuto Yanagida
 * @version 2026-11-03
 */

import * as FS from './fs-node.js';
import { Exporter } from './exporter.js';

export class LibraryError extends Error {}

/** Issues program URLs for one session. A URL is valid until replacement or disposal. */
export class UrlProvider {

	constructor(sessionId, exporter = new Exporter()) {
		this._sessionId = sessionId;
		this._exporter  = exporter;
		this._expDir    = null;
	}

	createUrl(codeStr, filePath) {
		const ret = this._exporter.checkLibraryReadable(codeStr, filePath);
		if (ret !== true) throw new LibraryError(ret);

		this.dispose();
		this._expDir = FS.createTempDir('croqujs-');
		try {
			const [success, expPath] = this._exporter.exportAsWebPage(codeStr, filePath, this._expDir, true);
			if (!success) throw new LibraryError(expPath);

			const baseUrl = FS.executionFileURL(expPath);
			return baseUrl + '#' + this._sessionId + ',' + this._exporter.userCodeOffset();
		} catch (error) {
			this.dispose();
			throw error;
		}
	}

	dispose() {
		if (this._expDir === null) return;
		FS.removeDirectoryTree(this._expDir);
		this._expDir = null;
	}
}
