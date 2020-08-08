/**
 * Checks whether string is all ASCII, and is thus potentially a valid Grapheme expression
 * @param string
 * @param onError {Function}
 */
import {errorInString} from "./parser_error"

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

/**
 * Find a variable token starting at index i in string
 * @param string
 * @param startIndex
 */
function findVariableToken(string, startIndex) {
  const length = string.length

  // First character must be a valid starting character
  if (!isValidStartingCharacter(string.charCodeAt(startIndex)))
    return -1

  let i = startIndex + 1

  for (; i < length; ++i) {
    const charCode = string.charCodeAt(i)

    if (!isValidContinuationCharacter(charCode))
      return i
  }

  return i
}

function findStringToken(string, startIndex) {
  const length = string.length

  const firstChar = string.charCodeAt(startIndex)

  // code for " and ', respectively
  if (firstChar !== 34 && firstChar !== 39)
    return -1

  let i = startIndex + 1
  let currentlyEscaping = false

  for (; i < length; ++i) {
    const char = string.charCodeAt(i)

    // code for backslash
    if (char === 92) {
      currentlyEscaping = !currentlyEscaping
    } else {
      currentlyEscaping = false
    }

    // Potential end of the string
    if (char === firstChar) {
      if (!currentlyEscaping) {
        return i + 1
      }
    }
  }

  return -1
}

// A number has the structure [0-9]*.?[0-9]+ or [0-9]*.?[0-9]+e[0-9]+. The first regex should be tested last
function findNumericToken(string, startIndex) {
  let i = startIndex

  let exponentialFound = false
  let decimalPointFound = false

  for (; i < string.length; ++i) {
    const char = string.charCodeAt(i)

    if (char === 101 || char === 69) { // matches E or e
      if (exponentialFound)
        return i
      exponentialFound = true
    } else if (char === 46) { // matches .
      if (decimalPointFound)
        
    }
  }
}

/**
 * Return whether a char code is a whitespace character
 * @param charCode
 * @returns {boolean}
 */
function isWhitespace(char) {
  return (char === 0x20 || char === 0x9 || char === 0xa || char === 0xc || char === 0xd || char === 0xa0 || char === 0x2028 || char === 0x2029)
}

// The tokenizer converts a string expression into a stream of tokens. Each token is an object. All tokens share two
// properties: the type property, which is the type of the token, and the index property, which is the index of the
// token.
function* expressionTokenizer(string, onError = (err) => { throw err }) {
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

  tokenLoop: while (true) {
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
        yield { type: "open_paren", index: currentIndex }
        break
      case 41: // )
        yield { type: "close_paren", index: currentIndex }
        break
      case 91: // [
        yield { type: "open_bracket", index: currentIndex }
        break
      case 93: // ]
        yield { type: "close_bracket", index: currentIndex }
        break
      default:
        parenFound = false
    }

    if (parenFound) {
      currentIndex++

      continue
    }

    tokenIndex = findVariableToken(string, currentIndex)

    if (tokenIndex !== -1) {
      const name = getToken()
      yield { type: "variable", name, index: currentIndex }
      advanceCurrentIndex()

      continue
    }

    tokenIndex = findStringToken(string, currentIndex)

    if (tokenIndex !== -1) {
      const contents = getToken().slice(1, -1)
      yield { type: "string", contents, index: currentIndex }
      advanceCurrentIndex()

      continue
    }

    tokenIndex = findNumericToken(string, currentIndex)

    if (tokenIndex !== -1) {
      const value = getToken()
      yield { type: "number", value, index: currentIndex }
      advanceCurrentIndex()

      continue
    }

    onError(errorInString(string, currentIndex, "Unrecognized token"))
  }
}

export {expressionTokenizer, isWhitespace}
