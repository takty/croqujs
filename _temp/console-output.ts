/**
 * Console Output
 *
 * @author Takuto Yanagida
 * @version 2025-08-13
 */

export type Output = {
	count: number;
	type : string;
	msg  : string;
};

export function compactOutputs(outputs: ReadonlyArray<Output>, cache: ReadonlyArray<Output>): Output[] {
	const nos: Output[] = [];
	let last: Output | null = null;

	for (let o of outputs) {
		if (last && last.type === o.type && last.msg === o.msg) {
			last.count += o.count;
		} else {
			nos.push(o);
			last = o;
		}
	}
	if (0 < cache.length && 0 < nos.length) {
		const head: Output = nos[0];
		const tail: Output = cache.at(-1)!;

		if (tail.type === head.type && tail.msg === head.msg) {
			tail.count += head.count;
			nos.shift();
		}
	}
	return nos;
}
