/**
 *
 * Config
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-10-11
 *
 */


'use strict';


class Config {

	constructor(defaultConf = {}, key = 'config') {
		this._lsKey       = key;
		this._defaultConf = defaultConf;
		this._listeners   = [];
		this._initializeEventListener();
	}

	_initializeEventListener() {
		window.addEventListener('storage', (e) => {
			if (e.key !== this._lsKey) return;
			const conf = JSON.parse(e.newValue);
			this._notifyUpdate(conf);
		});
	}

	_notifyUpdate(conf) {
		for (let i = 0; i < this._listeners.length; i += 1) {
			this._listeners[i](conf);
		}
	}

	_getConf() {
		const lsVal = window.localStorage.getItem(this._lsKey);
		if (lsVal) return JSON.parse(lsVal);
		const conf = Object.assign({}, this._defaultConf);
		this._setConf(conf);
		return conf;
	}

	_setConf(conf) {
		const lsVal = JSON.stringify(conf);
		window.localStorage.setItem(this._lsKey, lsVal);
	}

	addEventListener(listener) {
		this._listeners.push(listener);
	}

	notify() {
		this._notifyUpdate(this._getConf());
	}

	getItem(key) {
		return this._getConf()[key];
	}

	setItem(key, val) {
		const conf = this._getConf();
		conf[key] = val;
		this._setConf(conf);
		this._notifyUpdate(conf);
	}

}
