/*
 * Config
 * 2016-08-10
 */

'use strict';

const fs = require('fs');

class Config {

 	constructor(path = 'config.json') {
		this._path = path;
		this._conf = {};
	}

	load(defConf = {}, callback) {
		try {
			if (!fs.existsSync(this._path)) {
				this._conf = defConf;
				this.saveSync();
				if (callback) callback();
			} else {
				fs.readFile(this._path, (err, data) => {
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
			if (!fs.existsSync(this._path)) {
				this._conf = defConf;
				this.saveSync();
			} else {
				let data = fs.readFileSync(this._path);
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

	get(key) {
		return this._conf[key];
	}

	getAll() {
		return this._conf;
	}

	set(key, value) {
		this._conf[key] = value;
	}

	save(callback) {
		const output = JSON.stringify(this._conf, null, '\t');

		try {
			fs.writeFile(this._path, output, (err) => {
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
			fs.writeFileSync(this._path, output);
		} catch (err) {
			console.error(err);
		}
	}

}

module.exports = Config;
