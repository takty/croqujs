/**
 *
 * Code Analyzer (JS)
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-11-28
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

	const FE = 'FunctionExpression', AFE = 'ArrowFunctionExpression', CE = 'ClassExpression', ME = 'MemberExpression';
	const IF_STMT = 'IfStatement', ID = 'Identifier';

	const fnLocs = [];
	const ifLocs = [];
	const forLocs = [];
	const fnNames = [];
	const ifNodes = [];

	try {
		const ast = acorn.parse(code, { locations: true });
		walk(ast, {
			ClassDeclaration: (node, state, c) => {
				fnNames.push(node.id.name);
			},
			VariableDeclaration: (node, state, c) => {  // const f = function () {...};
				for (let d of node.declarations) {
					if (d.init !== null && (d.init.type === FE || d.init.type === AFE)) {
						if (node.loc.start.line === d.loc.start.line) {
							fnLocs.push([node.loc.start, d.loc.end]);  // for considering the column of 'const'
						} else {
							fnLocs.push([d.loc.start, d.loc.end]);
						}
					}
					if (d.init !== null && (d.init.type === FE || d.init.type === AFE || d.init.type === CE)) {
						fnNames.push(d.id.name);
					}
				}
			},
			FunctionDeclaration: (node, state, c) => {  // function f () {...}
				fnLocs.push([node.loc.start, node.loc.end]);
				fnNames.push(node.id.name);
			},
			AssignmentExpression: (node, state, c) => {  // f = function () {...};
				const left = node.left, right = node.right;
				if ((left.type === ID || left.type === ME) && (right.type === FE || right.type === AFE)) {
					fnLocs.push([node.loc.start, node.loc.end]);
				}
				if (left.type === ID && (right.type === FE || right.type === AFE || right.type === CE)) {
					fnNames.push(left.name);
				}
			},
			MethodDefinition: (node, state, c) => {
				fnLocs.push([node.loc.start, node.loc.end]);
			},
			IfStatement: (node, state, c) => {
				if (ifNodes[node.start] === true) return;
				const p = [node.loc.start, node.loc.end];
				let n = node;
				while (true) {
					if (n.alternate) {
						p.push(n.alternate.loc.start);
					}
					if (n.alternate && n.alternate.type === IF_STMT) {
						n = n.alternate;
						p[1] = n.loc.end;
						ifNodes[n.start] = true;
					} else {
						break;
					}
				}
				ifLocs.push(p);
			},
			ForStatement: (node, state, c) => {
				forLocs.push([node.loc.start, node.loc.end]);
			},
		});
	} catch(e) {
		console.error(e);
	}
	return { fnLocs: fnLocs, ifLocs: ifLocs, forLocs: forLocs, fnNames: fnNames };
}

if (typeof module === 'object') {
	module.exports = analyze;
}
