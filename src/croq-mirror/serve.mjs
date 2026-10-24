import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
export function serve(port = 4178) {
	const server = createServer(async (request, response) => {
		try {
			const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
			const file = resolve(root, '.' + (pathname === '/' ? '/example/index.html' : pathname));
			if (!file.startsWith(root + sep)) {
				response.writeHead(403).end();
				return;
			}
			const content = await readFile(file);
			response.writeHead(200, { 'Content-Type': ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.ttf': 'font/ttf' })[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
			response.end(content);
		} catch {
			response.writeHead(404).end('Not found');
		}
	});
	return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const server = await serve(Number(process.argv[2] || 4178));
	console.log(`http://127.0.0.1:${server.address().port}/`);
}
