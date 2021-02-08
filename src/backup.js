/**
 *
 * Backup (JS)
 *
 * @author Takuto Yanagida
 * @version 2020-04-30
 *
 */


'use strict';

const require_ = (path) => { let r; return () => { return r || (r = require(path)); }; }

const FS      = require_('fs');
const PATH    = require_('path');
const CRYPTO  = require_('crypto');
const PROCESS = require_('process');


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

		const ext  = PATH().extname(this._filePath);
		const name = PATH().basename(this._filePath, ext);

		try {
			const backupDir = this._ensureBackupDir(this._filePath);
			this._lastTimeStampStr = this._createTimeStampStr();
			const to = PATH().join(backupDir, name + this._lastTimeStampStr + ext);
			FS().writeFile(to, text, (err) => { if (err) console.log(err); });
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
		const ext  = PATH().extname(this._filePath);
		const name = PATH().basename(this._filePath, ext);

		try {
			const backupDir = this._ensureBackupDir(this._filePath);
			const to = PATH().join(backupDir, name + this._lastTimeStampStr + '.log');
			FS().writeFile(to, log, (err) => { if (err) console.log(err); });
		} catch (e) {
			console.error(e);
			return false;
		}
		return true;
	}

	backupExistingFile(text, existingFilePath) {
		if (!FS().existsSync(existingFilePath)) return false;

		text = text.replace(/\n/g, '\r\n');
		const oldText = FS().readFileSync(existingFilePath, 'utf-8');

		const digest = this._getDigest(text);
		if (digest === this._getDigest(oldText)) return false;

		const ext  = PATH().extname(existingFilePath);
		const name = PATH().basename(existingFilePath, ext);

		try {
			const backupDir = this._ensureBackupDir(existingFilePath);
			this._lastTimeStampStr = this._createTimeStampStr();
			const to = PATH().join(backupDir, name + this._lastTimeStampStr + ext);
			FS().writeFileSync(to, oldText);
		} catch (e) {
			console.error(e);
			return false;
		}
		this._digest = digest;
		return true;
	}

	_getDigest(text) {
		const hash = CRYPTO().createHash('sha256');
		hash.update(text);
		return hash.digest('hex');
	}

	_createTimeStampStr() {
		const d = new Date();
		const zp = (n) => { return n < 10 ? ('0' + n) : ('' + n); };
		return d.getFullYear() + zp(d.getMonth() + 1) + zp(d.getDate()) + zp(d.getHours()) + zp(d.getMinutes()) + zp(d.getSeconds()) + d.getMilliseconds();
	}

	_ensureBackupDir(fp) {
		const name = PATH().basename(fp, PATH().extname(fp));
		const dir = PATH().join(PATH().dirname(fp), '.' + name + '.backup');
		try {
			FS().mkdirSync(dir);  // if the dir exists, an exception is thrown.
			if (PROCESS().platform === 'win32') {
				const child_process = require('child_process');
				child_process.spawn('attrib', ['+H', dir]);
			}
		} catch (e) {
			return dir;
		}
		return dir;
	}

}

module.exports = Backup;
