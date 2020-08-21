import {expressionTokenizer} from "./expression_tokenizer.js"
import {errorInString, getErrorInStringMessage, ParserError} from "./parser_error.js"
import {applyToNodesRecursively} from "./traverse_nodes"

/**
 * Apply a function func to all pairs of an array
 * @param arr {Array}
 * @param func {Function} Signature is (elem1, elem2, elem1index, skipNextPair)
 * @param includeEnds {boolean} Whether to call func with the additional calls (undefined, first), (last, undefined)
 * @param rtl {boolean} Whether to iterate right to left
 */
function pairwise(arr, func, includeEnds = true, rtl = false) {
  const top = arr.length + includeEnds - 2
  const bottom = -includeEnds

  let i = rtl ? top : bottom

  // Callback used when we want to skip the next pair (e.g. when we are collapsing functions)
  function skipNextPair() {
    rtl ? --i : ++i
  }

  for (; rtl ? (i >= bottom) : (i <= top); skipNextPair()) {
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

  /**
   * Function that might be called by func. Calling it with an array will replace the elements between i-1 and i+1,
   * inclusive, with a subarray. This could definitely be optimized a lot.
   * @param subarr {Array}
   */
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

  // i is the index of the middle element. Iterate either LTR or RTL
  for (; rtl ? (i >= lower) : (i <= arr.length - lower - 1); rtl ? (--i) : (++i)) {
    func(arr[i - 1], arr[i], arr[i + 1], i, replaceWith)
  }
}

/**
 * Checks if str is a simple variable, i.e. matches the form [A-Za-z_][A-Za-z0-9_]*
 * @param str
 */
function isSimpleVariable(str) {
  return !!/[A-Za-z_][A-Za-z0-9_]*/.exec(str)
}

/**
 * Return an error for when an arrow function with ambiguous arguments is given
 * @param typeAnnotation
 * @returns {string}
 */
function getDisallowedArrowFunctionArgErr(typeAnnotation) {
  const varName = typeAnnotation.children[0]
  const typename = typeAnnotation.children[1]

  return `Note: Arrow function arguments of the form \"${varName}: ${typename} -> ...\" are ` +
    `disallowed because of potential ambiguity. Make it explicit with \"(${varName}): ${typename} -> ...\" or \"(${varName}: ${typename}) -> ...\".`
}

/**
 * Throw an error if the node is too deep
 * @param root {Object}
 * @param maxDepth {number}
 */
function checkExprDepth(root, maxDepth) {
  applyToNodesRecursively(root, (_node, _parent, depth) => {
    if (depth > maxDepth)
      throw new ParserError("Expression is too deeply nested! Max depth of " + maxDepth + " exceeded." +
        "\nNote: The max expression depth can be raised, and is in fact Infinity by default.")
  })
}

/**
 * Takes in a string and args node and returns an arguments node. This node has the following form:
 * {type: "arrow_signature", index: (start index), endIndex: (end index), vars: (array of var tokens), types: (array of type tokens,
 * implicit: true if assumed), returnType: (type token, implicit: true if assumed)}
 * @param string
 * @param args
 */
function processArrowFunctionSignature(string, args) {
  /**
   * Get implicit return type node
   * @returns {{implicit: boolean, endIndex: number, index: number, type: string, typename: string}}
   */
  function getImplicitTypeInfo() {
    const argsEnd = getEndingIndex(args)
    return {
      index: argsEnd + 1,
      endIndex: argsEnd + 1,
      type: "typename",
      typename: "real",
      implicit: true
    }
  }

  switch (args.type) {
    // The simplest case, where all types are assumed
    case "variable": {
      const typeInfo = getImplicitTypeInfo()

      return {
        type: "arrow_signature",
        index: args.index,
        endIndex: typeInfo.index - 1,
        vars: [args],
        types: [typeInfo],  // type of variable is implicitly real
        returnType: null // Unknown return type, must be figured out later
      }
    }
    // The case  (... arguments ...): type -> ...
    case "type_annotation":
      const realArgs = args.children[0]

      if (realArgs.type !== "node") {
        // Special note for the case  x: type -> ..., which is disallowed due to ambiguity
        const note = realArgs.type === "variable" ? getDisallowedArrowFunctionArgErr(args) : ""
        throw errorInString(string, realArgs.index, "Invalid argument list", note)
      }

      const ret = processArrowFunctionSignature(string, realArgs)
      const returnType = ret.returnType = args.children[1]

      returnType.endIndex = getEndingIndex(returnType)

      return ret
    case "node": {
      const vars = []
      const types = []

      // Iterate through arguments and add them to vars/types
      for (const item of args.children) {
        if (item.type === "typename")
          throw errorInString(string, item.index, "Unexpected typename in arrow function arguments")
        else if (item.type === "node")
          throw errorInString(string, item.index, "Unexpected subexpression in arrow function arguments")
        else if (item.type === "colon")
          throw errorInString(string, item.index, "Unexpected colon in arrow function arguments")
        else if (item.type === "comma") {
        }
        // Commas aren't processed, so we can just ignore it
        else if (item.type === "variable") {
          // If type is variable, assume the variable is real

          // Make sure the variable has a valid name
          if (!isSimpleVariable(item.name))
            throw errorInString(string, item.index, "Arguments to an arrow function cannot be namespaced")

          vars.push(item)
          const endingIndex = getEndingIndex(item) + 1
          const implicitType = {
            index: endingIndex,
            endIndex: endingIndex,
            implicit: true,
            type: "typename",
            typename: "real"
          }

          types.push(implicitType)
        } else if (item.type === "type_annotation") {
          const variable = item.children[0], type = item.children[1]

          // Make sure the variable has a valid name
          if (!isSimpleVariable(variable.name))
            throw errorInString(string, item.index, "Arguments to an arrow function cannot be namespaced")

          vars.push(variable)
          types.push(type)
        } else {
          throw errorInString(string, item.index, "Unexpected token in arrow function arguments")
        }
      }

      // Calculate ending indices, since this won't be done elsewhere
      vars.forEach(variable => variable.endIndex = getEndingIndex(variable))

      return {
        type: "arrow_signature",
        index: args.index,
        endIndex: getEndingIndex(args),
        returnType: null,  // No known return type (yet)
        vars,
        types
      }
    }
    default:
      throw errorInString(string, args.index, "Invalid arrow function arguments")
  }
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
 *   arrow_function
 *
 *   type_annotation
 */

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
    case "type_annotation":
      return `${nodeToString(node.children[0])}: ${nodeToString(node.children[1])}`
    case "arrow_function":
      return `${nodeToString(node.arguments)} -> ${nodeToString(node.children)}`
    case "arrow_signature":
      return `(${node.vars.map((v, i) => nodeToString(v) + ': ' + nodeToString(node.types[i])).join(', ')}): ${nodeToString(node.returnType)}`
    case "typename":
      return node.typename
    case "operator_token":
      return node.op
    case "property_access":
      return '.' + node.prop
    case "paren":
      return node.paren
    case "string":
      const quote = (string.quote === 1) ? "'" : ((string.quote === 0) ? '"' : '')
      return `${quote}${string.contents}${quote}`
    case "arrow_function_token":
      return "->"
    case "colon":
      return ":"
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
    node = {children: node}

  // If the node has children, find the last child's ending index
  if (node.children)
    return getEndingIndex(node.children[node.children.length - 1])

  // Cases for various node types, calculating the endIndex based on the node
  switch (node.type) {
    // Nodes with length 1 have endIndex == index
    case "comma":
    case "paren":
    case "colon":
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
    case "typename":
      return node.index + node.typename.length - 1
    case "arrow_function_token":
      return node.index + 1
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
    case "arrow_function_token":
    case "colon":
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
function parseString(string, options = {}) {
  // The parsing steps are as follows:
  // 1. Tokenize (this includes checking for balanced parens)
  // 2. Check certain common token patterns that will certainly lead to errors later
  //   a. operator followed by non-unary operator or closing parenthesis
  //   b. unary operator or opening parenthesis followed by non-unary operator
  // 3. Collapse parenthesized expressions into subnodes, recursively, keeping track of the paren types
  // 4. Convert | ... | into abs( ... )
  // 5. Process functions: convert f(node) into f{node.split(comma)}
  // 6. Process property accesses from right to left
  // 7. Process type annotations
  // 8. Process operators recursively
  //   a. Double factorials and factorials, in the same pass, from left to right
  //   b. Exponentiation and unary minus/plus, in the same pass, from right to left
  //   c. Multiplication and division, in the same pass, from left to right
  //   d. Addition and subtraction, in the same pass, from left to right
  //   e. and and or, in the same pass, from left to right
  //   f. Chained comparison operators -> cchain
  //   g. Comparison operators (==, !=, <, >, <=, >=), in the same pass, from left to right
  // 9. Process arrow functions into nodes of the form { type: "arrow_function", signature: (arrow_signature node), children:
  //   [ ... single item, the return value of the function ... ] }
  // 10. Check for spurious commas or empty subexpressions
  // 11. Check for unprocessed tokens
  // 12. Add index / endIndex information to all nodes
  // 13. (optional) Party!

  // Default opts
  options = Object.assign({
    implicitMultiplication: true,
    maxTemplateDepth: expressionTokenizer.DEFAULT_MAX_TEMPLATE_DEPTH, // 16 by default
    maxExpressionDepth: Infinity
  }, options)

  // Step 1
  const tokens = expressionTokenizer(string, options)

  // If there are no tokens, return null
  if (tokens.length === 0)
    return null

  /**
   * Given an index in the string, find the index in tokens of the token with that index
   * @param index
   * @returns {number}
   */
  function findTokenIndexByIndex(index) {
    return tokens.findIndex(tok => tok.index === index)
  }

  // Some common help messages
  const startingOperatorHelp = "Note: Perhaps remove the operator, or add a value after the operator?"
  const trailingOperatorHelp = "Note: Perhaps remove the operator, or add a value before the operator?"
  const extraCommaHelp = "Note: Perhaps remove the comma? Note that Grapheme does not have default arguments; extraneous commas cannot be used to omit a function argument."
  const dumbPropertyAccess = "Note: Perhaps remove the property access, or have it access some value?"

  // Step 2: check common errors
  pairwise(tokens, (tok1, tok2) => {
    // Types of each token
    const type1 = tok1?.type
    const type2 = tok2?.type

    // a. Check for operators followed by non-unary operators or closing parenthesis
    if (type1 === "operator_token") {
      if (type2 === "operator_token") {
        if (!couldBePrefixOp(tok2.op))
          throw errorInString(string, tok2.index, "Operator followed by non-unary operator", "Note: Perhaps remove one of the operators?")
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
      throw errorInString(string, tok1.index, "Comma at end of " + (tok2 ? "parenthesized subexpression" : "expression"), "Note: Perhaps remove the comma?")
    }

    // f. No random ass property accesses (after opening parens, operators, commas)
    if (type2 === "property_access") {
      if ((type1 === "paren" && tok1.opening) || !tok1 || type1 === "comma" || type1 === "operator_token")
        throw new errorInString(string, tok2.index, "Property access on nothing", dumbPropertyAccess)
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
  // parenInfo: {startIndex, endIndex, verticalBar: true}, index: (index of first bar), children: []}. Note that an abs
  // function declaration will not have parenInfo.verticalBar, distinguishing it from | ... |.
  applyToNodesRecursively(rootNode, node => {
    const children = node.children

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
  // We look for token pairs of the form  <function_token> <node> and replace the pair with a single node of the form
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
            "Note: Add \"()\" after the function declaration to make this a proper function call.")
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
          children: processFunctionArguments(e2.children)
        }

        newChildren.push(newNode)
        skipNextPair() // We want to consume the two tokens, so we skip to the next pair
      } else {
        newChildren.push(e1)
      }
    }, true)

    node.children = newChildren
  }, true, false, true)

  // Step 6: Process property accesses from right to left.
  // Property accesses are abstracted as {type: "operator", op: ".", children: [ obj, string: prop ]}.
  applyToNodesRecursively(rootNode, node => {
    const children = node.children

    // Early exit condition; if there are no children or no property accesses, continue
    if (!children.some(child => child.type === "property_access"))
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
        throw errorInString(string, c2.index, "Property access on nothing", dumbPropertyAccess)

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

  // Step 7: Convert triples of the form <variable> <colon> <typename> into { type: "type_annotation", children: [variable,
  // typename], index: variable.index, endIndex: getEndingIndex(typename) }
  applyToNodesRecursively(rootNode, node => {
    const children = node.children

    triplewise(children, (e1, e2, e3, _, replaceWith) => {
      if (e2.type === "colon") {
        if (!e1)
          throw errorInString(string, e2.index, "Unexpected colon")
        if (!e3)
          throw errorInString(string, e2.index, "Unexpected colon: missing typename",
            getErrorInStringMessage(string, e2.index + 1, "Note: Add typename ", "or remove the colon to assume the variable is real"))

        if (e1.type !== "variable" && e1.type !== "node")
          throw errorInString(string, e1.index, "Expected variable before colon")
        if (e3.type !== "typename")
          throw errorInString(string, e3.index, "Expected typename after colon")

        // Create the type annotation
        replaceWith([
          {
            type: "type_annotation",
            children: [e1, e3],
            index: e1.index,
            endIndex: getEndingIndex(e3)
          }
        ])
      }
    })
  }, true, false, true)

  /**
   * Throw an informative error if other is not a valid operand
   * @param operator
   * @param other
   * @param type {string} "binary" | "unary" | "postfix"
   */
  function checkOperandValid(operator, other, type) {
    if (!checkIfValidOperand(other)) {
      throw errorInString(string, operator.index, `Can't process ${type} operator ${operator.op} on node "${nodeToString(other)}"`,
        getErrorInStringMessage(string, other.index, "Note: Operating on node"))
    }
  }

  // Array storing a list of passes for doit() to run. Each element is of the form { ops: { binaries: [...], unaries:
  // [...], postfixes: [...] }, rtl: (boolean) }.
  let operatorPasses

  /**
   * Given operatorPasses, combine the requested operators in one giant pass of all nodes in the requested order
   */
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

  // Step 8: Process operators recursively.
  // 8a-e. Process non-boolean operators
  operatorPasses = firstOperatorPass
  doIt()

  // 8f. Chained comparison operators -> cchain
  // To find cchain nodes, we search through the nodes and greedily look for node patterns like
  // [non op] boolean op [non op] boolean op [non op] ... . Once the largest such pattern has been matched,
  // we collapse it to a single cchain node. cchain has the following signature:
  // { type: "operator", index, endIndex, children: [ e1, string, e2, ... ], implicit: false }
  // Because there are no other operators at this stage, the entirety of the node must be a cchain for it to be valid.
  // Thus, we can quickly eliminate most nodes from consideration by checking if their length is >= 5 and is odd.
  applyToNodesRecursively(rootNode, node => {
    const children = node.children

    // This means the node can't be a cchain
    if (children.length < 5 || children.length % 2 === 0)
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

  // 8g. Comparison operators (==, !=, <, >, <=, >=), in the same pass, from left to right
  operatorPasses = secondOperatorPass
  doIt()

  // Step 9: Process arrow functions: collapse node1 -> node2 into
  // { type: "arrow_function", index: node1.index, endIndex: node2.endIndex, arrowIndex: (index of ->), children:
  // [ node1, node2 ] }
  applyToNodesRecursively(rootNode, node => {
    const children = node.children

    if (!children.some(child => child.type === "arrow_function_token"))
      return

    triplewise(children, (e1, e2, e3, _, replaceWith) => {
      if (e2.type === "arrow_function_token") { // YUM
        if (!e1) {
          throw errorInString(string, e2.index, "Arrow function without arguments", "Note: To make an arrow function accepting no arguments, use the syntax () -> ....")
        } else if (!e3) {
          throw errorInString(string, e2.index, "Arrow function without definition", "Note: Add an expression after the arrow function.")
        }

        if (e1.type !== "node" && e1.type !== "variable" && e1.type !== "type_annotation") {
          throw errorInString(string, e1.index, "Invalid arrow function arguments",
            "Note: Arrow functions must be of the form () -> ..., (a: type, b) -> ..., (a: type, b): type -> ..., a -> ...." +
            "\nVariables without annotated types are assumed to be real.")
        }

        const args = processArrowFunctionSignature(string, e1)

        const node = {
          type: "arrow_function",
          signature: args,
          index: e1.index,
          arrowIndex: e2.index,
          endIndex: getEndingIndex(e3),
          children: [e3]
        }

        replaceWith([node])
      }
    })
  }, true, true, true)

  // Step 10: Parenthesized expressions cannot be empty or contain commas
  applyToNodesRecursively(rootNode, node => {
    if (node.type === "node") {
      const subchildren = node.children

      let issue = 0    // enum: 1 means empty parenthesized subexpression, 0 means subexpression with comma
      let offendingCommaOperator // The comma that's pissing the parser off

      if (subchildren.length === 0) {
        issue = 1
      } else {
        offendingCommaOperator = subchildren.find(child => child.type === "comma")

        if (!offendingCommaOperator)
          return
      }
      // If we get here in execution, this is an error

      const expressionDesc = (node === rootNode) ? "expression" : "parenthesized subexpression"

      let errorMsg = issue ? ("Empty " + expressionDesc) : (capitalizeFirstLetter(expressionDesc) + ", containing a comma,")

      // Index of the paren node
      let tokI = findTokenIndexByIndex(node.index)

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
          // intended fall through, now that a new value of ppTokenI and implicitLikely (maybe) is set
          case "variable": // aha! implicit multiplication is probably turned off and they intended a function call
            const prevprevToken = tokens[ppTokenI]

            if (prevprevToken?.type === "variable") { // Yes!
              throw errorInString(string, tokI, errorMsg, "Note: It looks like you intended to evaluate the function " + prevprevToken.name +
                ", but because of the whitespace between the function name and the function's arguments, it was parsed as \"" +
                nodeToString(tokens.slice(tokI - 1 - implicitLikely, tokI + 1)) + "...\" ." +
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
  }, false, false, false)

  // Step 11: Make sure there are no residual tokens
  applyToNodesRecursively(rootNode, node => {
    switch (node.type) {
      case "comma":
      case "paren":
      case "function_token":
      case "operator_token":
      case "property_access":
      case "colon":
      case "typename":
      case "arrow_function_token":
      case "type_annotation":
        throw errorInString(string, node.index, "Unprocessed token \"" + node.type + "\"", "Note: Perhaps remove the token?")
    }
  }, false, false, false)

  // Step 12: Provide index and endIndex information for all nodes
  applyToNodesRecursively(rootNode, node => {
    if (node.index === undefined) {
      node.index = getStartingIndex(node)
    } else if (node.endIndex === undefined) {
      node.endIndex = getEndingIndex(node)
    }
  }, true)

  const maxExprDepth = options.maxExpressionDepth

  if (maxExprDepth !== Infinity)
    checkExprDepth(rootNode, maxExprDepth)

  return rootNode
}

export {parseString}
