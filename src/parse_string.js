import {expressionTokenizer} from "./expression_tokenizer.js"
import {errorInString, getErrorInStringMessage, isFunction, ParserError} from "./parser_error.js"

/**
 * Apply a function func to all pairs of an array
 * @param arr {Array}
 * @param func {Function} Signature is (elem1, elem2, elem1index, skipNextPair)
 * @param includeEnds {boolean} Whether to call func with the additional calls (undefined, first), (last, undefined)
 */
function pairwise(arr, func, includeEnds = true) {
  const top = arr.length - 1 + includeEnds
  let i = -includeEnds

  // Callback used when we want to skip the next pair (e.g. when we are collapsing functions)
  function skipNextPair() {
    ++i
  }

  for (; i < top; i++) {
    func(arr[i], arr[i + 1], i, skipNextPair)
  }
}

/**
 * Apply a function func to all triples in an array
 * @param arr {Array}
 * @param func {Function} Signature is (elem1, elem2, elem3, elem2index, replaceWith)
 * @param includeEnds {boolean} Whether to call func with the additional calls (undefined, first, second), (penultimate, last, undefined)
 * @param rtl {boolean} Whether to make the calls from left to right or right to left
 */
function triplewise(arr, func, includeEnds = true, rtl = true) {
  let lower = includeEnds ? 0 : 1
  let upper = arr.length - lower - 1
  let i = rtl ? upper : lower

  function skipNextTriple() {
    rtl ? (--i) : (++i)
  }

  function replaceWith(subarr) {
    // Replace arr[i-1] through arr[i+1] with subarr
    if (i === 0)
      arr.splice(0, 2, ...subarr.slice(1))
    else if (i === arr.length - 1)
      arr.splice(arr.length - 2, 3, ...subarr.slice(0, 2))
    else
      arr.splice(i - 1, 3, ...subarr)

    if (subarr.length === 1) // If this is the case we need to change i
      --i
  }

  // i is the index of the middle element
  for (; rtl ? (i >= lower) : (i <= arr.length - lower - 1); skipNextTriple()) {
    func(arr[i - 1], arr[i], arr[i + 1], i, replaceWith)
  }
}

class CyclicalError extends Error {
}

/**
 * The nodes/tokens are specified below. Common to all nodes/tokens are the properties type, which denotes the type of
 * node/token it is, and index, the first index of the node/token in the original string. Common to all nodes are the
 * properties endIndex, which is the last index (inclusive) of the node, and children, which is an array of the node's
 * children.
 *
 * Both nodes and tokens:
 *   number: { type: "number", index: (number), endIndex?: (number), value: (string) }
 *     Description: corresponds to a number in the original source.
 *     Properties:
 *       value: a string containing the number
 *   string: { type: "string", index: (number), endIndex?: (number), contents: (string), src: "string" | "property_access" | "operator", quote?: 0 | 1 }
 *     Description: corresponds to a string in the original source.
 *     Properties:
 *       contents: a string containing the string's contents
 *       src: a string representing the type of the original token that gave rise to this string. property_access emits strings,
 *         and cchain converts boolean operators to strings
 *       quote: 0 if the string is delimited with "; 1 if it is delimited with '
 * Only tokens:
 *   comma: { type: "comma", index: (number) }
 *     Description: corresponds to a comma in the original source.
 *   paren: { type: "paren", index: (number), paren: '(' | ')' | '[' | ']' | '|', opening: (boolean) }
 *     Description: corresponds to a parenthesis, bracket or vertical bar in the original source.
 *     Properties:
 *       paren: a string representing which type of parenthesis the paren token is
 *       opening: a boolean representing whether the paren is an opening paren or closing paren. Most useful with vertical bars
 *   function_token: { type: "function_token", index: (number), name: (string) }
 *     Description: corresponds to a function declaration, not including the subsequent opening parenthesis.
 *     Properties:
 *       name: a string containing the function's name
 *   property_access: { type: "property_access", index: (number), prop: (string) }
 *     Description: corresponds to a property access.
 *     Properties:
 *       prop: a string containing what property to access
 *   operator_token: { type: "operator_token", index: (number), op: (string), implicit: (boolean) }
 *     Properties:
 *       op: a string containing the operator itself
 *       implicit: whether the operator was implicitly added or explicitly done by the user
 * Only nodes:
 *   node: { type: "node", index: (number), endIndex: (number), parenType: '' | '(' | '[' | '|', children: (Array)}
 *     Description: a generic node, corresponding to a processed or unprocessed parenthesized expression in the source.
 *     Properties:
 *       parenType: a string containing the opening parenthesis of the node
 *   function: { type: "function", index: (number), endIndex: (number), children: (Array),
 *     parenInfo: { index: (number), endIndex: (number), verticalBar: (boolean) }}
 *     Description: a processed function call
 *     Properties:
 *       parenInfo.index: the index of the opening parenthesis of the function call
 *       parenInfo.endIndex: the index of the closing parenthesis of the function call
 *       parenInfo.verticalBar: (only used for | ... | style abs declarations) whether the function is instantiated from
 *         a vertical bar
 *   operator: { type: "operator", index: (number), endIndex: (number), children: (Array), op: (string), implicit: (boolean) }
 *     Description: a processed operation
 *     Properties:
 *       op: a string containing the operation itself
 *       implicit: whether the operator was generated implicitly
 */

