import { installInjection } from './src/execution/injection.js';
import { Lsc } from './src/lib/lsc.js';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build, normalizePath } from 'vite';

// Runtime-selected resources keep the same URLs in development and production.
export function webResources() {
	const files = new Map();
	const root = fileURLToPath(new URL('./src/', import.meta.url));
	// Generate the web entry in memory from the shared Study HTML.
	const entry = normalizePath(path.join(root, 'index.html'));
	const template = normalizePath(path.join(root, 'study/index.html'));
	const hooksId = '\0croqujs-execution-hooks';
	const hooks = `(${installInjection})(${Lsc});\n`;
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
	})();
	async function contents(name) {
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
			if (id === '#execution-hooks') return hooksId;
		},
		async load(id) {
			if (id === hooksId) return `export default ${JSON.stringify(hooks)};`;
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
			files.set('execution/url-provider-worker.js', path.join(root, 'execution/url-provider-worker.js'));
			files.set('fs/fs-common.js', path.join(root, 'fs/fs-common.js'));
			server.watcher.add(template);
			server.middlewares.use(async (request, response, next) => {
				const name = new URL(request.url, 'http://localhost').pathname.slice(1);
				if (name === 'assets/url-provider-worker.js') {
					response.setHeader('Content-Type', 'text/javascript');
					response.end("import '../execution/url-provider-worker.js';\n");
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
			const [worker] = await build({
				configFile: false,
				publicDir: false,
				logLevel: 'warn',
				build: {
					write: false,
					minify: true,
					sourcemap: true,
					lib: { entry: path.join(root, 'execution/url-provider-worker.js'), formats: ['es'], fileName: () => 'url-provider-worker.js' },
				},
			});
			for (const output of worker.output) {
				this.emitFile({ type: 'asset', fileName: 'assets/' + output.fileName, source: output.type === 'chunk' ? output.code : output.source });
			}
			for (const name of files.keys()) {
				this.emitFile({ type: 'asset', fileName: name, source: await contents(name) });
			}
		},
	};
}
