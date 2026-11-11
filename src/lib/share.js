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
