/**
 * Checks whether string is all ASCII, and is thus potentially a valid Grapheme expression
 * @param string
 * @param onError {Function}
 */
import {errorInString} from "./parser_error"

// Whether a string is all ASCII characters
function isASCII(str) {
  return /^[\x00-\x7F]*$/.test(str);
}

// The following functions search for tokens of a given type, starting at index i of the string. A return value of -1
// signifies that no satisfying token was found. A return value of another index signifies that [i, index) is a valid
// token.

/**
 * Return whether the character with code charCode is a valid starting character of a variable, aka if it satisfies
 * [a-ZA-Z_].
 * @param charCode {number}
 */
function isValidStartingCharacter(charCode) {
  // First condition is for A-Z, second condition is for underscore, third condition is for _
  return (65 <= charCode && charCode <= 90) || (charCode === 95) || (97 <= charCode && charCode <= 122)
}

/**
 * Return whether the character with code charCode is a valid starting character of a variable, aka if it satisfies
 * [a-ZA-Z0-9_].
 * @param charCode {number}
 */
function isValidContinuationCharacter(charCode) {
  // We reuse the starting character code and add a check for 0-9.
  return isValidStartingCharacter(charCode) || (48 <= charCode && charCode <= 57)
}

/**
 * Return whether a string is a valid variable name (which means it is also a valid type name and function name)
 * @param string
 * @returns {boolean}
 */
function isValidVariableName(string) {
  const length = string.length
  if (length === 0)
    return false

  const firstCharWorks = isValidStartingCharacter(string.charCodeAt(0))

  if (!firstCharWorks)
    return false

  for (let i = 1; i < length; ++i) {
    if (!isValidContinuationCharacter(string.charCodeAt(i)))
      return false
  }

  return true
}

function findSimpleVariableToken(string, startIndex, firstChar) {
  if (!isValidStartingCharacter(firstChar))
    return -1

  let i = startIndex + 1
  const length = string.length

  for (; i < length; ++i) {
    if (!isValidContinuationCharacter(string.charCodeAt(i)))
      return i
  }

  return i
}

/**
 * Find a variable token starting at index i in string
 * @param string
 * @param startIndex
 * @param firstChar
 */
function findVariableToken(string, startIndex, firstChar) {
  const length = string.length

  let colonCount = 0

  if (firstChar === 58 && string.charCodeAt(startIndex + 1) === 58) { // starts with ::, which is permitted, so jump after that
    startIndex += 2
    colonCount = 2
  }

  let lastVarEnd = startIndex
  let i = startIndex

  for (; i < length; ++i) {
    const charCode = string.charCodeAt(i)

    if (charCode === 58) {
      if (colonCount === 2) {
        i = lastVarEnd
        break
      } else if (colonCount === 0) {
        lastVarEnd = i
      }

      colonCount++
    } else if (i === startIndex || colonCount === 2) { // starting character needed
      if (!isValidStartingCharacter(charCode)) {
        i = lastVarEnd
        break
      }
    } else {
      if (!isValidContinuationCharacter(charCode)) {
        break
      }
    }
  }

  if (colonCount === 2)
    i = lastVarEnd

  return (i === startIndex) ? -1 : i
}

function findStringToken(string, startIndex, firstChar) {
  const length = string.length

  // code for " and ', respectively
  if (firstChar !== 34 && firstChar !== 39)
    return -1

  let i = startIndex + 1
  let currentlyEscaping = false

  for (; i < length; ++i) {
    const char = string.charCodeAt(i)

    // Potential end of the string
    if (char === firstChar) {
      if (!currentlyEscaping) {
        return i + 1
      }
    }

    // code for backslash
    if (char === 92) {
      currentlyEscaping = !currentlyEscaping
    } else {
      currentlyEscaping = false
    }
  }

  return -1
}

// A number has the structure [0-9]*.?[0-9]+ or [0-9]*.?[0-9]+e[-+]?[0-9]+.
function findNumericToken(string, startIndex) {
  let exponentialFound = false
  let decimalPointFound = false

  let i = startIndex
  let decimalIndex = 0
  let exponentialIndex = 0

  for (; i < string.length; ++i) {
    const char = string.charCodeAt(i)

    if (char === 101 || char === 69) { // matches E or e
      if (exponentialFound || i === startIndex) // e/E can't be the first character
        break

      exponentialFound = true
      exponentialIndex = i
    } else if (char === 46) { // matches .
      if (decimalPointFound) // illegale
        break
      if (exponentialFound) {// Then the exponential character is actually not part of the number
        i = exponentialIndex
        break
      }
      decimalPointFound = true
      decimalIndex = i
    } else if (48 <= char && char <= 57) { // matches 0-9, aka always valid

    } else if (char === 45 || char === 43) { // minus/plus symbol, only allowed after e/E
      if (!exponentialFound)
        break

      if (i !== exponentialIndex + 1) // must occur immediately after e/E
        break
    } else {
      break
    }
  }

  if (i === startIndex)
    return -1

  return i
}

