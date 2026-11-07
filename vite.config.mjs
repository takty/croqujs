import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { applicationResources } from './vite-application-resources.mjs';
import { webResources } from './vite-web-resources.mjs';
import { rendererResources } from './vite-renderer-resources.mjs';

const root = fileURLToPath(new URL('./src/', import.meta.url));

export default defineConfig(({ mode }) => {
	const web = mode === 'web';
	return {
		root,
		base: './',
		publicDir: false,
		cacheDir: fileURLToPath(new URL('./node_modules/.vite/', import.meta.url)),
		resolve: {
			alias: {
				'#session': path.join(root, 'session', web ? 'session-local.js' : 'session-client.js'),
			},
		},
		server: {
			open: '/',
			fs: { allow: [root, fileURLToPath(new URL('./', import.meta.resolve('croq-mirror')))] },
		},
		preview: { open: '/' },
		plugins: [{
			name: 'croqujs-editor-stylesheet',
			transformIndexHtml: {
				order: 'post',
				handler(_html, context) {
					if (path.resolve(context.filename) !== path.join(root, 'index.html')) return;
					const href = './assets/croq-mirror.min.css';
					return [{ tag: 'link', attrs: { rel: 'stylesheet', href }, injectTo: 'head' }];
				},
			},
		}, rendererResources(), applicationResources({ web }), ...(web ? [webResources()] : [])],
		build: {
			outDir: fileURLToPath(new URL(web ? './dist-web/' : './app/', import.meta.url)),
			// build.mjs cleans once, then installs the main process and runtime files.
			emptyOutDir: web,
			assetsInlineLimit: 0,
			target: 'esnext',
			sourcemap: true,
			manifest: true,
			rolldownOptions: {
				input: { study: path.join(root, 'index.html'), field: path.join(root, 'field/index.html') },
				preserveEntrySignatures: 'strict',
				output: {
					codeSplitting: {
						groups: [{ name: 'croq-mirror', test: /[/\\]node_modules[/\\]croq-mirror[/\\]/ }],
					},
					entryFileNames: 'assets/[name]-[hash].js',
				},
			},
		},
	};
});
