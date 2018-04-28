/**
 *
 * Analyzer (JS)
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-04-28
 *
 */


'use strict';

importScripts('lib/acorn/acorn.js');
importScripts('lib/acorn/acorn_loose.js');
importScripts('lib/acorn/walk.js');


self.addEventListener('message', function(e) {
	const lines = [];
	const FE = 'FunctionExpression', AFE = 'ArrowFunctionExpression', CE = 'ClassExpression';

	try {
		const ast = acorn.parse(e.data, {locations: true});
		acorn.walk.recursive(ast, {}, {
			VariableDeclaration: (node, state, c) => {  // var f = function () {...};
				for (let d of node.declarations) {
					if (d.init !== null && (d.init.type === FE || d.init.type === AFE)) {
						lines.push(d.loc.start.line);
					}
				}
			},
			FunctionDeclaration: (node, state, c) => {  // function f () {...}
				lines.push(node.loc.start.line);
			},
			AssignmentExpression: (node, state, c) => {  // f = function () {...};
				const left = node.left, right = node.right;
				if ((left.type === 'Identifier' || left.type === 'MemberExpression') && (right.type === FE || right.type === AFE)) {
					lines.push(node.loc.start.line);
				}
			},
			MethodDefinition: (node, state, c) => {
				lines.push(node.loc.start.line);
			},
		});
	} catch(e) {
	}
	self.postMessage(lines.map(e => e - 1));
}, false);
