/**
 * Checks whether string is all ASCII, and is thus potentially a valid Grapheme expression
 * @param string
 * @param onError {Function}
 */
import {errorInString, getErrorInStringMessage, ParserError} from "./parser_error"

// Whether a string is all ASCII characters
function isASCII(str) {
  return /^[\x00-\x7F]*$/.test(str)
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

    if (charCode === 58) { // reached when there is a colon
      if (colonCount === 2) {
        i = lastVarEnd
        break
      } else if (colonCount === 0) {
        lastVarEnd = i
      }

      colonCount++
    } else if (i === startIndex || colonCount === 2) { // reached when a simple variable token is expected
      const newI = findSimpleVariableToken(string, i, charCode)

      if (newI === -1) {
        i = lastVarEnd
        break
      }

      i = newI - 1
      lastVarEnd = newI
    } else {
      break
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
  let numericFound = false

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
      numericFound = true
    } else if (char === 45 || char === 43) { // minus/plus symbol, only allowed after e/E
      if (!exponentialFound)
        break

      if (i !== exponentialIndex + 1) // must occur immediately after e/E
        break
    } else {
      break
    }
  }

  if (i === startIndex || !numericFound)
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
  '^': '^',
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

function findFunctionTemplateDefinition(string, startIndex, charCode) {
  switch (charCode) {
    case 40: // (
      return startIndex + 1
    case 58: // :
      if (string.charCodeAt(startIndex + 1) === 58) {
        for (let i = startIndex + 2; i < string.length; ++i) { // search for the next (
          if (string.charCodeAt(i) === 40) {
            return i + 1
          }
        }
      }
  }

  return -1
}

function findPropertyAccessToken(string, startIndex, charCode) {
  if (charCode !== 46) // matches '.', which denotes a property access
    return -1

  // Search for a variable name after '.', which is a valid property access (for example, .a is valid but not .3)
  return findSimpleVariableToken(string, startIndex + 1, string.charCodeAt(startIndex + 1))
}

// The paren tokens
const PAREN_TOKENS = [
  {type: "paren", paren: '('},
  {type: "paren", paren: ')'},
  {type: "paren", paren: '['},
  {type: "paren", paren: ']'},
  {type: "paren", paren: '|'}
]

// The tokenizer converts a string expression into a stream of tokens. Each token is an object. All tokens share two
// properties: the type property, which is the type of the token, and the index property, which is the index of the
// token.
function simpleTokenizer(string) {
  if (typeof string !== "string") {
    throw new TypeError("expressionTokenizer given a non-string type")
  }

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

    // The remainder of the loop is for finding tokens. The token types are paren, comma, function, variable, string, number, property_access

    let singleCharTokenFound = true

    // Handle simple single-character tokens
    switch (charCode) {
      case 40: // (
      case 41: // )
      case 91: // [
      case 93: // ]
      case 124: // |
        tokens.push({ type: "paren", paren: String.fromCharCode(charCode), index: currentIndex, pID: -1 })
        break
      case 44: // ,
        tokens.push({ type: "comma", index: currentIndex })
        break
      default:
        singleCharTokenFound = false
    }

    if (singleCharTokenFound) {
      currentIndex++

      continue
    }

    tokenIndex = findVariableToken(string, currentIndex, charCode)

    if (tokenIndex !== -1) {
      const name = getToken()

      const prospectiveFunctionIndex = tokenIndex

      const functionToken = findFunctionTemplateDefinition(string, prospectiveFunctionIndex, string.charCodeAt(prospectiveFunctionIndex))

      // If a function was found...
      if (functionToken !== -1) {
        tokens.push({ type: "function_token", name: string.slice(currentIndex, functionToken - 1), index: currentIndex })
        // push a (, since that is included in function
        tokens.push({ type: "paren", paren: '(', index: functionToken - 1, pID: -1 })

        currentIndex = functionToken
        continue
      }

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

    tokenIndex = findPropertyAccessToken(string, currentIndex, charCode)

    if (tokenIndex !== -1) {
      const prop = getToken().slice(1)
      tokens.push({ type: "property_access", prop, index: currentIndex })
      advanceCurrentIndex()

      continue
    }

    tokenIndex = findOperatorToken(string, currentIndex, charCode)

    if (tokenIndex !== -1) {
      const op = getToken()
      tokens.push({ type: "operator_token", op: simpleOperators[op], index: currentIndex, implicit: false })
      advanceCurrentIndex()

      continue
    }

    throw errorInString(string, currentIndex, "Unrecognized token")
  }

  return tokens
}

function parenToDescriptor(token, plural=false) {
  switch (token.paren) {
    case '(':
    case ')':
      return plural ? "parentheses" : "parenthesis"
    case '[':
    case ']':
      return plural ? "brackets" : "bracket"
    case '|':
      return plural ? "vertical bars" : "vertical bar"
    default:
      return ""
  }
}

function parenToCompleteDescriptor(token, plural=false) {
  if (!token.hasOwnProperty("opening"))
    return ""

  const descriptor = parenToDescriptor(token, plural)

  return (token.opening ? "opening" : "closing") + ' ' + descriptor
}

/**
 * The function checks whether the tokens are balanced. It also modifies the tokens modifying their pID properties,
 * signifying for each paren what the corresponding closing/opening paren is. For vertical bars, it also sets their
 * opening property to true/false, depending on whether the bar is an opening or closing bar.
 * @param string
 * @param tokens
 */
