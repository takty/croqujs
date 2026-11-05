/**
 * Browser Exporter
 *
 * @author Takuto Yanagida
 * @version 2026-11-06
 */

import { ExporterCore } from './exporter-core.js';

/** Generates content without writes, DOM access, or Node dependencies. */
export class BrowserExporter extends ExporterCore {

	/** Return runtime files for a browser or Service Worker to serve. */
	async exportForExecution(codeText, filePath) {
		return this.createWebPage(codeText, filePath, true);
	}

}
