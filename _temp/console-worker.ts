/**
 * Console Output Collector
 *
 * @author Takuto Yanagida
 * @version 2025-08-13
 */

import type { Output } from './console-output';
import { compactOutputs } from './console-output';

console.log('Console Output Collector');

const MAX_SIZE     = 100;
const MSG_INTERVAL = 200;

let _cache   : Output[] = [];
let _isActive: boolean  = false;

const sendCache: () => void = createDelayFunction((): void => {
	if (_cache.length) {
		const outputs: Output[] = _cache.slice(Math.max(0, _cache.length - MAX_SIZE));
		_cache.length = 0;
		self.postMessage(outputs);
	}
});

self.addEventListener('message', (e) => {
	let { command, outputs } = JSON.parse(e.data);
	console.log(e.data);

	switch (command) {
		case 'off':
			_cache.length = 0;
			_isActive = false;
			return;
		case 'on':
			_isActive = true;
			return;
	}
	if (_isActive) {
		outputs = compactOutputs(outputs, _cache);

		if (MAX_SIZE < outputs.length) {
			_cache = outputs.slice(outputs.length - MAX_SIZE);
		} else {
			_cache = _cache.concat(outputs);
		}
		sendCache();
	}
});


// -----------------------------------------------------------------------------


function createDelayFunction(fn: () => any): () => void {
	let st     : any     = null;
	let last   : number  = 0;
	let isFirst: boolean = true;

	return (): void => {
		const cur: number = self.performance.now();
		if (st && cur - last < MSG_INTERVAL) clearTimeout(st);

		const d: number = isFirst ? 0 : MSG_INTERVAL;
		isFirst = false;
		st = setTimeout((): void => {
			fn();
			last = self.performance.now();
		}, d);
	};
}
