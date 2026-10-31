'use strict';

const { pathToFileURL } = require('node:url');

// Sessions are shared by multiple windows. Only registered editor pages may use
// the legacy synchronous clipboard read needed by document.execCommand('paste').
const sessions = new WeakMap();

function allowPaste(contents, pagePath) {
	const session = contents.session;
	let pages = sessions.get(session);
	if (!pages) {
		pages = new WeakMap();
		sessions.set(session, pages);
		const allow = (requester, permission, details) => {
			if (permission !== 'deprecated-sync-clipboard-read') return true;
			const page = requester && pages.get(requester);
			return !!page && !requester.isDestroyed() && details.isMainFrame === true &&
				requester.getURL().split('#')[0] === page &&
				details.requestingUrl?.split('#')[0] === page;
		};
		session.setPermissionCheckHandler((requester, permission, _origin, details) => allow(requester, permission, details));
		session.setPermissionRequestHandler((requester, permission, callback, details) => callback(allow(requester, permission, details)));
	}
	pages.set(contents, pathToFileURL(pagePath).href);
}

module.exports = { allowPaste };
