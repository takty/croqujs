import { installInjection } from './src/execution/injection.js';
import { Lsc } from './src/lib/lsc.js';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { normalizePath } from 'vite';

// Runtime-selected resources keep the same URLs in development and production.
export function webResources() {
	const files = new Map();
	const root = fileURLToPath(new URL('./src/', import.meta.url));
	// Generate the web entry in memory from the shared Study HTML.
	const entry = normalizePath(path.join(root, 'index.html'));
	const template = normalizePath(path.join(root, 'study/index.html'));
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
		await collect(path.join(root, 'study/res'), 'res/',
			name => !/^res\/icon-.*\.svg$/.test(name) && !/\.(woff|ttf)$/.test(name));
		for (const name of ['execution/url-provider-worker.js', 'fs/fs-common.js']) files.set(name, path.join(root, name));
		files.set('url-provider-worker.js', null);
		files.set('lib/injection.js', null);
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
		// Keep the registration URL and execution scope at the site root.
		if (name === 'url-provider-worker.js') return "import './execution/url-provider-worker.js';\n";
		const source = await readFile(files.get(name));
		if (name !== 'res/resource.json') return source;
		const { version } = await metadata;
		return source.toString().replaceAll('%VERSION%', version)
			.replaceAll('%VERSION_MAJOR%', version.split('.')[0]).replaceAll('%VERSION_FULL%', version + '-web');
	}
	return {
		name: 'croqujs-web-resources',
		enforce: 'pre',
		resolveId(id) {
			if (normalizePath(id) === entry) return entry;
		},
		async load(id) {
			if (id !== entry) return;
			this.addWatchFile(template);
			return readFile(template, 'utf8');
		},
		handleHotUpdate({ file, server }) {
			if (normalizePath(file) !== template) return;
			server.ws.send({ type: 'full-reload', path: '*' });
			return [];
		},
		async configureServer(server) {
			await ready;
			server.watcher.add(template);
			server.middlewares.use(async (request, response, next) => {
				const name = new URL(request.url, 'http://localhost').pathname.slice(1);
				if (name === '' || name === 'index.html') {
					try {
						const html = await server.transformIndexHtml('/index.html', await readFile(template, 'utf8'), request.url);
						response.setHeader('Content-Type', 'text/html');
						response.end(html);
					} catch (error) {
						next(error);
					}
					return;
				}
				if (!files.has(name)) return next();
				try {
					const types = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
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
