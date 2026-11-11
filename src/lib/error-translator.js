/**
 * Error Translator
 *
 * @author Takuto Yanagida
 * @version 2026-11-11
 */

import * as ja from './error-translator-ja.js';
import * as en from './error-translator-en.js';
import { escapeHtml } from './escape-html.js';

function parseMessage(msg) {
	const match = /^Uncaught (ReferenceError|RangeError|TypeError|SyntaxError|Error)/.exec(msg);
	if (match) {
		return { type: match[1], text: msg.substr(msg.indexOf(': ') + 2) };
	}
	return { type: 'Error', text: msg.replace('Uncaught ', '') };
}

function interpolate(message, values) {
	const text = message.text.replace(/\{(\w+)\}/g, (_, key) => values[key]);
	return { ...message, text };
}

function explainMessage(type, text, messages) {
	if (type === 'ReferenceError') {
		if (text.endsWith(' is not defined')) {
			const t = text.replace(' is not defined', '');
			return interpolate(messages.undefinedName, { value: t });
		}
		if (text.startsWith('Cannot access \'') && text.endsWith('\' before initialization')) {
			const t = text.replace('Cannot access \'', '').replace('\' before initialization', '');
			return interpolate(messages.beforeInitialization, { value: t });
		}
		if (text === 'Invalid left-hand side in assignment') {
			return messages.invalidAssignment;
		}
	}
	if (type === 'RangeError') {
		if (text === 'Maximum call stack size exceeded') {
			return messages.callStackLimit;
		}
		if (text === 'Invalid count value') {
			return messages.invalidCount;
		}
		if (text === 'Invalid string length') {
			return messages.invalidStringLength;
		}
		if (text === 'Invalid array length') {
			return messages.invalidArrayLength;
		}
		if (text === 'Invalid array buffer length') {
			return messages.invalidBufferLength;
		}
		if (text === 'Array buffer allocation failed') {
			return messages.bufferAllocationFailed;
		}
		if (text === 'Invalid time value') {
			return messages.invalidTime;
		}
		if (text === 'toString() radix argument must be between 2 and 36') {
			return messages.invalidRadix;
		}
		if (text.startsWith('Invalid code point')) {
			return messages.invalidCodePoint;
		}
		if (text.endsWith('argument must be between 0 and 100')) {
			return messages.invalidPrecision;
		}
	}
	if (type === 'TypeError') {
		if (text.endsWith('is not a function')) {
			const t = text.replace(' is not a function', '');
			return interpolate(messages.notAFunction, { value: t });
		}
		if (text.endsWith('is not a constructor')) {
			const t = text.replace(' is not a constructor', '');
			return interpolate(messages.notAConstructor, { value: t });
		}
		if (text.startsWith('Class constructor ') && text.endsWith(" cannot be invoked without 'new'")) {
			const t = text.replace('Class constructor ', '').replace(" cannot be invoked without 'new'", '');
			return interpolate(messages.missingNew, { value: t });
		}
		if (text.endsWith('is not a function or its return value is not iterable')) {
			const t = text.replace(' is not a function or its return value is not iterable', '');
			return interpolate(messages.functionOrIterable, { value: t });
		}
		if (text.endsWith('is not iterable')) {
			const t = text.replace(' is not iterable', '');
			return interpolate(messages.notIterable, { value: t });
		}
		if (text.startsWith('Cannot read property ') && (text.endsWith(' of undefined') || text.endsWith(' of null'))) {
			const t = text.replace(/.*'(.*)'.*/, (_, s1) => s1);
			return interpolate(messages.readEmptyProperty, { value: t });
		}
		if (text.startsWith('Cannot set property ') && (text.endsWith(' of undefined') || text.endsWith(' of null'))) {
			const t = text.replace(/.*'(.*)'.*/, (_, s1) => s1);
			return interpolate(messages.writeEmptyProperty, { value: t });
		}
		if (text.startsWith('Assignment to constant variable.')) {
			return messages.constantAssignment;
		}
		if (text.startsWith('Cannot create property \'') && text.includes('\' on ') && text.endsWith('\'')) {
			const m2 = text.replace('Cannot create property \'', '').replace(/'$/, '');
			let valueType, parts;
			if (m2.includes(' on boolean ')) {
				valueType = 'boolean';
				parts     = m2.split('\' on boolean \'');
			} else if (m2.includes(' on string ')) {
				valueType = 'string';
				parts     = m2.split('\' on string \'');
			} else if (m2.includes(' on number ')) {
				valueType = 'number';
				parts     = m2.split('\' on number \'');
			} else {
				return undefined;
			}
			return interpolate(messages.createPrimitiveProperty, { valueType: messages.valueTypes[valueType], property: parts[0], value: parts[1] });
		}
	}
	if (type === 'SyntaxError') {
		if (text.startsWith('Unexpected token')) {
			const t = text.replace(/.*'(.*)'.*/, (_, s1) => s1);
			return interpolate(messages.unexpectedToken, { value: t });
		}
		if (text.startsWith('Unexpected identifier')) {
			return messages.unexpectedIdentifier;
		}
		if (text.startsWith('Invalid or unexpected token')) {
			return messages.invalidToken;
		}
		if (text.startsWith('missing ) after argument list')) {
			return messages.missingArgumentParen;
		}
		if (text === 'Unexpected number') {
			return messages.unexpectedNumber;
		}
		if (text === 'Unexpected string') {
			return messages.unexpectedString;
		}
		if (text === 'Invalid destructuring assignment target') {
			return messages.invalidDestructuring;
		}
		if (text === 'Invalid left-hand side in assignment') {
			return messages.invalidAssignment;
		}
		if (text === 'Missing initializer in const declaration') {
			return messages.missingConstValue;
		}
		if (text === 'Function statements require a function name') {
			return messages.missingFunctionName;
		}
		if (text === 'Invalid shorthand property initializer') {
			return messages.invalidShorthand;
		}
		if (text === 'for-of loop variable declaration may not have an initializer.') {
			return messages.invalidForOfInitializer;
		}
		if (text === 'Unexpected strict mode reserved word') {
			return messages.reservedWord;
		}
		if (text === 'Octal literals are not allowed in strict mode.') {
			return messages.octalInStrictMode;
		}
		if (text === 'Illegal return statement') {
			return messages.illegalReturn;
		}
		if (text === 'Unexpected end of input') {
			return messages.unexpectedEnd;
		}
		if (text === 'await is only valid in async function') {
			return messages.awaitOutsideAsync;
		}
		if (text.startsWith('Identifier \'') && text.endsWith('\' has already been declared')) {
			const t = text.replace('Identifier \'', '').replace('\' has already been declared', '');
			return interpolate(messages.duplicateName, { value: t });
		}
	}
	return undefined;
}

function formatMessage(name, { text = '', hint }, original, hintSeparator = '') {
	let html = '<span>' + escapeHtml(name) + '</span>' + escapeHtml(text);
	if (hint !== undefined) {
		html += hintSeparator + '<b>' + escapeHtml(hint) + '</b>';
	}
	if (original !== undefined) {
		html += '<div>' + escapeHtml(original) + '</div>';
	}
	return html;
}

export class ErrorTranslator {

	constructor(lang) {
		this._lang = lang;
	}

	translate(msg) {
		if (this._lang === 'ja') return this.translateJa(msg);
		if (this._lang === 'en') return this.translateEn(msg);
		return escapeHtml(msg);
	}

	translateJa(msg) {
		const { type, text } = parseMessage(msg);
		return formatMessage(ja.errorNames[type], explainMessage(type, text, ja.messages) ?? { text }, msg);
	}

	translateEn(msg) {
		const { type, text } = parseMessage(msg);
		const explanation = explainMessage(type, text, en.messages);
		return explanation ? formatMessage(type, explanation, msg, ' ') : formatMessage(type, { text });
	}

}
