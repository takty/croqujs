import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
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
			open: web ? '/' : '/study/index.html',
			fs: { allow: [root, fileURLToPath(new URL('./', import.meta.resolve('croq-mirror')))] },
		},
		preview: { open: web ? '/' : '/study/index.html' },
		plugins: [{
			name: 'croqujs-editor-stylesheet',
			transformIndexHtml: {
				order: 'post',
				handler(_html, context) {
					if (path.resolve(context.filename) !== path.join(root, web ? 'index.html' : 'study/index.html')) return;
					const href = (web ? './' : '../') + 'assets/croq-mirror.min.css';
					return [{ tag: 'link', attrs: { rel: 'stylesheet', href }, injectTo: 'head' }];
				},
			},
		}, rendererResources(), ...(web ? [webResources()] : [])],
		build: {
			outDir: fileURLToPath(new URL(web ? './dist-web/' : './app/', import.meta.url)),
			// build.mjs cleans once, then installs the main process and runtime files.
			emptyOutDir: web,
			assetsInlineLimit: 0,
			target: 'esnext',
			sourcemap: true,
			manifest: true,
			rolldownOptions: {
				input: web ? { study: path.join(root, 'index.html'), field: path.join(root, 'field/index.html') } : {
					study: path.join(root, 'study/index.html'),
					field: path.join(root, 'field/index.html'),
				},
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
