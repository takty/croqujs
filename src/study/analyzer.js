/**
 *
 * Code Analyzer (JS)
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2020-09-16
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

	const FE      = 'FunctionExpression';
	const AFE     = 'ArrowFunctionExpression';
	const CE      = 'ClassExpression';
	const ME      = 'MemberExpression';
	const IF_STMT = 'IfStatement';
	const ID      = 'Identifier';

	const fnLocs    = [];
	const ifLocs    = [];
	const forLocs   = [];
	const fnNames   = [];
	const ifNodes   = [];
	const varLocs   = [];
	const letLocs   = [];
	const constLocs = [];
	let   success   = true;

	try {
		const ast = acorn.loose.parse(code, { locations: true, ecmaVersion: 'latest' });
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
				switch (node.kind) {
					case 'var':
						for (let d of node.declarations) varLocs.push([d.id.loc.start, d.id.loc.end]);
						break;
					case 'let':
						for (let d of node.declarations) letLocs.push([d.id.loc.start, d.id.loc.end]);
						break;
					case 'const':
						for (let d of node.declarations) constLocs.push([d.id.loc.start, d.id.loc.end]);
						break;
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
		const es = e.toString();
		if (!es.startsWith('SyntaxError') && !es.startsWith('UnexpectedToken')) {
			console.error(e);
		}
		success = false;
	}
	const fnStarts = [];
	let lastEnd = -1;
	for (let loc of fnLocs) {
		if (lastEnd < loc[1].line - 1) {
			fnStarts.push(loc[0].line - 1);
			lastEnd = loc[1].line - 1;
		}
	}
	return { fnLocs, fnStarts, ifLocs, forLocs, fnNames, varLocs, letLocs, constLocs, success };
}

if (typeof module === 'object') {
	module.exports = analyze;
}
