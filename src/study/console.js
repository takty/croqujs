/**
 *
 * Console Message Collector (JS)
 *
 * @author Takuto Yanagida
 * @version 2021-08-14
 *
 */


'use strict';


const MAX_SIZE     = 100;
const MSG_INTERVAL = 200;

let _outputCache = [];
let _isIgnored = false;

const send = createDelayFunction(() => sendCache(MAX_SIZE));


self.addEventListener('message', (e) => {
	const m = JSON.parse(e.data);
	const type = m.type;

	if (type === 'off') {
		_outputCache.length = 0;
		_isIgnored = true;
		return;
	} else if (type === 'on') {
		_isIgnored = false;
		return;
	}

	if (_isIgnored) return;
	let msgs = m.msgs;
	msgs = compactMessages(msgs, _outputCache);

	if (MAX_SIZE < msgs.length) {
		_outputCache = msgs.slice(msgs.length - MAX_SIZE);
	} else {
		_outputCache = _outputCache.concat(msgs);
	}
	send();
});

function compactMessages(msgs, cache) {
	const nms = [];
	let last = null;
	for (let m of msgs) {
		if (last && last.type === m.type && last.msg === m.msg) {
			last.count += m.count;
		} else {
			nms.push(m);
			last = m;
		}
	}
	if (0 < cache.length && 0 < nms.length) {
		const tail = cache[cache.length - 1];
		const top = nms[0];
		if (tail.type === top.type && tail.msg === top.msg) {
			tail.count += top.count;
			nms.shift();
		}
	}
	return nms;
}

function sendCache(count) {
	if (_outputCache.length === 0) return;
	const sub = _outputCache.slice(Math.max(0, _outputCache.length - count));
	_outputCache.length = 0;
	self.postMessage(sub);
}

function createDelayFunction(fn) {
	let st = null;
	let last = 0;
	let isFirst = true;

	return () => {
		const cur = self.performance.now();
		if (st && cur - last < MSG_INTERVAL) clearTimeout(st);

		const d = isFirst ? 0 : MSG_INTERVAL;
		isFirst = false;
		st = setTimeout(() => {
			fn();
			last = self.performance.now();
		}, d);
	};
}
