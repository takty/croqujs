const TYPES = {
	html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8',
	js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
	css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8',
	txt: 'text/plain; charset=utf-8', csv: 'text/csv; charset=utf-8', xml: 'application/xml',
	png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
	svg: 'image/svg+xml', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
	wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg', m4a: 'audio/mp4',
	mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg',
	wasm: 'application/wasm', pdf: 'application/pdf',
	woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
};

/** Serve a fresh File snapshot, including single byte ranges used by media players. */
export function fileResponse(file, request) {
	const extension = file.name.split('.').at(-1).toLowerCase();
	const headers = new Headers({
		'Content-Type': TYPES[extension] ?? (file.type || 'application/octet-stream'),
		'Cache-Control': 'no-store',
		'X-Content-Type-Options': 'nosniff',
		'Accept-Ranges': 'bytes',
		'Content-Length': String(file.size),
	});
	if (request.method === 'HEAD') return new Response(null, { headers });
	const range = request.headers.get('Range');
	if (!range) return new Response(file, { headers });
	const match = /^bytes=(\d*)-(\d*)$/.exec(range);
	let start = NaN, end = NaN;
	if (match && (match[1] || match[2])) {
		start = match[1] ? Number(match[1]) : Math.max(0, file.size - Number(match[2]));
		end = match[1] && match[2] ? Math.min(Number(match[2]), file.size - 1) : file.size - 1;
	}
	if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= file.size) {
		headers.set('Content-Range', 'bytes */' + file.size);
		headers.set('Content-Length', '0');
		return new Response(null, { status: 416, headers });
	}
	headers.set('Content-Range', `bytes ${start}-${end}/${file.size}`);
	headers.set('Content-Length', String(end - start + 1));
	return new Response(file.slice(start, end + 1), { status: 206, headers });
}
