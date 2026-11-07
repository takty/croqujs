import { installInjection } from './src/lib/injection.js';
import { Lsc } from './src/lib/lsc.js';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Runtime-selected resources keep the same URLs in development and production.
export function webResources() {
	const files = new Map();
	const root = fileURLToPath(new URL('./src/', import.meta.url));
	const editor = fileURLToPath(new URL('../docs/', import.meta.resolve('croq-mirror')));
	const metadata = readFile(new URL('./package.json', import.meta.url), 'utf8').then(JSON.parse);
	async function collect(directory, prefix, filter = () => true) {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const source = path.join(directory, entry.name);
			const name = prefix + entry.name;
			if (entry.isDirectory()) await collect(source, name + '/', filter);
			else if (filter(name)) files.set(name, source);
		}
	}
	const ready = (async () => {
		await collect(path.join(root, 'study/res'), 'res/', name => !/^res\/icon-.*\.svg$/.test(name));
		for (const name of ['url-provider-worker.js', 'lib/fs-common.js', 'lib/injection.js']) files.set(name, path.join(root, name));
		for (const name of ['croq-mirror.min.js', 'analysis-worker.min.js', 'croq-mirror.min.css']) {
			files.set('lib/croq-mirror/dist/' + name, path.join(editor, name));
			if (name.endsWith('.js')) files.set('lib/croq-mirror/dist/' + name + '.map', path.join(editor, name + '.map'));
		}
		await collect(path.join(editor, 'licenses'), 'lib/croq-mirror/dist/licenses/');
		await collect(path.join(editor, 'assets'), 'lib/croq-mirror/dist/assets/', name => name.endsWith('.svg'));
		files.set('lib/croq-mirror/LICENSE', path.join(editor, '../LICENSE'));
		files.set('lib/sweetalert2/LICENSE', fileURLToPath(new URL('../LICENSE', import.meta.resolve('sweetalert2'))));
	})();
	async function contents(name) {
		if (name === 'lib/injection.js') return `(${installInjection})(${Lsc});\n`;
		const source = await readFile(files.get(name));
		if (name !== 'res/resource.json') return source;
		const { version } = await metadata;
		return source.toString().replaceAll('%VERSION%', version)
			.replaceAll('%VERSION_MAJOR%', version.split('.')[0]).replaceAll('%VERSION_FULL%', version + '-web');
	}
	return {
		name: 'croqujs-web-resources',
		async configureServer(server) {
			await ready;
			server.middlewares.use(async (request, response, next) => {
				const name = new URL(request.url, 'http://localhost').pathname.slice(1);
				if (!files.has(name)) return next();
				try {
					const types = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.ttf': 'font/ttf' };
					response.setHeader('Content-Type', types[path.extname(name)] ?? 'application/octet-stream');
					response.end(await contents(name));
				} catch (error) {
					next(error);
				}
			});
		},
		async generateBundle() {
			await ready;
			for (const name of files.keys()) {
				this.emitFile({ type: 'asset', fileName: name, source: await contents(name) });
			}
		},
	};
}