/**
 * Recurse through the children of a node and call func for each node. Note that this doesn't actually use recursion,
 * which means it can handle deeply nested expressions which would otherwise overflow the stack. Huzzah! Note that if
 * you give this function an object with cyclical references, it will get pissed and crash (but only after gobbling up
 * all of your memory). You can avoid this by setting checkCycles=true, which will throw an error if a cycle is detected.
 * The depth of recursion is given by depth, which defaults to Infinity.
 * @param topNode
 * @param func {Function} Signature is (node, parent)
 * @param childrenFirst {boolean} Whether to call func on children first or the upper node first
 * @param rtl {boolean} Whether to call func on children from right to left or left to right
 * @param onlyNodesWithChildren {boolean} If true, only call func on nodes that have children
 * @param depth {Number}
 * @param checkCycles {boolean}
 */
function applyToNodesRecursively(topNode, func, childrenFirst = false, rtl = false, onlyNodesWithChildren = false, depth = Infinity, checkCycles = false) {
  // Check the function is being used properly
  if (typeof topNode !== "object")
    throw new TypeError("Given topNode is not an object.")
  if (!isFunction(func))
    throw new TypeError("Given callback fn is not a function.")
  if (depth <= 0 || (!Number.isInteger(depth) && depth !== Infinity))
    throw new RangeError("depth parameter must be a positive integer or Infinity.")

  // Simple case, guaranteeing there will be at least one level of recursion
  if (!topNode.children)
    func(topNode, null)

  // The stack of nodes that we are currently in. The first item will always be the top level node, the second item the
  // first-level subnode we are in, etc.
  const nodeStack = [topNode]

  // The stack of WHERE in each node's children we are. This is so that once we have finished exploring a subnode, we
  // can start exploring the next subnode.
  const nodeChildIndexStack = [rtl ? topNode.children.length - 1 : 0]

  // Return the last node on the stack (aka the node we are currently iterating through)
  function peek() {
    return nodeStack[nodeStack.length - 1]
  }

  // Return the last index on the stack (aka where we are in the current node)
  function peekIndex() {
    return nodeChildIndexStack[nodeStack.length - 1]
  }

  // Set the index, aka where to resume iteration next time
  function setIndex(i) {
    nodeChildIndexStack[nodeStack.length - 1] = i
  }

  // Returns the second-to-last node on the stack, and null if it doesn't exist
  function peekParent() {
    const parent = nodeStack[nodeStack.length - 2]

    return parent ? parent : null
  }

  // If childrenFirst is false, we need to explicitly call func on the top node, since it won't be called in the main loop
  if (!childrenFirst)
    func(topNode, null)

  let currentNode

  // The main loop of the iteration. We break out of it once the stack is empty. The first time in a while I've used a
  // label. Send your "bad practice" complaints to /dev/null or certainlynotasheep@gmail.com.
  main:
    // noinspection JSAssignmentUsedAsCondition (To appease Monseigneur Harvey Webstorm)
    while (currentNode = peek()) { // While there is a node whose children we must iterate over...
      // Get the index to start iterating at
      const currentIndex = peekIndex()

      const currentChildren = currentNode.children

      if (nodeStack.length < depth) { // Enter the inner loop if we haven't gone that deep
        // Iterate over the children
        for (let i = currentIndex; rtl ? (i >= 0) : (i < currentChildren.length); rtl ? (--i) : (++i)) {
          const child = currentChildren[i]

          if (!child.children || child.children.length === 0) {
            // child doesn't need to be recursed into, so just call the function and continue the loop. The value of
            // childrenFirst doesn't matter here.
            if (!onlyNodesWithChildren)
              func(child)
          } else {
            // Check for cycles
            if (checkCycles && nodeStack.some(node => node === child))
              throw new CyclicalError("Object contains a cycle!")

            // child needs to be traversed because it has at least one child.
            // Update the index of currentNode in the stack.
            setIndex(i + (rtl ? -1 : 1))

            // If childrenFirst is false, call func
            if (!childrenFirst)
              func(child)

            // Add this child to the list
            nodeStack.push(child)
            nodeChildIndexStack.push(rtl ? child.children.length - 1 : 0)

            // Continue the main loop with the new child
            continue main
          }
        }
      }

      // Call func on the current node. Note that this means
      if (childrenFirst)
        func(currentNode)

      // Pop the last values in the stack, starting iteration at the parent
      nodeStack.pop()
      nodeChildIndexStack.pop()
    } // main
}

