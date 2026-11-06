/** Replace only the production bootstrap, keeping Vite's actual CSS and module dependencies. */
exports.withStudyInstance = html => {
	const bootstrap = /<script\b(?=[^>]*type="module")[^>]*>[\s\S]*?<\/script>/g;
	if ([...html.matchAll(bootstrap)].length !== 1) throw new Error('Expected one Vite renderer bootstrap');
	return html.replace(bootstrap, `<script type="module">
		import { Study } from './study.js';
		window.addEventListener('DOMContentLoaded', () => { window.study = new Study(); });
	</script>`);
};
