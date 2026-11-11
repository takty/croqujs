import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export function rendererResources({ web }) {
	const editor = fileURLToPath(new URL('./', import.meta.resolve('croq-mirror')));
	const files = new Map([
		['assets/croq-mirror.min.css', path.join(editor, 'croq-mirror.min.css')],
		['assets/licenses/croq-mirror-LICENSE', path.join(editor, '../LICENSE')],
		['assets/licenses/sweetalert2-LICENSE', fileURLToPath(new URL('../LICENSE', import.meta.resolve('sweetalert2')))],
		['assets/licenses/jssha-LICENSE', fileURLToPath(new URL('../LICENSE', import.meta.resolve('jssha')))],
	]);
	if (web) {
		files.set('assets/licenses/lean-qr-LICENSE', fileURLToPath(new URL('./LICENSE', import.meta.resolve('lean-qr/nano'))));
	}
	const ready = (async () => {
		const directory = path.join(editor, 'licenses');
		for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) {
			if (!entry.isFile()) continue;
			const file = path.join(entry.parentPath, entry.name);
			files.set('assets/licenses/' + path.relative(directory, file).replaceAll(path.sep, '/'), file);
		}
	})();
	return {
		name: 'croqujs-renderer-resources',
		async configureServer(server) {
			await ready;
			server.middlewares.use(async (request, response, next) => {
				const name = new URL(request.url, 'http://localhost').pathname.slice(1);
				if (!files.has(name)) return next();
				try {
					const types = { '.css': 'text/css', '.svg': 'image/svg+xml' };
					response.setHeader('Content-Type', types[path.extname(name)] ?? 'text/plain');
					response.end(await readFile(files.get(name)));
				} catch (error) {
					next(error);
				}
			});
		},
		async generateBundle() {
			await ready;
			for (const [name, file] of files) {
				this.emitFile({ type: 'asset', fileName: name, source: await readFile(file) });
			}
		},
	};
}
