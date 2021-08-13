/**
 *
 * Injected Code for Communication Between User Code and Croqujs
 *
 * @author Takuto Yanagida
 * @version 2021-08-14
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
		let isFirst = true;

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

			const d = isFirst ? 0 : MSG_INTERVAL;
			isFirst = false;
			sendOutputTimeout = setTimeout(sendOutput, d);
		};

		const stringify = (vs) => {
			return vs.map((e) => { return toStruct(e); }).join(', ');
		};

		const toStruct = (s, os = []) => {
			if (s === null)               return '<span class="type-null">null</span>';
			if (typeof s === 'undefined') return '<span class="type-undefined">undefined</span>';
			if (typeof s === 'string')    return `<span class="type-string">${s}</span>`;
			if (typeof s === 'boolean')   return `<span class="type-boolean">${s.toString()}</span>`;
			if (typeof s === 'function')  return `<span class="type-function">${s.toString()}</span>`;
			if (typeof s === 'symbol')    return `<span class="type-symbol">${s.toString()}</span>`;
			if (typeof s === 'number')    return `<span class="type-number">${s.toString()}</span>`;
			if (os.includes(s)) return `<span class="type">${s.toString()}</span>`;
			os.push(s);

			if (Array.isArray(s)) return `<span class="type-array">[${s.map(e => toStruct(e, os)).join(', ')}]</span>`;
			const arrayLikes = {
				int8   : Int8Array,    uint8  : Uint8Array,   uint8clamped: Uint8ClampedArray,
				int16  : Int16Array,   uint16 : Uint16Array,
				int32  : Int32Array,   uint32 : Uint32Array,
				float32: Float32Array, float64: Float64Array,
			};
			for (const [cls, proto] of Object.entries(arrayLikes)) {
				if (!(s instanceof proto)) continue;
				return `<span class="type-array-${cls}">[${s.join(', ')}]</span>`;
			}

			if (s instanceof DOMException) return `<span class="type-domexception">${s.toString()}</span>`;

			const setLikes = { set: Set, weakset: WeakSet };
			for (const [cls, proto] of Object.entries(setLikes)) {
				if (!(s instanceof proto)) continue;
				const vs = [...s].map(e => `\t${toStruct(e, os)}`);
				return makeStringRepresentation(vs, cls);
			}
			const mapLikes = { map: Map, weakmap: WeakMap };
			for (const [cls, proto] of Object.entries(mapLikes)) {
				if (!(s instanceof proto)) continue;
				const vs = [...s].map(([key, val]) => `\t${toStruct(key, os)}: ${toStruct(val, os)}`);
				return makeStringRepresentation(vs, cls);
			}
			if (typeof s === 'object') {
				const vs = Object.entries(s).map(([key, val]) => `\t${toStruct(key, os)}: ${toStruct(val, os)}`);
				return makeStringRepresentation(vs, 'object');
			}
			return `<span class="type">${s.toString()}</span>`;
		};

		const makeStringRepresentation = function (vs, cls) {
			if (vs.length) return `<div class="type-${cls}">{\n${vs.join(',\n')}\n}</div>`;
			return `<div class="type-${cls}">{}</div>`;
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