/**
 * Return whether a char code is a whitespace character
 * @param char
 * @returns {boolean}
 */
function isWhitespace(char) {
  return (char === 0x20 || char === 0x9 || char === 0xa || char === 0xc || char === 0xd || char === 0xa0 || char === 0x2028 || char === 0x2029)
}

const simpleOperators = {
  '+': '+',
  '-': '-',
  '*': '*',
  '/': '/',
  '!': '!',
  '!!': '!!',
  '!=': '!=',
  '==': '==',
  '=': '==',
  '<': '<',
  '>': '>',
  '<=': '<=',
  '>=': '>='
}

const operatorsFollowedByWhitespace = ["and", "or"]

const operatorOrder = Object.keys(simpleOperators).sort((s1, s2) => s2.length - s1.length)

for (let op of operatorsFollowedByWhitespace) {
  simpleOperators[op] = op
}

function findOperatorToken(string, startIndex, charCode) {
  for (let op of operatorOrder) {
    if (string.startsWith(op, startIndex)) {
      return startIndex + op.length
    }
  }

  for (let op of operatorsFollowedByWhitespace) {
    if (string.startsWith(op, startIndex) && isWhitespace(string.charCodeAt(startIndex + op.length + 1))) {
      return startIndex + op.length
    }
  }

  return -1
}

// The tokenizer converts a string expression into a stream of tokens. Each token is an object. All tokens share two
// properties: the type property, which is the type of the token, and the index property, which is the index of the
// token.
function expressionTokenizer(string, onError = (err) => { throw err }) {
  if (typeof string !== "string")
    throw new TypeError("expressionTokenizer given a non-string type")

  // Length of the string
  const length = string.length

  // current index of token emitting
  let currentIndex = 0
  let tokenIndex = 0
  let charCode = 0

  function getToken() {
    return string.slice(currentIndex, tokenIndex)
  }

  function advanceCurrentIndex() {
    currentIndex = tokenIndex
  }

  const tokens = []

  while (true) {
    // March along leading whitespace
    while (true) {
      charCode = string.charCodeAt(currentIndex)

      if (currentIndex >= length || !isWhitespace(charCode))
        break

      currentIndex++
    }

    if (currentIndex >= length) // We're done parsing the string!
      break

    let parenFound = true

    switch (charCode) {
      case 40: // (
        tokens.push({ type: "open_paren", index: currentIndex })
        break
      case 41: // )
        tokens.push({ type: "close_paren", index: currentIndex })
        break
      case 91: // [
        tokens.push({ type: "open_bracket", index: currentIndex })
        break
      case 93: // ]
        tokens.push({ type: "close_bracket", index: currentIndex })
        break
      case 124: // |
        tokens.push({ type: "vertical_bar", index: currentIndex})
        break
      default:
        parenFound = false
    }

    if (parenFound) {
      currentIndex++

      continue
    }

    tokenIndex = findVariableToken(string, currentIndex, charCode)

    if (tokenIndex !== -1) {
      const name = getToken()
      tokens.push({ type: "variable", name, index: currentIndex })
      advanceCurrentIndex()

      continue
    }

    tokenIndex = findStringToken(string, currentIndex, charCode)

    if (tokenIndex !== -1) {
      const contents = getToken().slice(1, -1)
      tokens.push({ type: "string", contents, index: currentIndex })
      advanceCurrentIndex()

      continue
    }

    tokenIndex = findNumericToken(string, currentIndex)

    if (tokenIndex !== -1) {
      const value = getToken()
      tokens.push({ type: "number", value, index: currentIndex })
      advanceCurrentIndex()

      continue
    }

    tokenIndex = findOperatorToken(string, currentIndex, charCode)

    if (tokenIndex !== -1) {
      const op = getToken()
      tokens.push({ type: "operator", op: simpleOperators[op], index: currentIndex })
      advanceCurrentIndex()

      continue
    }

    onError(errorInString(string, currentIndex, "Unrecognized token"))
  }

  return tokens
}

export {expressionTokenizer, isWhitespace}
