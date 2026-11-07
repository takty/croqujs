import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

export function webResources() {
	const root = fileURLToPath(new URL('./src/', import.meta.url));
	return {
		name: 'croqujs-web-resources',
		configureServer(server) {
			server.middlewares.use((request, response, next) => {
				if (new URL(request.url, 'http://localhost').pathname !== '/assets/url-provider-worker.js') return next();
				response.setHeader('Content-Type', 'text/javascript');
				response.end("import '../execution/url-provider-worker.js';\n");
			});
		},
		async generateBundle() {
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
		},
	};
}