// Check whether an operator (as a string) could be a prefix operator
function couldBePrefixOp(op) {
  return op === '-' || op === '+'
}

// Check whether an op could be a postfix operator. Note that this is actually always the case, unlike the previous fn
function couldBePostfixOp(op) {
  return op === '!' || op === '!!'
}

/**
 * Split an array by those elements of the array which satisfy func.
 * @param arr
 * @param func
 */
function splitByFunction(arr, func) {
  if (!Array.isArray(arr))
    throw new TypeError("splitByFunction requires an array to be passed.")
  if (typeof func !== "function")
    throw new TypeError("splitByFunction needs to be supplied with a callback function.")

  const result = []
  let curr = []

  for (let i = 0; i < arr.length; ++i) {
    const elem = arr[i]

    // If elem satisfies func, split the array there
    if (func(elem)) {
      if (curr.length !== 0)
        result.push(curr)
      curr = []
    } else {
      curr.push(elem)
    }
  }

  if (curr.length !== 0)
    result.push(curr)

  return result
}

/**
 * Convert an array of the tokens/nodes in function arguments by splitting them across commas
 * @param arr {Array}
 * @returns {Array}
 */
function processFunctionArguments(arr) {
  if (!arr || arr.length === 0) // Trivial case
    return []

  // Split the arguments across commas and merge each group into a node
  return splitByFunction(arr, node => node.type === "comma").map(subnode => {
    if (subnode.length === 0)
      throw new ParserError("This should never happen.")
    if (subnode.length === 1) // this will happen in cases like f(3), where the subnode(s) can be expressed as a single token
      return subnode[0]

    return {
      type: "node",
      index: subnode[0].index,
      endIndex: getEndingIndex(subnode),
      parenType: "",
      children: subnode
    }
  })
}

/**
 * Surround str with parentheses of a given type
 * @param paren {String}
 * @param str {String}
 * @returns {String}
 */
function parenthesizeString(paren, str) {
  switch (paren) {
    case '(':
    case ')':
      return `(${str})`
    case '[':
    case ']':
      return `[${str}]`
    case '|':
      return `|${str}|`
    default:
      return str
  }
}

/**
 * Convert a node to a string. Not as powerful as the corresponding function for AST nodes, but useful for debugging
 * @param node {Object}
 * @returns {String}
 */
export function nodeToString(node) {
  // Handle arrays
  if (Array.isArray(node))
    node = {children: node, type: "node"}

  switch (node.type) {
    case "comma":
      return ', '
    case "function":
      return node.name + parenthesizeString('(', node.children.map(nodeToString).join(''))
    case "function_token":
    case "variable":
      return node.name
    case "node":
      return parenthesizeString(node.parenType, node.children.map(nodeToString).join(''))
    case "number":
      return node.value
    case "operator":
      switch (node.children.length) {
        case 1:
          if (couldBePostfixOp(node.op)) {
            return nodeToString(node.children) + node.op
          } else {
            return node.op + nodeToString(node.children)
          }
        case 2:
          return nodeToString(node.children[0]) + node.op + nodeToString(node.children[1])
        default:
          throw new Error("Operator somehow has arity that's not one or two??")
      }
    case "operator_token":
      return node.op
    case "property_access":
      return '.' + node.prop
    case "paren":
      return node.paren
    case "string":
      const quote = (string.quote === 1) ? "'" : ((string.quote === 0) ? '"' : '')
      return `${quote}${string.contents}${quote}`
    default:
      return ""
  }
}

