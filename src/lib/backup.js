/**
 *
 * Backup (JS)
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-04-27
 *
 */


'use strict';

const FS     = require('fs');
const PATH   = require('path');
const CRYPTO = require('crypto');


class Backup {

	constructor() {
	}

	setFilePath(filePath) {
		this._filePath = filePath;
		this._digest = '';
	}

	backup(text) {
		if (!this._filePath) return false;
		const hash = CRYPTO.createHash('sha256');
		hash.update(text);
		const digest = hash.digest('hex');
		if (digest === this._digest) return false;
		this._digest = digest;

		const ext  = PATH.extname(this._filePath);
		const name = PATH.basename(this._filePath, ext);

		try {
			const backupDir = this._ensureBackupDir(this._filePath);
			const to = PATH.join(backupDir, name + this._createTimeStampStr() + ext);
			FS.writeFile(to, text.replace(/\n/g, '\r\n'));
		} catch (e) {
			return false;
		}
		return true;
	}

	backupExistingFile(existingFilePath) {
		if (!FS.existsSync(existingFilePath)) return false;

		const ext  = PATH.extname(existingFilePath);
		const name = PATH.basename(existingFilePath, ext);

		try {
			const backupDir = this._ensureBackupDir(existingFilePath);
			const to = PATH.join(backupDir, name + this._createTimeStampStr() + ext);
			FS.writeFileSync(to, FS.readFileSync(existingFilePath, 'utf-8'));
		} catch (e) {
			return false;
		}
		return true;
	}

	_createTimeStampStr() {
		const d = new Date();
		const zp = (n) => { return n < 10 ? ('0' + n) : ('' + n); };
		return d.getFullYear() + zp(d.getMonth() + 1) + zp(d.getDate()) + zp(d.getHours()) + zp(d.getMinutes()) + zp(d.getSeconds()) + d.getMilliseconds();
	}

	_ensureBackupDir(fp) {
		const name = PATH.basename(fp, PATH.extname(fp));
		const dir = PATH.join(PATH.dirname(fp), name + '.backup');
		try {
			FS.mkdirSync(dir);  // if the dir exists, an exception is thrown.
		} catch (e) {
			// do nothing
		}
		return dir;
	}

}

module.exports = Backup;
