/*
 * Doping: An Injected Code for Communication Between User Code and Croqujs
 * 2018-04-17
 */

{
	const {ipcRenderer} = require('electron');
	let id = '';

	// ipcRenderer.on('imports', (ev, ...args) => {
	// 	const urls = args[0].map((ld) => {
	// 		if (ld.source) {
	// 			const url = window.URL.createObjectURL(new Blob([ld.source], { type: 'application/javascript' }));
	// 			return url;
	// 		} else {
	// 			return ld.desc;
	// 		}
	// 	});
	// 	for (let url of urls) {
	// 		const s = document.createElement('script');
	// 		s.src = url;
	// 		document.head.appendChild(s);
	// 	}
	// });

	ipcRenderer.on('id', (ev, ...args) => {
		id = args[0];
	});
	
	window.addEventListener('error', (e) => {
		// ErrorEvent should be copied here
		ipcRenderer.sendToHost('error', {url: e.filename, col: e.colno, line: e.lineno, msg: e.message});
		return true;
	});
	
	window.console = ((orig) => {
		const MAX_SENT_OUTPUT_COUNT = 100;
	
		// const id = Number(window.location.hash.replace('#', ''));
		const outputCache = [];
		let sendOutputTimeout = null;
	
		const sendOutput = () => {
			// console.log('sendOutput');
			const sub = outputCache.slice(Math.max(0, outputCache.length - MAX_SENT_OUTPUT_COUNT));
			outputCache.length = 0;  // Clear old outputs after sending the newest MAX_SENT_OUTPUT_COUNT lines.
			sendOutputTimeout = null;
			ipcRenderer.send('fromRenderer_' + id, 'onFieldOutputOccurred', sub);
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
}
