/**
 *
 * Utilities (JS)
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-11-26
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

function loadJSON(fileNames, cb) {
	let count = fileNames.length;
	const ret = new Array(count);
	for (let i = 0; i < fileNames.length; i += 1) {
		const idx = i;
		const xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function () {
			if (this.readyState === 4 && this.status === 200) {
				ret[idx] = JSON.parse(this.responseText);
				if (--count === 0) cb(ret);
			}
		};
		xhr.open('GET', fileNames[i], true);
		xhr.send();
	}
}
