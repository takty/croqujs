/**
 *
 * Config (JS)
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-04-28
 *
 */


'use strict';

const FS   = require('fs');
const PATH = require('path');


class Config {

	constructor(dir, fileName = 'config.json') {
		if (PATH.extname(dir) === '.asar') {
			dir = PATH.dirname(dir);
		}
		this._path = PATH.join(dir, fileName);
		this._conf = {};
	}

	get(key) {
		return this._conf[key];
	}

	getAll() {
		return this._conf;
	}

	set(key, value) {
		this._conf[key] = value;
	}

	load(defConf = {}, callback) {
		try {
			if (!FS.existsSync(this._path)) {
				this._conf = defConf;
				this.saveSync();
				if (callback) callback();
			} else {
				FS.readFile(this._path, (err, data) => {
					if (err) throw err;
					try {
						this._conf = JSON.parse(data);
						if (callback) callback();
					} catch (err) {
						throw `An error occurred when reading ${this._path}: ${err}`;
					}
				});
			}
		} catch (err) {
			console.error(err);
		}
	}

	loadSync(defConf = {}) {
		try {
			if (!FS.existsSync(this._path)) {
				this._conf = defConf;
				this.saveSync();
			} else {
				let data = FS.readFileSync(this._path);
				try {
					this._conf = JSON.parse(data);
				} catch (err) {
					throw `An error occurred when reading ${this._path}: ${err}`;
				}
			}
		} catch (err) {
			console.error(err);
		}
	}

	save(callback) {
		const output = JSON.stringify(this._conf, null, '\t');

		try {
			FS.writeFile(this._path, output, (err) => {
				if (err) {
					throw err;
				} else {
					if (callback) callback();
				}
			});
		} catch (err) {
			console.error(err);
		}
	}

	saveSync(minify) {
		const output = JSON.stringify(this._conf, null, '\t');

		try {
			FS.writeFileSync(this._path, output);
		} catch (err) {
			console.error(err);
		}
	}

}

module.exports = Config;
