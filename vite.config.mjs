import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { applicationResources } from './vite-application-resources.mjs';
import { webResources } from './vite-web-resources.mjs';
import { rendererResources } from './vite-renderer-resources.mjs';

const root = fileURLToPath(new URL('./src/', import.meta.url));

export default defineConfig(({ mode }) => {
	const web = mode === 'web';
	let base;
	return {
		root,
		base: './',
		publicDir: web
			? fileURLToPath(new URL('./public-web/', import.meta.url))
			: false,
		cacheDir: fileURLToPath(new URL('./node_modules/.vite/', import.meta.url)),
		resolve: {
			alias: {
				'#session': path.join(root, 'session', web ? 'session-local.js' : 'session-client.js'),
			},
		},
		server: {
			open: '/',
			fs: { allow: [
				root,
				fileURLToPath(new URL('./', import.meta.resolve('croq-mirror'))),
				fileURLToPath(new URL('./', import.meta.resolve('fs-nw/web'))),
			] },
		},
		preview: { open: '/' },
		plugins: [{
			name: 'croqujs-study-links',
			configResolved(config) { base = config.base; },
			transformIndexHtml: {
				order: 'post',
				handler(_html, context) {
					if (path.resolve(context.filename) !== path.join(root, 'index.html')) return;
					const href = './assets/croq-mirror.min.css';
					return [
						{ tag: 'link', attrs: { rel: 'stylesheet', href }, injectTo: 'head' },
						...(web ? [
							{ tag: 'link', attrs: { rel: 'icon', href: base + 'favicon.svg', type: 'image/svg+xml', sizes: 'any' }, injectTo: 'head' },
							{ tag: 'link', attrs: { rel: 'apple-touch-icon', href: base + 'apple-touch-icon.png', sizes: '180x180' }, injectTo: 'head' },
							{ tag: 'link', attrs: { rel: 'manifest', href: base + 'manifest.webmanifest' }, injectTo: 'head' },
						] : []),
					];
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
