/**
 *
 * Code Analyzer Worker (JS)
 *
 * @author Takuto Yanagida
 * @version 2018-11-28
 *
 */


'use strict';

importScripts('lib/acorn/acorn.js');
importScripts('lib/acorn/acorn-loose.js');
importScripts('lib/acorn/walk.js');
importScripts('analyzer.js');


self.addEventListener('message', function (e) {
	self.postMessage(analyze(e.data));
}, false);
