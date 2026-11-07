import { installInjection } from './src/execution/injection.js';
import { Lsc } from './src/lib/lsc.js';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { normalizePath } from 'vite';
import { getVersionInfo } from './build-version.mjs';

// Runtime-selected resources keep the same URLs in development and production.
export function applicationResources({ web }) {
	const files = new Map();
	const root = fileURLToPath(new URL('./src/', import.meta.url));
	// Generate the root entry in memory from the shared Study HTML.
	const entry = normalizePath(path.join(root, 'index.html'));
	const template = normalizePath(path.join(root, 'study/index.html'));
	const hooks = `(${installInjection})(${Lsc});\n`;
	const metadata = getVersionInfo();
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
	})();
	async function contents(name) {
		const source = await readFile(files.get(name));
		if (name !== 'res/resource.json') return source;
		const { version, full } = await metadata;
		return source.toString().replaceAll('%VERSION%', version)
			.replaceAll('%VERSION_MAJOR%', version.split('.')[0]).replaceAll('%VERSION_FULL%', web ? version + '-web' : full);
	}
	return {
		name: 'croqujs-application-resources',
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
				if (name === 'assets/injection.js') {
					response.setHeader('Content-Type', 'text/javascript');
					response.end(hooks);
					return;
				}
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
			this.emitFile({ type: 'asset', fileName: 'assets/injection.js', source: hooks });
			for (const name of files.keys()) {
				this.emitFile({ type: 'asset', fileName: name, source: await contents(name) });
			}
		},
	};
}