/**
 * For nodes whose starting index is not known, compute it
 * @param node {Object}
 * @returns {number}
 */
function getStartingIndex(node) {
  return node.index ?? (node.children ? node.children[0].index : NaN)
}

/**
 * For nodes whose endIndex is not known, compute its endIndex
 * @param node {Object}
 * @returns {number}
 */
function getEndingIndex(node) {
  if (node.endIndex !== undefined)
    return node.endIndex

  // If node is an array, convert it to an intermediate form (rarely used)
  if (Array.isArray(node))
    node = { children: node }

  // If the node has children, find the last child's ending index
  if (node.children)
    return getEndingIndex(node.children[node.children.length - 1])

  // Cases for various node types, calculating the endIndex based on the node
  switch (node.type) {
    case "comma":
    case "paren":
      return node.index
    case "function_token":
    case "variable":
      return node.index + node.name.length - 1
    case "number":
      return node.index + node.value.length - 1
    case "operator":
    case "operator_token":
      return node.index + node.op.length - 1
    case "property_access":
      return node.index + node.prop.length
    case "string":
      switch (node.src) {
        case "string":
          return node.index + node.contents.length + 1
        case "property_access":
        case "operator":
          return node.index + node.contents.length - 1
        default:
          throw new Error("Unknown string source " + node.src)
      }
    default:
      throw new TypeError("Could not find ending index of node " + JSON.stringify(node))
  }
}

/**
 * Check if a node can be used as an operand in a binary, unary or postfix operator
 * @param node {Object}
 * @returns {boolean}
 */
function checkIfValidOperand(node) {
  switch (node.type) {
    case "comma":
    case "paren":
    case "function_token":
    case "operator_token":
    case "property_access":
      return false
    default:
      return true
  }
}

/**
 * Take a string and capitalize its first letter
 * @param string {String}
 * @returns {string}
 */
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1)
}

// Operator passes
const firstOperatorPass = [{"ops": {"postfixes": ["!", "!!"]}, "rtl": false}, {
  "ops": {
    "unaries": ["+", "-"],
    "binaries": ["^"]
  }, "rtl": true
}, {"ops": {"binaries": ["*", "/"]}, "rtl": false}, {
  "ops": {"binaries": ["+", "-"]},
  "rtl": false
}, {"ops": {"binaries": ["and", "or"]}, "rtl": false}]
const secondOperatorPass = [{"ops": {"binaries": ["==", "!=", "<", ">", "<=", ">="]}, "rtl": false}]

/**
 * Convert string into a dict representation of its AST.
 *
 * There are three types of operators: prefix (aka unary), postfix (also unary, but I won't call it that), and binary.
 * Most operators are, of course, binary. Prefix operators include - and +. Postfix operators include ! and !! (double
 * factorial).
 * @param string
 * @param options
 */
