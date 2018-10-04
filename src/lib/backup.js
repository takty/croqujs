/**
 *
 * Backup (JS)
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-10-04
 *
 */


'use strict';

const FS      = require('fs');
const PATH    = require('path');
const CRYPTO  = require('crypto');
const PROCESS = require('process');

const IS_WIN = (PROCESS.platform === 'win32');
const CHILD_PROCESS = IS_WIN ? require('child_process') : null;


class Backup {

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

		const ext  = PATH.extname(this._filePath);
		const name = PATH.basename(this._filePath, ext);

		try {
			const backupDir = this._ensureBackupDir(this._filePath);
			this._lastTimeStampStr = this._createTimeStampStr();
			const to = PATH.join(backupDir, name + this._lastTimeStampStr + ext);
			FS.writeFile(to, text, (err) => { if (err) console.log(err); });
		} catch (e) {
			return false;
		}
		this._digest = digest;
		return true;
	}

	backupErrorLog(info, text) {
		if (!this._filePath) return false;

		this.backupText(text);

		const log  = JSON.stringify(info);
		const ext  = PATH.extname(this._filePath);
		const name = PATH.basename(this._filePath, ext);

		try {
			const backupDir = this._ensureBackupDir(this._filePath);
			const to = PATH.join(backupDir, name + this._lastTimeStampStr + '.log');
			FS.writeFile(to, log, (err) => { if (err) console.log(err); });
		} catch (e) {
			return false;
		}
		return true;
	}

	backupExistingFile(text, existingFilePath) {
		if (!FS.existsSync(existingFilePath)) return false;

		text = text.replace(/\n/g, '\r\n');
		const oldText = FS.readFileSync(existingFilePath, 'utf-8');

		const digest = this._getDigest(text);
		if (digest === this._getDigest(oldText)) return false;

		const ext  = PATH.extname(existingFilePath);
		const name = PATH.basename(existingFilePath, ext);

		try {
			const backupDir = this._ensureBackupDir(existingFilePath);
			this._lastTimeStampStr = this._createTimeStampStr();
			const to = PATH.join(backupDir, name + this._lastTimeStampStr + ext);
			FS.writeFileSync(to, oldText);
		} catch (e) {
			return false;
		}
		this._digest = digest;
		return true;
	}

	_getDigest(text) {
		const hash = CRYPTO.createHash('sha256');
		hash.update(text);
		return hash.digest('hex');
	}

	_createTimeStampStr() {
		const d = new Date();
		const zp = (n) => { return n < 10 ? ('0' + n) : ('' + n); };
		return d.getFullYear() + zp(d.getMonth() + 1) + zp(d.getDate()) + zp(d.getHours()) + zp(d.getMinutes()) + zp(d.getSeconds()) + d.getMilliseconds();
	}

	_ensureBackupDir(fp) {
		const name = PATH.basename(fp, PATH.extname(fp));
		const dir = PATH.join(PATH.dirname(fp), '.' + name + '.backup');
		try {
			FS.mkdirSync(dir);  // if the dir exists, an exception is thrown.
			if (IS_WIN) {
				CHILD_PROCESS.spawn('attrib', ['+H', dir]);
			}
		} catch (e) {
			return dir;
		}
		return dir;
	}

}

module.exports = Backup;
