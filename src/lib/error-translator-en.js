/**
 * Error Translator English Resources
 *
 * @author Takuto Yanagida
 * @version 2026-11-11
 */

export const messages = {
	valueTypes             : { boolean: 'boolean', string: 'string', number: 'number' },

	undefinedName          : { text: 'JavaScript cannot find a variable or function named “{value}”.', hint: 'Did you mistype the name? Did you declare that name before using it?' },
	beforeInitialization   : { text: '“{value}” is being used before it is given a value.', hint: 'Did you put something in the wrong place? Are you using a variable or constant before giving it a value?' },
	invalidAssignment      : { text: 'JavaScript cannot store a value in the expression on the left of =.', hint: 'Did you type the wrong symbol? Is there a variable or property that can hold a value to the left of “=”, or did you mean to compare values with “===”?' },

	callStackLimit         : { text: 'Too many function calls are waiting for one another to finish.', hint: 'Is the same thing happening over and over? If a function calls itself, can it reach the condition that makes it stop?' },
	invalidCount           : { text: 'This operation received a count it cannot use.', hint: 'Did you mistype how many times to do it? Is the count less than zero or equal to Infinity?' },
	invalidStringLength    : { text: 'The requested text is too large to create.', hint: 'Did you make the text too long? Are you trying to create a very long string by repeating or joining strings?' },
	invalidArrayLength     : { text: 'This array cannot have the requested length.', hint: 'Did you mistype the number? Is the array length negative, too large, or something other than a whole number?' },
	invalidBufferLength    : { text: 'The requested number of bytes is outside the allowed range for an array buffer.', hint: 'Did you work out the size incorrectly? Is the array buffer’s size in bytes negative or too large?' },
	bufferAllocationFailed : { text: 'JavaScript could not reserve enough memory for this array buffer.', hint: 'Did you use a number that is too big? Does the number of bytes you requested for the array buffer exceed the available memory?' },
	invalidTime            : { text: 'The date or time value is invalid.', hint: 'Did you mistype the date? Did you give JavaScript text or a number it cannot use to make a date?' },
	invalidRadix           : { text: 'The number base passed to toString() must be between 2 and 36.', hint: 'Did you mistype the number? Is the base you put inside the parentheses of “toString()” between 2 and 36?' },
	invalidCodePoint       : { text: 'This number does not identify a Unicode character.', hint: 'Did you mistype the number? Is the number you passed to the function within the range of valid code points?' },
	invalidPrecision       : { text: 'The number of digits requested is outside the allowed range.', hint: 'Did you mistype the number? Is the number of digits you asked for between 0 and 100?' },

	notAFunction           : { text: '“{value}” cannot be called as a function.', hint: 'Did you mistype the function name? Are you trying to call a value that is not a function?' },
	notAConstructor        : { text: '“{value}” cannot be used with new.', hint: 'Could there be a mistake in how you wrote this? Did you put a function or value that is not a constructor after “new”?' },
	missingNew             : { text: 'Creating an instance of “{value}” requires new.', hint: 'Did you leave out a word? Did you forget to put “new” before the class name?' },
	functionOrIterable     : { text: '“{value}” cannot be called, or its result cannot be looped over.', hint: 'Did you mistype the function name? Does that function return something you can loop over, like an array?' },
	notIterable            : { text: 'JavaScript cannot loop over the items in “{value}” as a sequence.', hint: 'Did you pick the wrong thing to loop over? Is the value in your “for...of” loop something you can take items from one at a time, like an array or a string?' },
	readEmptyProperty      : { text: 'JavaScript cannot read “{value}” because the value before it is undefined or null.', hint: 'Did you make a mistake just before this spot? Is the value to the left of “.” or “[” actually “undefined” or “null”?' },
	writeEmptyProperty     : { text: 'JavaScript cannot set “{value}” because the value before it is undefined or null.', hint: 'Did you do things in the wrong order? Did you create the object before trying to set its property?' },
	constantAssignment     : { text: 'A variable declared with const cannot be given a different value.', hint: 'Did you try to put a value in the same place again? Did you declare a variable with “const” even though you meant to change its value later?' },
	createPrimitiveProperty: { text: 'JavaScript cannot add the property “{property}” to the {valueType} value “{value}”.', hint: 'Did you try to put the value in the wrong place? Are you trying to add a property to a number or a string as if it were an object?' },

	unexpectedToken        : { text: 'JavaScript did not expect “{value}” here.', hint: 'Did you mistype a symbol? Is there an extra or missing bracket, parenthesis, or comma on this line or the one before it?' },
	unexpectedIdentifier   : { text: 'JavaScript found a name where it did not expect one.', hint: 'Did you leave out a symbol? Is there a comma or an operator missing just before this name?' },
	invalidToken           : { text: 'JavaScript cannot read a character or symbol here.', hint: 'Did an extra character slip in? Did you use the same kind of quotation mark at the start and the end?' },
	missingArgumentParen   : { text: 'A function call is missing its closing parenthesis ).', hint: 'Did you forget to close the parentheses? Is there a closing “)” after the values you pass to the function?' },
	unexpectedNumber       : { text: 'JavaScript did not expect a number here.', hint: 'Did you leave out a symbol before the number? Is there a comma or an operator missing just before this number?' },
	unexpectedString       : { text: 'JavaScript did not expect a string here.', hint: 'Did you leave out a symbol? Is there a comma or an operator missing just before this string?' },
	invalidDestructuring   : { text: 'JavaScript cannot assign part of this array or object to the expression you wrote.', hint: 'Did you mistype a name or a bracket? Are the variables or properties that receive the pieces written correctly to the left of “=”?' },
	missingConstValue      : { text: 'A const declaration must give the variable a value right away.', hint: 'Did you forget the value to start with? Did you write “=” and a value after the name of the constant?' },
	missingFunctionName    : { text: 'This function declaration needs a name.', hint: 'Did you forget to give it a name? Did you write the function’s name after “function”?' },
	invalidShorthand       : { text: 'A property in this object is written incorrectly.', hint: 'Did you mistype a symbol? Did you put “=” where you meant to put “:” between the property name and its value?' },
	invalidForOfInitializer: { text: 'The variable in a for…of loop gets its value from the loop.', hint: 'Did you put the value in the wrong place? Did you give the variable a starting value before “of” in the “for...of” loop?' },
	reservedWord           : { text: 'This word has a special meaning in JavaScript and cannot be used as a name here.', hint: 'Could there be a problem with the name you picked? Did you use a word that already has a special meaning in JavaScript as the name of a variable or function?' },
	octalInStrictMode      : { text: 'A number written in the old octal format is not allowed here.', hint: 'Did you mistype the number? Did you put an extra “0” at the start of a number you meant to write in base 10?' },
	illegalReturn          : { text: 'A return statement must be inside a function.', hint: 'Did you put it in the wrong place? Did you write “return” outside a function, or did a “}” close the function before it?' },
	unexpectedEnd          : { text: 'The program ended before JavaScript finished reading a statement.', hint: 'Did you leave something out? Did you forget a closing brace “}” or a closing quotation mark?' },
	awaitOutsideAsync      : { text: 'Inside a function, await can only be used if the function is marked async.', hint: 'Did you leave out a word? Did you forget to mark the function containing this await as async?' },
	duplicateName          : { text: 'The name “{value}” has already been declared here.', hint: 'Did you use the same name again? Did you declare a variable or constant with that name twice in the same scope?' },
};
