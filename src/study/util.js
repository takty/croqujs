/**
 * Utilities (JS)
 *
 * @author Takuto Yanagida
 * @version 2020-11-03
 */

'use strict';

async function loadJSON(fileNames) {
	const fs = fileNames.map((url) => {
		return fetch(url);
	});
	const ret = [];
	for (let f of fs) {
		const r = await f;
		ret.push(await r.json());
	}
	return ret;
}
