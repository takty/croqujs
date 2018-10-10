/**
 *
 * Config
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-10-10
 *
 */


'use strict';


class Config {

	constructor(key = 'config') {
		this._lsKey = key;
		this._listeners = [];
	}

	addListener(listener) {
		this._listeners.push(listener);
	}

	getItem(key) {
		const conf = JSON.parse(window.localStorage.getItem(this._lsKey));
		return conf[key];
	}

	setItem(key, val) {
		const conf = JSON.parse(window.localStorage.getItem(this._lsKey));
		conf[key] = val;
		window.localStorage.setItem('config', JSON.stringify(conf));
		this.configUpdated(conf);
	}

}