/**
 * URL Provider
 *
 * @author Takuto Yanagida
 * @version 2026-11-03
 */

export class LibraryError extends Error {}

/** Issues program URLs for one session. A URL is valid until replacement or disposal. */
export class UrlProvider {

	constructor(fs, sessionId, exporter) {
		this._fs        = fs;
		this._sessionId = sessionId;
		this._exporter  = exporter;
		this._expDir    = null;
	}

	async createUrl(codeStr, filePath) {
		const ret = await this._exporter.checkLibraryReadable(codeStr, filePath);
		if (ret !== true) throw new LibraryError(ret);

		await this.dispose();
		const expDir = await this._fs.createTempDirectory('croqujs-');
		this._expDir = expDir;
		try {
			const [success, expPath] = await this._exporter.exportAsWebPage(codeStr, filePath, expDir, true);
			if (!success) throw new LibraryError(expPath);

			const baseUrl = await this._fs.executionFileURL(expPath);
			return baseUrl + '#' + this._sessionId + ',' + this._exporter.userCodeOffset();
		} catch (error) {
			try {
				await this._fs.removeDirectoryTree(expDir);
				if (this._expDir === expDir) this._expDir = null;
			} catch (cleanupError) {
				console.error(cleanupError);
			}
			throw error;
		}
	}

	async dispose() {
		if (this._expDir === null) return;
		const expDir = this._expDir;
		await this._fs.removeDirectoryTree(expDir);
		if (this._expDir === expDir) this._expDir = null;
	}
}
