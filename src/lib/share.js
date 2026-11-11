const prefix       = '#code=';
const version      = 'v1.';
const maxUrlLength = 16 * 1024;
const maxCodeBytes = 256 * 1024;

export function isShareLink(url) {
	return url.hash.startsWith(prefix);
}

export async function createShareLink(url, code) {
	const source = new TextEncoder().encode(code);
	if (source.byteLength > maxCodeBytes) {
		throw new RangeError('Shared code is too large');
	}
	const stream = new Blob([source]).stream().pipeThrough(new CompressionStream('gzip'));
	const bytes  = new Uint8Array(await new Response(stream).arrayBuffer());
	const link   = new URL(url);

	link.hash = '';
	const header = link.href + prefix + version;

	if (header.length + Math.ceil(bytes.byteLength * 4 / 3) > maxUrlLength) {
		throw new RangeError('Share link is too long');
	}
	const payload = btoa(String.fromCharCode(...bytes))
		.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
	return header + payload;
}

export async function createShareQr(link) {
	const { correction, generate } = await import('lean-qr/nano');
	let qr;
	try {
		qr = generate(link, { minCorrectionLevel: correction.M });
	} catch (error) {
		// Lean QR reports capacity errors with code 4.
		if (error.code === 4) throw new RangeError('Share link does not fit in a QR code', { cause: error });
		throw error;
	}

	const modules = document.createElement('canvas');
	qr.toCanvas(modules, { pad: 4, off: [255, 255, 255, 255] });
	const image   = document.createElement('canvas');
	const scale   = 8;
	image.width   = modules.width * scale;
	image.height  = modules.height * scale;
	const context = image.getContext('2d');
	context.imageSmoothingEnabled = false;
	context.drawImage(modules, 0, 0, image.width, image.height);

	return new Promise((resolve, reject) => {
		image.toBlob(blob => {
			if (blob) {
				resolve(blob);
			} else {
				reject(new Error('Could not encode the QR image'));
			}
		}, 'image/png');
	});
}

export async function readShareLink(url) {
	if (!isShareLink(url)) {
		return null;
	}
	if (url.href.length > maxUrlLength) {
		throw new RangeError('Share link is too long');
	}
	const value = url.hash.slice(prefix.length);
	if (!value.startsWith(version)) {
		throw new Error('Unsupported share link version');
	}
	const payload = value.slice(version.length);
	if (!/^[A-Za-z0-9_-]+$/.test(payload)) {
		throw new Error('Invalid share link encoding');
	}
	const bytes   = Uint8Array.from(atob(payload.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
	const reader  = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
	const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

	let size = 0;
	let code = '';
	try {
		while (true) {
			const { value: chunk, done } = await reader.read();
			if (done) {
				return code + decoder.decode();
			}
			size += chunk.byteLength;
			if (size > maxCodeBytes) {
				throw new RangeError('Shared code is too large');
			}
			code += decoder.decode(chunk, { stream: true });
		}
	} finally {
		await reader.cancel().catch(() => {});
	}
}
