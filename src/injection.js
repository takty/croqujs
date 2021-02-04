/**
 *
 * Injected Code for Communication Between User Code and Croqujs
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2021-02-04
 *
 */


(function () {
	const IS_ELECTRON = window.navigator.userAgent.toLowerCase().includes('electron');

	const [ID, UCO] = window.location.hash.replace('#', '').split(',');
	const MSG_ID = '#injection_' + ID;
	const URL = window.location.href.replace(window.location.hash, '');

	const afterPermitted = {};

	window.addEventListener('storage', () => {
		const v = window.localStorage.getItem(MSG_ID);
		if (!v) return;
		window.localStorage.removeItem(MSG_ID);
		const ma = JSON.parse(v);

		if (ma.message === 'window-fullscreen-entered') {
			document.body.style.overflow = 'hidden';
			document.body.scrollTop = 0;
		} else if (ma.message === 'window-fullscreen-left') {
			document.body.style.overflow = 'visible';
		} else if (ma.message === 'permission') {
			const { type, result } = ma.params;
			if (afterPermitted[type]) afterPermitted[type](result);
		}
	});

	window.addEventListener('error', (e) => {
		// ErrorEvent should be copied here
		const info = { url: e.filename, col: e.colno, line: e.lineno, msg: e.message, stack: e.error.stack };

		info.isUserCode = info.url === URL;
		if (info.isUserCode && info.line === 1) info.col -= UCO;

		const base = URL.replace('index.html', '');
		info.fileName = info.url ? info.url.replace(base, '') : '';

		window.localStorage.setItem('#study_' + ID, JSON.stringify({ message: 'error', params: info }));
	});

	window.addEventListener('unhandledrejection', (e) => {
		const info = { msg: 'DOMException: ' + e.reason.message, isPromise: true, isUserCode: false };
		window.localStorage.setItem('#study_' + ID, JSON.stringify({ message: 'error', params: info }));
	});


	// -------------------------------------------------------------------------


	function createPseudoConsole(orig) {
		const MAX_SENT_OUTPUT_COUNT = 100;
		const MSG_INTERVAL = 200;  // 200 IS THE BEST!

		const outputCache = [];
		let sendOutputTimeout = null;
		let lastTime = 0;

		const sendOutput = () => {
			const sub = outputCache.slice(Math.max(0, outputCache.length - MAX_SENT_OUTPUT_COUNT));
			outputCache.length = 0;  // Clear old outputs after sending the newest MAX_SENT_OUTPUT_COUNT lines.
			sendOutputTimeout = null;
			window.localStorage.setItem('#study_' + ID, JSON.stringify({ message: 'output', params: sub }));
			lastTime = window.performance.now();
		};

		const cacheOutput = (msg, type) => {
			if (outputCache.length > 0) {
				const lastMsg = outputCache[outputCache.length - 1];
				if (lastMsg.count < MAX_SENT_OUTPUT_COUNT && lastMsg.type === type && lastMsg.msg === msg) {
					lastMsg.count += 1;
				} else {
					outputCache.push({ msg, type, count: 1 });
				}
			} else {
				outputCache.push({ msg, type, count: 1 });
			}
			// DO NOT MODIFY THE FOLLOWING STATEMENT!
			const cur = window.performance.now();
			if (sendOutputTimeout && outputCache.length < MAX_SENT_OUTPUT_COUNT && cur - lastTime < MSG_INTERVAL) clearTimeout(sendOutputTimeout);
			sendOutputTimeout = setTimeout(sendOutput, MSG_INTERVAL);
		};

		const stringify = (vs) => {
			return vs.map((e) => { return toStr(e, ''); }).join(', ');
		};

		const toStr = (s, sp) => {
			const ns = sp + '\t';
			if (s === null)               return 'null';
			if (typeof s === 'undefined') return 'undefined';
			if (typeof s === 'boolean')   return s.toString();
			if (typeof s === 'function')  return s.toString();
			if (typeof s === 'symbol')    return s.toString();
			if (typeof s === 'string')    return `"${s}"`;
			if (typeof s === 'number') {
				if (Number.isNaN(s))     return 'NaN';
				if (!Number.isFinite(s)) return 'Infinity';
				return JSON.stringify(s);
			}
			if (Array.isArray(s)) return '[' + s.map((e) => { return toStr(e, sp); }).join(', ') + ']';
			if (s instanceof Int8Array)         return '[' + s.join(', ') + ']';
			if (s instanceof Uint8Array)        return '[' + s.join(', ') + ']';
			if (s instanceof Uint8ClampedArray) return '[' + s.join(', ') + ']';
			if (s instanceof Int16Array)        return '[' + s.join(', ') + ']';
			if (s instanceof Uint16Array)       return '[' + s.join(', ') + ']';
			if (s instanceof Int32Array)        return '[' + s.join(', ') + ']';
			if (s instanceof Uint32Array)       return '[' + s.join(', ') + ']';
			if (s instanceof Float32Array)      return '[' + s.join(', ') + ']';
			if (s instanceof Float64Array)      return '[' + s.join(', ') + ']';
			if (s instanceof Set || s instanceof WeakSet) {
				const vs = [];
				for (const val of s) vs.push(ns + toStr(val, ns) + ',\n');
				return `{\n` + vs.join('') + `${sp}}`;
			}
			if (s instanceof Map || s instanceof WeakMap) {
				const vs = [];
				for (const [key, val] of s) vs.push(ns + toStr(key, ns) + ': ' + toStr(val, ns) + ',\n');
				return `{\n` + vs.join('') + `${sp}}`;
			}
			if (s instanceof DOMException) {
				return s.toString();
			}
			if (typeof s === 'object') {
				const vs = [];
				for (const [key, val] of Object.entries(s)) vs.push(ns + toStr(key, ns) + ': ' + toStr(val, ns) + ',\n');
				if (vs.length) return `{\n` + vs.join('') + `${sp}}`;
			}
			return s.toString();
		};

		return {
			dir: (obj) => {
				orig.dir(obj);
				cacheOutput(JSON.stringify(obj, null, '\t'), 'std');
			},
			log: (...vs) => {
				orig.log(...vs);
				cacheOutput(stringify(vs), 'std');
			},
			info: (...vs) => {
				orig.info(...vs);
				cacheOutput(stringify(vs), 'std');
			},
			warn: (...vs) => {
				orig.warn(...vs);
				cacheOutput(stringify(vs), 'std');
			},
			error: (...vs) => {
				orig.error(...vs);
				cacheOutput(stringify(vs), 'err');
			}
		};
	}

	window.console = createPseudoConsole(window.console);


	// -------------------------------------------------------------------------


	function createPseudoGetCurrentPosition() {
		return function (success, error) {
			afterPermitted['geolocation'] = (result) => { if (result) actualGetCurrentPosition(success, error); };
			window.localStorage.setItem('#study_' + ID, JSON.stringify({ message: 'requestPermission', params: 'geolocation' }));
		}
	}

	function actualGetCurrentPosition(success, error) {
		fetch('https://laccolla.com/api/geolocation/v1/', {
			mode       : 'cors',
			cache      : 'no-cache',
			credentials: 'same-origin',
			headers    : { 'Content-Type': 'application/json; charset=utf-8', },
			referrer   : 'no-referrer',
		}).then(response => {
			return response.json();
		}).then(r => {
			success({
				coords: {
					latitude        : r.lat,
					longitude       : r.lon,
					altitude        : null,
					accuracy        : 0,
					altitudeAccuracy: null,
					heading         : null,
					speed           : null,
				},
				timestamp: null,
			})
		}).catch(e => {
			if (error) error({ code: 2, message: e.message });
		});
	}

	if (IS_ELECTRON) {
		navigator.geolocation.getCurrentPosition = createPseudoGetCurrentPosition();
	}


	// -------------------------------------------------------------------------


	function createGetUserMediaWrapper(origFn) {
		return function (constraints) {
			const a = (constraints.audio === true || typeof constraints.audio === 'object');
			const v = (constraints.video === true || typeof constraints.video === 'object');
			if (!a && !v) throw new DOMException('TypeError');
			const ps = 'user_media_' + (a ? 'a' : '') + (v ? 'v' : '');
			const p = new Promise((resolve, reject) => {
				afterPermitted[ps] = (result) => {
					if (result) resolve();
					else reject(new DOMException('NotAllowedError'));
				};
			});
			window.localStorage.setItem('#study_' + ID, JSON.stringify({ message: 'requestPermission', params: ps }));
			return p.then(() => { return origFn(constraints); });
		}
	}

	if (IS_ELECTRON) {
		navigator.mediaDevices.getUserMedia = createGetUserMediaWrapper(navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices));
	}

})();
