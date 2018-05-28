/**
 *
 * Injected Code for Communication Between User Code and Croqujs
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-05-28
 *
 */


(function () {
	const ID = window.location.hash.replace('#', '');

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
		window.localStorage.setItem('study_' + ID, JSON.stringify({ message: 'error', params: { url: e.filename, col: e.colno, line: e.lineno, msg: e.message }}));
		return true;
	});
	
	window.console = ((orig) => {
		const MAX_SENT_OUTPUT_COUNT = 100;
	
		const outputCache = [];
		let sendOutputTimeout = null;
	
		const sendOutput = () => {
			const sub = outputCache.slice(Math.max(0, outputCache.length - MAX_SENT_OUTPUT_COUNT));
			outputCache.length = 0;  // Clear old outputs after sending the newest MAX_SENT_OUTPUT_COUNT lines.
			sendOutputTimeout = null;
			window.localStorage.setItem('study_' + ID, JSON.stringify({ message: 'output', params: sub}));
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
			if (sendOutputTimeout && outputCache.length < MAX_SENT_OUTPUT_COUNT) clearTimeout(sendOutputTimeout);
			sendOutputTimeout = setTimeout(sendOutput, 200);  // 200 IS THE BEST!
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
