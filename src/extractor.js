/**
 *
 * Function Extractor (JS)
 *
 * @author Takuto Yanagida
 * @version 2020-09-28
 *
 */


'use strict';


function analyze(code) {
	function walk(node, visitors, base, state, override) {
		if (!base) {
			base = acorn.walk.base;
		}
		(function c(node, st, override) {
			var type = override || node.type, found = visitors[type];
			if (found) { found(node, st); }
			base[type](node, st, c);
		})(node, state, override);
	}

	const FE  = 'FunctionExpression';
	const AFE = 'ArrowFunctionExpression';
	const CE  = 'ClassExpression';
	const ID  = 'Identifier';

	const fnNames = [];
	let   success = true;

	try {
		const ast = acorn.parse(code, { locations: true, ecmaVersion: 'latest' });
		walk(ast, {
			ClassDeclaration: (node, state, c) => {
				fnNames.push(node.id.name);
			},
			VariableDeclaration: (node, state, c) => {  // const f = function () {...};
				for (let d of node.declarations) {
					if (d.init !== null && (d.init.type === FE || d.init.type === AFE || d.init.type === CE)) {
						fnNames.push(d.id.name);
					}
				}
			},
			FunctionDeclaration: (node, state, c) => {  // function f () {...}
				fnNames.push(node.id.name);
			},
			AssignmentExpression: (node, state, c) => {  // f = function () {...};
				const left = node.left, right = node.right;
				if (left.type === ID && (right.type === FE || right.type === AFE || right.type === CE)) {
					fnNames.push(left.name);
				}
			},
		});
	} catch(e) {
		const es = e.toString();
		if (!es.startsWith('SyntaxError') && !es.startsWith('UnexpectedToken')) {
			console.error(e);
		}
		success = false;
	}
	return { fnNames, success };
}

if (typeof module === 'object') {
	module.exports = analyze;
}