function parseString(string, options = {implicitMultiplication: true}) {
  // The parsing steps are as follows:
  // 0. Tokenize (this includes checking for balanced parens)
  // 1. Check token validity
  //   a. Function templates not malformed
  // 2. Check certain common token patterns that will certainly lead to errors later
  //   a. operator followed by non-unary operator or closing parenthesis
  //   b. unary operator or opening parenthesis followed by non-unary operator
  // 3. Collapse parenthesized expressions into subnodes, recursively, keeping track of the paren types
  // 4. Convert | ... | into abs( ... )
  // 5. Process functions
  //   a. Convert f(node) into f{node.split(comma)}
  // 6. Process property accesses from right to left
  // 7. Process operators recursively
  //   a. Double factorials and factorials, in the same pass, from left to right
  //   b. Exponentiation and unary minus/plus, in the same pass, from right to left
  //   c. Multiplication and division, in the same pass, from left to right
  //   d. Addition and subtraction, in the same pass, from left to right
  //   e. and and or, in the same pass, from left to right
  //   f. Chained comparison operators -> cchain
  //   g. Comparison operators (==, !=, <, >, <=, >=), in the same pass, from left to right
  // 8. Check for unprocessed tokens
  // 9. Add index / endIndex information to all nodes

  // Step 0
  const tokens = expressionTokenizer(string, options)

  function findTokenIndex(tok) {
    return tok ? tokens.indexOf(tok) : -1
  }

  // Step 1

  // Some common help messages
  const startingOperatorHelp = "Perhaps remove the operator, or add a value after the operator?"
  const trailingOperatorHelp = "Perhaps remove the operator, or add a value before the operator?"
  const extraCommaHelp = "Perhaps remove the comma? Note that Grapheme does not have default arguments; extraneous commas cannot be used to omit a function argument."

  // Step 2
  pairwise(tokens, (tok1, tok2) => {
    // Types of each token
    const type1 = tok1?.type
    const type2 = tok2?.type

    // a. Check for operators followed by non-unary operators or closing parenthesis
    if (type1 === "operator_token") {
      if (type2 === "operator_token") {
        if (!couldBePrefixOp(tok2.op))
          throw errorInString(string, tok2.index, "Operator followed by non-unary operator", "Perhaps remove one of the operators?")
      } else if (type2 === "paren" && !couldBePrefixOp(tok1.op)) {
        if (!tok2.opening)
          throw errorInString(string, tok1.index, "Operator immediately followed by closing parenthesis", trailingOperatorHelp)
      }
    }

    // b. Check for non-unary operators after opening parens, after commas, or at the beginning of the expression
    if (type2 === "operator_token" && !couldBePrefixOp(tok2.op)) {
      if (!tok1)
        throw errorInString(string, tok2.index, "Non-unary operator starting an expression", startingOperatorHelp)
      else if ((type1 === "paren" && tok1.opening) || type1 === "comma")
        throw errorInString(string, tok2.index, "Non-unary operator starting a " +
          ((type1 === "paren") ? "parenthesized " : '') + "subexpression", startingOperatorHelp)
    }

    // c. Check for non-postfix operators before closing parens, before commas, or at the end of an expression
    if (type1 === "operator_token" && !couldBePostfixOp(tok1.op)) {
      if (!tok2)
        throw errorInString(string, tok1.index, "Trailing operator at end of expression", startingOperatorHelp)
      else if ((type2 === "paren" && !tok2.opening) || type2 === "comma")
        throw errorInString(string, tok1.index, "Trailing operator at end of " +
          ((type2 === "paren") ? "parenthesized " : '') + "subexpression", startingOperatorHelp)
    }

    // d. No starting commas in a subexpression
    if (type2 === "comma") {
      if (!tok1 || (type1 === "paren" && tok1.opening))
        throw errorInString(string, tok2.index, "Comma at start of " + (tok1 ? "parenthesized subexpression" : "expression"), extraCommaHelp)
      else if (type1 === "comma")
        throw errorInString(string, tok2.index, "Consecutive commas (empty subexpression)", extraCommaHelp)
    }

    // e. No ending commas in a subexpression
    if (type1 === "comma" && (!tok2 || (type2 === "paren" && !tok1.opening))) {
      throw errorInString(string, tok1.index, "Comma at end of " + (tok2 ? "parenthesized subexpression" : "expression"), "Perhaps remove the comma?")
    }

    // f. No random ass property accesses (after opening parens, operators, commas)
    if (type2 === "property_access") {
      if ((type1 === "paren" && tok1.opening) || !tok1 || type1 === "comma" || type1 === "operator_token")
        throw new errorInString(string, tok2.index, "Property access on nothing", "Perhaps remove the property access, or have it access some value?")
    }
  }, true)

  // Step 3: Collapse parenthesized expressions into their own nodes, keeping track of the paren types and indices.
  // The way we do this is iterate over the tokens, keeping track of each pID's location. When we come across a closing
  // paren, we look up the location of its corresponding starting paren and collapse the tokens in between into a node
  // of the form {type: "node", parenType: "(" or "[" or "|", index, endIndex, children: [ ... tokens ... ]}. The
  // tokens should be balanced, so we shouldn't encounter anything squirrely.

  // new Array of tokens (transformed from the original tokens)
  const newTokens = []

  // Map of pIDs -> indexes in newTokens, aka the index of where that paren pair starts
  const startingParenLocations = new Map()

  for (let i = 0; i < tokens.length; ++i) {
    const token = tokens[i]

    // For each paren token
    if (token.type === "paren") {
      const pID = token.pID

      if (token.opening) {
        // Record information about this opening parenthesis in newTokens. ntIndex is the location in newTokens of the
        // first node of this subexpression. tIndex is the location in tokens of the opening parenthesis.
        startingParenLocations.set(pID, {ntIndex: newTokens.length, tIndex: i})
      } else {
        // Information about the corresponding opening parenthesis
        const cLoc = startingParenLocations.get(pID)

        if (!cLoc) // should never happen, but just in case...
          throw errorInString(string, token.index, "Unbalanced parenthesis/brackets/vertical bars")

        // The index, in newTokens, of the first node of this subexpression
        const ntIndex = cLoc.ntIndex

        // The starting paren
        const startingToken = tokens[cLoc.tIndex]

        // Tokens to put into the newly generated node
        const tokensBetween = newTokens.slice(ntIndex)

        const node = {
          type: "node",
          parenType: startingToken.paren,
          index: startingToken.index,
          endIndex: token.index,
          children: tokensBetween
        }

        // Remove the old tokens/nodes that we are parenthesizing
        newTokens.splice(newTokens.length - tokensBetween.length)

        // Add the node to newTokens
        newTokens.push(node)

        // Remove the tracking of this pID from Map
        startingParenLocations.delete(pID)
      }
    } else {
      newTokens.push(token)
    }
  }

  // The root node, aka what we will henceforth operate on
  const rootNode = {type: "node", children: newTokens, parenType: "", index: newTokens[0].index}

  // Step 4: Convert | ... | into abs( ... ). This will mean a node of the form {type: "function", name: "abs",
  // parenInfo: {startIndex, endIndex, verticalBar: true}, index: (index of first bar), children: []}. Note that an abs function
  // declaration will not have a verticalBarInfo property.
  applyToNodesRecursively(rootNode, node => {
    const children = node.children
    if (!children)
      return

    for (let i = 0; i < children.length; ++i) {
      const child = children[i]

      if (child.type === "node" && child.parenType === '|') {
        // If we have a | ... | node...

        children[i] = {
          type: "function",
          name: "abs",
          parenInfo: {
            startIndex: child.index,
            endIndex: child.endIndex,
            verticalBar: true
          },
          index: child.index,
          endIndex: child.endIndex,
          children: child.children
        }
      }
    }
  }, false, false, true)

  // Step 5: Process functions.
  // a. We look for token pairs of the form  <function_token> <node> and replace the pair with a single node of the form
  // {type: "function", name: (function name), index: (index of fn name), children: [ ... children of node ... ]}
  // We apply it to children first because that makes more sense
  applyToNodesRecursively(rootNode, node => {
    const children = node.children
    if (!children || !children.some(child => child.type === "function_token"))
    // If the children contains no function, we can just chug along
      return

    const newChildren = [] // array to replace node.children with

    // Look for pairs of the form <function> <node>
    pairwise(children, (e1, e2, _, skipNextPair) => {
      if (!e1)
        return

      const type1 = e1?.type
      const type2 = e2?.type

      if (type1 === "function_token") {
        if (type2 !== "node") { // This shouldn't ever happen, but just in case...
          throw errorInString(string, e1.index, "Function declaration without corresponding arguments in parentheses",
            "Note: Add () after the function declaration to make this a proper function call.")
        }

        // New function node
        const newNode = {
          type: "function",
          name: e1.name,
          parenInfo: {
            startIndex: e2.index,
            endIndex: e2.endIndex,
            verticalBar: false
          },
          index: e1.index,
          endIndex: e2.endIndex,
          children: e2.children
        }

        newChildren.push(newNode)
        skipNextPair() // We want to consume the two tokens, so we skip to the next pair
      } else {
        newChildren.push(e1)
      }
    }, true)

    node.children = newChildren
  }, true, false, true)

  // 5b. Process function arguments by taking the tokens in each function's children list and splitting them by the
  // comma token into separate nodes.
  applyToNodesRecursively(rootNode, node => {
    const children = node.children
    if (!children)
      return

    for (let i = 0; i < children.length; ++i) {
      const child = children[i]

      // Process function arguments
      if (child.type === "function") {
        child.children = processFunctionArguments(child.children)
      }
    }
  }, false, false, true)

  // 5c: Parenthesized expressions cannot be empty or contain commas
  applyToNodesRecursively(rootNode, node => {
    if (node.type === "node") {
      const subchildren = node.children

      let issue = 0    // enum: 1 means empty parenthesized subexpression, 0 means subexpression with comma
      let offendingCommaOperator = -1

      if (subchildren.length === 0) {
        issue = 1
      } else {
        offendingCommaOperator = subchildren.find(child => child.type === "comma")

        if (!offendingCommaOperator)
          return
      }
      // If we get here in execution, this is an error

      const expressionDesc = (node === rootNode) ? "expression" : "parenthesized subexpression"

      let errorMsg = issue ? ("Empty " + expressionDesc) : (capitalizeFirstLetter(expressionDesc) + " containing a comma")
      let tokI = findTokenIndex(node.parenInfo?.startIndex)

      if (tokI > 0) { // means the token was found and is not the first token in the string
        const prevToken = tokens[tokI - 1]

        // ppTokenI is the index of the likely culprit token. If implicit multiplication is turned on, it will be tokI - 2
        let ppTokenI = tokI - 1
        let implicitLikely = false

        switch (prevToken.type) {
          case "operator_token":
            if (prevToken.implicit) { // aha, implicit multiplication
              ppTokenI = tokI - 2
              implicitLikely = true
            }
          case "variable": // aha, implicit multiplication is probably turned off and they intended a function call
            const prevprevToken = tokens[ppTokenI]

            if (prevprevToken?.type === "variable") { // Yes!
              throw errorInString(string, tokI, errorMsg, "Note: It looks like you intended to evaluate the function " + prevprevToken.name +
                ", but because there was whitespace between the function name and the function's arguments, it was parsed as " +
                nodeToString(children.slice(i - 1 - implicitLikely, i + 1)) + "." +
                getErrorInStringMessage(string, getEndingIndex(prevprevToken) + 1, "\nNote: Consider removing this whitespace", ""))
            }

            break
          default:
            break
        }
      }

      if (tokI && offendingCommaOperator) {
        errorMsg = getErrorInStringMessage(string, tokI, errorMsg, "Note: Comma")
        tokI = offendingCommaOperator.index
      }

      throw errorInString(string, tokI, errorMsg, issue ? "Note: Perhaps put an expression inside?" :
        "Note: Perhaps remove the comma? Grapheme does not have the concept of a comma operator; commas are only valid in function calls.")
    }
  }, false, false, true)

  // Step 6: Process property accesses from right to left.
  // Property accesses are abstracted as {type: "operator", op: ".", children: [ obj, string: prop ]}.
  applyToNodesRecursively(rootNode, node => {
    const children = node.children

    // Early exit condition; if there are no children or no property accesses, continue
    if (!children || !children.some(child => child.type === "property_access"))
      return

    const newChildren = []

    // For each pair of children
    for (let i = -1; i < children.length - 1; ++i) {
      const c1 = children[i]
      const c2 = children[i + 1]

      // If c2 is not a property access, just push it
      if (c2.type !== "property_access") {
        newChildren.push(c2)
        continue
      }

      if (!c1) // Should never happen
        throw errorInString(string, c2.index, "Property access on nothing", "Perhaps remove the property access, or have it access some value?")

      const lastChild = newChildren.pop()  // pop c1. In the case of chained accesses it might be a property access

      // Add the property access operation
      newChildren.push({
        type: "operator",
        op: '.',
        children: [
          lastChild,
          // the property is converted to a string
          {
            type: "string",
            contents: c2.prop,
            index: c2.index + 1,
            endIndex: c2.index + c2.prop.length,
            src: "property_access"
          }
        ]
      })
    }

    node.children = newChildren
  }, false, false, true)

  function checkOperandValid(operator, other, type) {
    if (!checkIfValidOperand(other)) {
      throw errorInString(string, operator.index, `Can't process ${type} operator ${operator.op} on node "${nodeToString(other)}"`,
        getErrorInStringMessage(string, other.index, "Note: Operating on node"))
    }
  }

  // Array storing a list of passes for doit() to run. Each element is of the form { ops: { binaries: [...], unaries:
  // [...], postfixes: [...] }, rtl: (boolean) }.
  let operatorPasses

  function doIt() {
    applyToNodesRecursively(rootNode, node => {
      const children = node.children

      if (!children || !children.some(child => child.type === "operator_token")) // no operators here, continue
        return

      for (const opPass of operatorPasses) {
        const {ops, rtl} = opPass
        const {unaries = [], binaries = [], postfixes = []} = ops

        // Note 1 to self: if there is ever a unary operator evaluated LTR or a postfix operator evaluated RTL, the code
        // will have to modified slightly to correspond with the index changes. As it is, coincidentally, only binary ops
        // need the index i to be adjusted in replaceWith.
        // Note 2 to self: This is inefficient for large inputs because .splice is O(n). Ideally this should be
        // reimplemented in another way.
        triplewise(children, (e1, e2, e3, index, replaceWith) => {
          if (e2.type === "operator_token") { // What we are actually concerned about
            if (binaries.includes(e2.op)) {
              // Verify that this is indeed a binary operator. This is true if both sides satisfy checkIfValidOperand
              checkOperandValid(e2, e1, "binary")
              checkOperandValid(e2, e3, "binary")

              e2.type = "operator"
              e2.children = [e1, e3]

              replaceWith([e2])
            } else if (unaries.includes(e2.op)) {
              // Verify that this is indeed a unary operator. This is true if e1 is falsy or an operator.

              if (!e1 || e1.type === "operator_token" || e1.type === "operator") {
                checkOperandValid(e2, e3, "unary")

                e2.type = "operator"
                e2.children = [e3]

                replaceWith([e1, e2])
              }
            } else if (postfixes.includes(e2.op)) {
              // Verify that this is indeed a postfix operator. This is true if e3 is falsy or an operator.

              if (!e3 || e3.type === "operator_token" || e3.type === "operator") {
                checkOperandValid(e2, e1, "postfix")

                e2.type = "operator"
                e2.children = [e1]

                replaceWith(e3 ? [e2, e3] : [e2])
              }
            }
          }
        }, true, rtl)
      }
    }, true)
  }

  // Step 7: Process operators recursively.
  // 7a-e. Process non-boolean operators
  operatorPasses = firstOperatorPass
  doIt()

  // 7f. Chained comparison operators -> cchain
  // To find cchain nodes, we search through the nodes and greedily look for node patterns like
  // [non op] boolean op [non op] boolean op [non op] ... . Once the largest such pattern has been matched,
  // we collapse it to a single cchain node. cchain has the following signature:
  // { type: "operator", index, endIndex, children: [ e1, string, e2, ... ], implicit: false }
  // Because there are no other operators at this stage, the entirety of the node must be a cchain for it to be valid.
  // Thus, we can quickly eliminate most nodes from consideration by checking if their length is >= 5 and is odd.
  applyToNodesRecursively(rootNode, node => {
    const children = node.children

    // This means the node can't be a cchain
    if (!children || children.length < 5 || children.length % 2 === 0)
      return

    for (let i = 0; i < children.length; ++i) {
      const child = children[i]
      const parity = i % 2 === 0  // if true, it should be a non-operator. if false, it should be a boolean operator

      const isOperator = child.type === "operator_token" || child.type === "operator"

      if (parity === isOperator)
        return
    }

    // If we got here, this is a cchain!

    // Convert the node to a cchain
    node.type = "operator"
    node.op = "cchain"
    delete node.parenType
    node.implicit = false

    // Convert the boolean ops to strings
    for (let i = 1; i < children.length; i += 2) {
      const opNode = children[i]

      children[i] = {
        type: "string",
        contents: opNode.op,
        index: opNode.index,
        endIndex: opNode.index + opNode.op.length - 1,
        src: "operator"
      }
    }
  }, false, false, true)

  // 7g. Comparison operators (==, !=, <, >, <=, >=), in the same pass, from left to right
  operatorPasses = secondOperatorPass
  doIt()

  // 8. Make sure there are no residual tokens
  applyToNodesRecursively(rootNode, node => {
    switch (node.type) {
      case "comma":
      case "paren":
      case "function_token":
      case "operator_token":
      case "property_access":
        throw errorInString(string, node.index, "Unprocessed token", "This error should never happen; please contact timothy.herchen@gmail.com or open up an issue on GitHub with the stack trace.")
    }
  }, false, false, false)

  // Step 9: Provide index and endIndex information for all nodes
  applyToNodesRecursively(rootNode, node => {
    if (node.index === undefined) {
      node.index = getStartingIndex(node)
    } else if (node.endIndex === undefined) {
      node.endIndex = getEndingIndex(node)
    }
  }, true)

  return rootNode
}

export {applyToNodesRecursively, parseString}
