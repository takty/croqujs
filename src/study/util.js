/**
 *
 * Utilities (JS)
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2019-08-18
 *
 */


'use strict';

function createDelayFunction(fn, delay) {
	let st = null;
	return () => {
		if (st) clearTimeout(st);
		st = setTimeout(fn, delay);
	};
}

async function loadJSON(fileNames) {
	return Promise.all(fileNames.map((url) => {
		return _ajaxRequest(url);
	})).then((resuluts) => {
		return resuluts.map((text) => {
			return JSON.parse(text);
		});
	});
}

function _ajaxRequest(url) {
	return new Promise((resolve) => {
		const xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function () {
			if (this.readyState === 4 && this.status === 200) {
				resolve(this.responseText);
			}
		};
		xhr.open('GET', url, true);
		xhr.send();
	});
}
