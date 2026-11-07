/**
 * Backup
 *
 * @author Takuto Yanagida
 * @version 2026-11-03
 */

import jsSHA from '../lib/jssha/sha256.mjs';

export class Backup {

	constructor(fs) {
		this._fs = fs;
	}

	setFilePath(filePath) {
		this._filePath         = filePath;
		this._digest           = '';
		this._lastTimeStampStr = '';
	}

	async backupText(text) {
		if (!this._filePath) return false;

		text = text.replace(/\n/g, '\r\n');

		const digest = this._getDigest(text);
		if (digest === this._digest) return false;

		const ext  = this._fs.extension(this._filePath);
		const name = this._fs.baseName(this._filePath, ext);

		try {
			const backupDir = await this._ensureBackupDir(this._filePath);
			this._lastTimeStampStr = this._createTimeStampStr();
			const to = this._fs.joinPath(backupDir, name + this._lastTimeStampStr + ext);
			await this._fs.writeText(to, text);
		} catch (e) {
			console.error(e);
			return false;
		}
		this._digest = digest;
		return true;
	}

	async backupErrorLog(info, text) {
		if (!this._filePath) return false;

		await this.backupText(text);

		const log  = JSON.stringify(info, null, '\t');
		const ext  = this._fs.extension(this._filePath);
		const name = this._fs.baseName(this._filePath, ext);

		try {
			const backupDir = await this._ensureBackupDir(this._filePath);
			const to = this._fs.joinPath(backupDir, name + this._lastTimeStampStr + '.log');
			await this._fs.writeText(to, log);
		} catch (e) {
			console.error(e);
			return false;
		}
		return true;
	}

	async backupExistingFile(text, existingFilePath) {
		if (!(await this._fs.exists(existingFilePath))) return false;

		text = text.replace(/\n/g, '\r\n');
		const oldText = await this._fs.readText(existingFilePath);

		const digest = this._getDigest(text);
		if (digest === this._getDigest(oldText)) return false;

		const ext  = this._fs.extension(existingFilePath);
		const name = this._fs.baseName(existingFilePath, ext);

		try {
			const backupDir = await this._ensureBackupDir(existingFilePath);
			this._lastTimeStampStr = this._createTimeStampStr();
			const to = this._fs.joinPath(backupDir, name + this._lastTimeStampStr + ext);
			await this._fs.writeText(to, oldText);
		} catch (e) {
			console.error(e);
			return false;
		}
		this._digest = digest;
		return true;
	}

	_getDigest(text) {
		const hash = new jsSHA('SHA-256', 'UINT8ARRAY');
		hash.update(new TextEncoder().encode(text));
		return hash.getHash('HEX');
	}

	_createTimeStampStr() {
		const d  = new Date();
		const zp = (n) => { return n < 10 ? ('0' + n) : ('' + n); };
		return d.getFullYear() + zp(d.getMonth() + 1) + zp(d.getDate()) + zp(d.getHours()) + zp(d.getMinutes()) + zp(d.getSeconds()) + d.getMilliseconds();
	}

	async _ensureBackupDir(fp) {
		const name = this._fs.baseName(fp, this._fs.extension(fp));
		const dir  = this._fs.joinPath(this._fs.directoryName(fp), '.' + name + '.backup');
		try {
			await this._fs.createDirectory(dir);
		} catch (e) {
			if (e.code !== 'EEXIST' || !(await this._fs.isDirectory(dir))) throw e;
			return dir;
		}
		if (this._fs.capabilities.hideDirectory) {
			await this._fs.hideDirectory(dir);
		}
		return dir;
	}

}
