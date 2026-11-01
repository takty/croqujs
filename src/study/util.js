/**
 * Utilities (JS)
 *
 * @author Takuto Yanagida
 * @version 2026-11-01
 */

export async function loadJSON(fileNames) {
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

export const minmax = (val, min, max) => Math.min(max, Math.max(min, val));
