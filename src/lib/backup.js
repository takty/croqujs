/*
 * Backup
 * 2016-08-09
 */

'use strict';

const fs = require('fs'), path = require('path'), crypto = require('crypto');

class Backup {

	constructor() {
	}

	setFilePath(filePath) {
		this._filePath = filePath;
		this._digest = '';
	}

	backup(text) {
		if (!this._filePath) return false;
		const hash = crypto.createHash('sha256');
		hash.update(text);
		const digest = hash.digest('hex');
		if (digest === this._digest) return false;
		this._digest = digest;

		const ext = path.extname(this._filePath);
		const name = path.basename(this._filePath, ext);

		try {
			const backupDir = this._ensureBackupDir(this._filePath);
			const to = path.join(backupDir, name + this._createTimeStampStr() + ext);
			fs.writeFile(to, text.replace(/\n/g, '\r\n'));
		} catch (e) {
			return false;
		}
		return true;
	}

	backupExistingFile(existingFilePath) {
		if (!fs.existsSync(existingFilePath)) return false;

		const ext = path.extname(existingFilePath);
		const name = path.basename(existingFilePath, ext);

		try {
			const backupDir = this._ensureBackupDir(existingFilePath);
			const to = path.join(backupDir, name + this._createTimeStampStr() + ext);
			fs.writeFileSync(to, fs.readFileSync(existingFilePath, 'utf-8'));
		} catch (e) {
			return false;
		}
		return true;
	}

	_createTimeStampStr() {
		const d = new Date();
		const zp = (n) => {return n < 10 ? ('0' + n) : ('' + n);};
		return d.getFullYear() + zp(d.getMonth() + 1) + zp(d.getDate()) + zp(d.getHours()) + zp(d.getMinutes()) + zp(d.getSeconds()) + d.getMilliseconds();
	}

	_ensureBackupDir(fp) {
		const name = path.basename(fp, path.extname(fp));
		const dir = path.join(path.dirname(fp), name + '.backup');
		try {
			fs.mkdirSync(dir);  // if the dir exists, an exception is thrown.
		} catch (e) {
			// do nothing
		}
		return dir;
	}

}

module.exports = Backup;
