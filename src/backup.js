/**
 * Backup
 *
 * @author Takuto Yanagida
 * @version 2026-11-03
 */

import * as FS from './fs-node.js';
import jsSHA from './lib/jssha/sha256.mjs';

export class Backup {

	constructor() {
	}

	setFilePath(filePath) {
		this._filePath = filePath;
		this._digest = '';
		this._lastTimeStampStr = '';
	}

	backupText(text) {
		if (!this._filePath) return false;

		text = text.replace(/\n/g, '\r\n');

		const digest = this._getDigest(text);
		if (digest === this._digest) return false;

		const ext  = FS.extension(this._filePath);
		const name = FS.baseName(this._filePath, ext);

		try {
			const backupDir = this._ensureBackupDir(this._filePath);
			this._lastTimeStampStr = this._createTimeStampStr();
			const to = FS.joinPath(backupDir, name + this._lastTimeStampStr + ext);
			FS.writeTextAsync(to, text).catch(err => console.log(err));
		} catch (e) {
			console.error(e);
			return false;
		}
		this._digest = digest;
		return true;
	}

	backupErrorLog(info, text) {
		if (!this._filePath) return false;

		this.backupText(text);

		const log  = JSON.stringify(info, null, '\t');
		const ext  = FS.extension(this._filePath);
		const name = FS.baseName(this._filePath, ext);

		try {
			const backupDir = this._ensureBackupDir(this._filePath);
			const to = FS.joinPath(backupDir, name + this._lastTimeStampStr + '.log');
			FS.writeTextAsync(to, log).catch(err => console.log(err));
		} catch (e) {
			console.error(e);
			return false;
		}
		return true;
	}

	backupExistingFile(text, existingFilePath) {
		if (!FS.exists(existingFilePath)) return false;

		text = text.replace(/\n/g, '\r\n');
		const oldText = FS.readText(existingFilePath);

		const digest = this._getDigest(text);
		if (digest === this._getDigest(oldText)) return false;

		const ext  = FS.extension(existingFilePath);
		const name = FS.baseName(existingFilePath, ext);

		try {
			const backupDir = this._ensureBackupDir(existingFilePath);
			this._lastTimeStampStr = this._createTimeStampStr();
			const to = FS.joinPath(backupDir, name + this._lastTimeStampStr + ext);
			FS.writeText(to, oldText);
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
		const d = new Date();
		const zp = (n) => { return n < 10 ? ('0' + n) : ('' + n); };
		return d.getFullYear() + zp(d.getMonth() + 1) + zp(d.getDate()) + zp(d.getHours()) + zp(d.getMinutes()) + zp(d.getSeconds()) + d.getMilliseconds();
	}

	_ensureBackupDir(fp) {
		const name = FS.baseName(fp, FS.extension(fp));
		const dir = FS.joinPath(FS.dirName(fp), '.' + name + '.backup');
		try {
			FS.createDir(dir);  // if the dir exists, an exception is thrown.
			FS.hideDir(dir);
		} catch (e) {
			return dir;
		}
		return dir;
	}

}
