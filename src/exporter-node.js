/**
 * Node Exporter
 *
 * @author Takuto Yanagida
 * @version 2026-11-06
 */

import { ExporterCore } from './exporter-core.js';

/** Saves generated content through the supplied filesystem. */
export class NodeExporter extends ExporterCore {

	async exportAsLibrary(codeText, filePath, nameSpace, codeStructure, isUseDecIncluded = false) {
		const [success, content] = await this.createLibrary(codeText, filePath, nameSpace, codeStructure, isUseDecIncluded);
		if (!success) {
			return [false, content];
		}
		await this._fs.writeText(filePath, content);
		return [await this._fs.exists(filePath), filePath];
	}

	// Explicit exports omit runtime hooks by default. The fourth argument remains compatible.
	async exportAsWebPage(codeText, filePath, dirPath, injection = false) {
		const [success, content] = await this.createWebPage(codeText, filePath, injection);
		if (!success) {
			return [false, content];
		}
		for (const [relative, text] of content.files) {
			const destPath = this._fs.joinPath(dirPath, relative);
			const parent   = this._fs.directoryName(destPath);
			if (parent) {
				await this._fs.makeDirectory(parent, { recursive: true });
			}
			await this._fs.writeText(destPath, text);
		}
		return [true, this._fs.joinPath(dirPath, content.entryPath)];
	}

	/** Save runtime content in the temporary directory owned by UrlProvider. */
	async exportForExecution(codeText, filePath, dirPath) {
		return this.exportAsWebPage(codeText, filePath, dirPath, true);
	}

	async copyLibraryOfTemplate(codeText, tempFilePath, dirPath) {
		const decs = this._extractUseDeclarations(codeText.split('\n'));

		const bp = this._fs.directoryName(tempFilePath);
		for (let dec of decs) {
			if (Array.isArray(dec)) {
				const p = dec[0];
				if (p.startsWith('http')) {
					return [false, p];
				}
				const destFn = this._fs.baseName(p, this._fs.extension(p)) + '.lib.js';
				const res    = await this._writeLibraryImmediately(this._fs.joinPath(bp, p), dec[1], this._fs.joinPath(dirPath, destFn));
				if (!res) {
					return [false, p];
				}
			} else {
				const p = dec;
				if (p.startsWith('http')) {
					continue;
				}
				const destFn   = dec.split(/\/|\\/).map(e => { return e === '..' ? '_' : e; }).join(this._fs.pathSeparator);
				const destPath = this._fs.joinPath(dirPath, destFn);
				if (await this._fs.exists(destPath)) {
					continue;
				}
				const res = await this._fs.copyTextFile(this._fs.joinPath(bp, p), destPath);
				if (!res) {
					return [false, p];
				}
			}
		}
		return [true];
	}

	// -------------------------------------------------------------------------

	async _writeLibraryImmediately(origPath, nameSpace, destPath) {
		const libCode = await this._readAsLibraryCode(origPath, nameSpace);
		if (libCode === false) {
			return false;
		}
		await this._fs.writeText(destPath, libCode);
		return await this._fs.exists(destPath);
	}

}
