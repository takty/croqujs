/**
 *
 * File System (JS)
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2019-09-22
 *
 */


'use strict';


const FS   = require('fs');
const PATH = require('path');
const UTIL = require('util');


class FSReal {

	static getCurrentDirectory(cd = __dirname) {
		const pd = PATH.dirname(cd);
		return { name: PATH.basename(cd), type: 'dir', path: cd, parent: { name: PATH.basename(pd), type: 'dir', path: pd } };
	}

	static getParentDirectory(fileItem) {
		const cd = fileItem.path;
		if (process.platform === 'win32' && cd === 'PC:') return null;
		if (PATH.parse(cd).root === cd) {
			if (process.platform === 'win32') return { name: 'PC', type: 'dir', path: 'PC:' };
			return null;
		}
		const pd = PATH.dirname(cd);
		let name = PATH.basename(pd);
		if (name === '') name = pd.substr(0, pd.indexOf('\\'));
		return { name, type: 'dir', path: pd };
	}

	static async getFiles(fileItem) {
		if (process.platform === 'win32' && fileItem.path === 'PC:') return FSReal._getDrives();
		const files = await FS.promises.readdir(fileItem.path);
		const fis = [];
		for (let f of files) {
			const path = PATH.join(fileItem.path, f);
			let stat;
			try {
				stat = FS.statSync(path);
			} catch (e) {
				continue;
			}
			const type = stat.isFile() ? 'file' : 'dir';
			const name = f;
			if (type === 'dir') {
				fis.push({ name, type, path });
			} else {
				const size = stat.size;
				const timeStamp = FSReal._getTimeStamp(stat.mtime);
				const writable = ((stat.mode & 0x0080) !== 0);  // check write flag
				fis.push({ name, type, path, size, timeStamp, readOnly: !writable });
			}
		}
		return fis;
	}

	static async _getDrives() {
		const fis = [];
		const exec = UTIL.promisify(require('child_process').exec);
		const { stdout, stderr } = await exec('wmic logicaldisk get caption');
		stdout.split(/\r\r\n/).forEach((d) => {
			if (d.match(/\:/)) {
				const dl = d.trim();
				fis.push({ name: dl, type: 'dir', path: dl + '\\' });
			}
		});
		return fis;
	}

	static _getTimeStamp(now) {
		const y = '' + now.getFullYear();
		const m = FSReal._twoDigit(now.getMonth() + 1);
		const d = FSReal._twoDigit(now.getDate());
		const h = FSReal._twoDigit(now.getHours());
		const n = FSReal._twoDigit(now.getMinutes());
		const s = FSReal._twoDigit(now.getSeconds());
		return `${y}-${m}-${d} ${h}:${n}:${s}`;
	}

	static _twoDigit(num) {
		let s = '' + num;
		if (s.length < 2) s = '0' + s;
		return s;
	}

}

module.exports = FSReal;