function checkParensBalanced(string, tokens) {
  // The stack of parens
  const stack = []

  // Get the last paren (like .pop() but without mutating the array)
  function peek() {
    return stack[stack.length - 1]
  }

  function findParenWithId(id) {
    return tokens.find(token => token.pID === id)
  }

  // Fancy unbalanced parentheses error, including information about the corresponding parenthesis that led to the error
  function unbalancedParenError(token, prevId) {
    const prevParen = findParenWithId(prevId)

    const helpMessage = prevParen ? getErrorInStringMessage(string, prevParen.index, "Note: Corresponds to a " +
      parenToCompleteDescriptor(prevParen), "Perhaps change this to an opening " +
      parenToDescriptor(token) + '?') : ""

    return errorInString(string, token.index, "Unbalanced " + parenToDescriptor(token, true), helpMessage)
  }

  let id = 0 // id for paren pairs

  // Vertical bars are a bit hard to handle correctly. We assume that, if a bar is encountered and it can be correctly
  // interpreted as a closing bar, then it IS a closing bar. Otherwise, it is an opening bar. The logic is described below.
  for (let i = 0; i < tokens.length; ++i) {
    const token = tokens[i]

    if (token.type === "paren") { // All that we are concerned about lol
      switch (token.paren) {
        case '(':
          // 1 <-> '('
          stack.push(++id, 1)

          token.pID = id
          token.opening = true

          break
        case '[':
          // 2 <-> '['
          stack.push(++id, 2)

          token.pID = id
          token.opening = true

          break
        case '|': {
          // An annoying case. If the last item on the stack is NOT |, then we push |. If it IS |, then we check the
          // previous token. If it is an opening | or operator, we push |. Otherwise, we pop | and continue.

          // The reason behind this is relatively straightforward. | ... | will try to close when it is semantically
          // valid, but if it is not, it will result in two opening parens. Consider ||x||, for example. The first bar
          // is clearly an opening bar. The second bar sees that the previous token is a |, and thus determines that it
          // is also an opening bar. In the case of |3|x||, however, it parses as |3| * x * ||, leading to a syntax
          // error. In the case of |3 * |x||, it will parse correctly, since the token before | is *. This is the
          // "close as soon as possible" disambiguation.

          const last = peek()

          // Whether this is an opening |
          let pushBar = true

          if (last === 3) { // last item is |
            const prevToken = tokens[i - 1] // prevToken will always exist, since if last === 3 the stack is nonempty
            const prevTokenType = prevToken.type

            if (!((prevTokenType === "paren" && prevToken.opening) || prevTokenType === "operator")) {
              pushBar = false
            }
          }

          if (pushBar) {
            // 3 <-> '|'
            stack.push(++id, 3)
            token.pID = id
            token.opening = true
          } else {
            stack.pop()
            token.pID = stack.pop()
            token.opening = false
          }

          break
        }
        case ')': {
          const last = stack.pop()
          const lastId = stack.pop()

          // Check if popped paren is (
          if (last !== 1)
            throw unbalancedParenError(token, lastId)

          token.pID = lastId
          token.opening = false
          break
        }
        case ']': {
          const last = stack.pop()
          const lastId = stack.pop()

          // Check if popped paren is [
          if (last !== 2)
            throw unbalancedParenError(token, lastId)

          token.pID = lastId
          token.opening = false
          break
        }
      }
    }
  }

  if (stack.length !== 0) {
    // Get the id of the last unclosed paren
    const unclosedTokenId = (stack.pop(), stack.pop())
    const unclosedToken = findParenWithId(unclosedTokenId)

    const helpMessage = getErrorInStringMessage(string, unclosedToken.index, "Note: Unclosed " +
      parenToCompleteDescriptor(unclosedToken))

    throw errorInString(string, string.length, "Unbalanced parentheses/brackets/vertical bars", helpMessage)
  }
}

function isOpenParen(token) {
  switch (token.paren) {
    case '(': // We return false for [ because we want "arr [3]" to turn into a subscript operator, not arr * [3]
      return true
    case '|':
      return token.opening
  }

  return false
}

function isCloseParen(token) {
  switch (token.paren) {
    case ')':
    case ']':
      return true
    case '|':
      return !token.opening
  }

  return false
}

/**
 * This basically just forwards the result of the simpleTokenizer, but with automatically-inserted * operators as well.
 * List of options:
 *  implicitMultiplication: true/false; whether to insert multiplication stuff
 *
 * @param string
 * @param options
 */
function expressionTokenizer(string, options={implicitMultiplication: true}) {
  let tokens = simpleTokenizer(string)

  checkParensBalanced(string, tokens)

  const {
    implicitMultiplication
  } = options

  if (implicitMultiplication) {
    let token1, token2 = tokens[0]
    const newTokens = []

    for (let i = 1; i < tokens.length; ++i) {
      token1 = token2
      token2 = tokens[i]

      // For each pair of tokens, we insert * operators if they match any of the following:
      // [number/variable] (
      // ) [number/variable/function]
      // ) (
      // [number/variable] [number/variable/function]

      newTokens.push(token1)

      const type1 = token1.type, type2 = token2.type
      const implicitMult = (type1 === "number" || type1 === "variable" || (type1 === "paren" && isCloseParen(token1)))
        && ((type2 === "paren" && isOpenParen(token2)) || (type2 === "number" || type2 === "variable" || type2 === "function_token"))

      if (implicitMult)
        newTokens.push({ type: "operator_token", op: '*', index: token2.index - 1, implicit: true })
    }

    newTokens.push(token2)

    tokens = newTokens
  }

  return tokens
}

const tokenEnum = {
  "comma ": "comma",

}

export {expressionTokenizer}
