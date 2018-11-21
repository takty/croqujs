/**
 *
 * Injected Code for Communication Between User Code and Croqujs
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-11-21
 *
 */


(function () {
	const [ID, UCO] = window.location.hash.replace('#', '').split(',');
	const URL = window.location.href.replace(window.location.hash, '');

	window.addEventListener('storage', (e) => {
		if ('injection_' + ID !== e.key) return;
		window.localStorage.clear();
		const ma = JSON.parse(e.newValue);

		if (ma.message === 'window-fullscreen-entered') {
			document.body.style.overflow = 'hidden';
			document.body.scrollTop = 0;
		} else if (ma.message === 'window-fullscreen-left') {
			document.body.style.overflow = 'visible';
		}
	});

	window.addEventListener('error', (e) => {
		// ErrorEvent should be copied here
		const info = { url: e.filename, col: e.colno, line: e.lineno, msg: e.message };

		info.isUserCode = info.url === URL;
		if (info.isUserCode && info.line === 1) info.col -= UCO;

		const base = URL.replace('index.html', '');
		info.fileName = info.url ? info.url.replace(base, '') : '';

		window.localStorage.setItem('study_' + ID, JSON.stringify({ message: 'error', params: info }));
		return true;
	});

	window.console = ((orig) => {
		const MAX_SENT_OUTPUT_COUNT = 100;
		const MSG_INTERVAL = 200;

		const outputCache = [];
		let sendOutputTimeout = null;
		let lastTime = 0;

		const sendOutput = () => {
			const sub = outputCache.slice(Math.max(0, outputCache.length - MAX_SENT_OUTPUT_COUNT));
			outputCache.length = 0;  // Clear old outputs after sending the newest MAX_SENT_OUTPUT_COUNT lines.
			sendOutputTimeout = null;
			window.localStorage.setItem('study_' + ID, JSON.stringify({ message: 'output', params: sub }));
			lastTime = window.performance.now();
		};

		const cacheOutput = (msg, type) => {
			if (outputCache.length > 0) {
				const lastMsg = outputCache[outputCache.length - 1];
				if (lastMsg.count < MAX_SENT_OUTPUT_COUNT && lastMsg.type === type && lastMsg.msg === msg) {
					lastMsg.count += 1;
				} else {
					outputCache.push({msg, type, count: 1});
				}
			} else {
				outputCache.push({msg, type, count: 1});
			}
			// DO NOT MODIFY THE FOLLWING STATEMENT!
			const cur = window.performance.now();
			if (sendOutputTimeout && outputCache.length < MAX_SENT_OUTPUT_COUNT && cur - lastTime < MSG_INTERVAL) clearTimeout(sendOutputTimeout);
			sendOutputTimeout = setTimeout(sendOutput, MSG_INTERVAL);  // 200 IS THE BEST!
		};

		return {
			dir: (obj) => {
				cacheOutput(require('util').inspect(obj), 'std');
				orig.dir(obj);
			},
			log: (...vs) => {
				cacheOutput(vs.toString(), 'std');
				orig.log(...vs);
			},
			info: (...vs) => {
				cacheOutput(vs.toString(), 'std');
				orig.info(...vs);
			},
			warn: (...vs) => {
				cacheOutput(vs.toString(), 'std');
				orig.warn(...vs);
			},
			error: (...vs) => {
				cacheOutput(vs.toString(), 'err');
				orig.error(...vs);
			}
		};
	})(window.console);

})();
