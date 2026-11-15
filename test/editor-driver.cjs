// The component keeps its API private in production, so renderer tests drive CM6's view.
module.exports = `
	window.testEditor = {
		view() { return document.querySelector('.cm-content').cmTile.root.view; },
		getValue() { return this.view().state.doc.toString(); },
		setValue(text) {
			const view = this.view();
			view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, userEvent: 'input' });
		},
		lineCount() { return this.view().state.doc.lines; },
		replaceRange(text, from, to = from) {
			const view = this.view();
			const offset = pos => pos.line >= view.state.doc.lines
				? view.state.doc.length
				: view.state.doc.line(pos.line + 1).from + pos.ch;
			view.dispatch({ changes: { from: offset(from), to: offset(to), insert: text }, userEvent: 'input' });
		},
	};
`;
