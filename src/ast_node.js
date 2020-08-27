import {applyToNodesRecursively} from "./traverse_nodes"
import {ParserError} from "./parser_error"
import {parseString} from "./parse_string"
import {RealFunctions} from "./real_functions"

// List of valid compilation modes (prone to expand): "double", "interval", "arbitrary"

// For testing. The full set will be used when I merge this into the main repo
const GraphemeSubset = {
  RealFunctions
}

/**
 * Given a function name, like IntervalFunctions.Add, RealFunctions.Multiply, etc. to look up in GraphemeSubset. Throws
 * if the dependency is not found.
 * @param funcName
 */
function resolveDependency(funcName) {

}


/**
 * Abstraction of a node in a Grapheme expression. This is the base class; there are a variety of node types which
 * derive from this class. All classes should support a clone() function, toJSON() function,
 *
 * Fields common:
 *   children: null | Array. children is null if the node has no children to save memory (about 40 bytes / childless
 *   node). To make things easier, ASTNode provides a getChildren() function
 *   token?: the corresponding node from the parser, with its children property removed to save on memory
 *   This field is optional; in generated nodes, this may not be defined at all.
 */
class ASTNode {
  constructor() {
    this.children = null
    this.token = null
  }

  /**
   * Append node to this node's children
   * @param node
   */
  addChild(node) {
    const children = this.children

    if (children)
      children.push(node)
    else
      this.children = [node]
  }

  /**
   * Get this node's children. Accessing node.children is not a good idea.
   * @returns {Array}
   */
  getChildren() {
    return this.children || []
  }

  nodeType() {
    return "node"
  }

  compile(compilationMode="double") {
    // When we compile a node, we create the source code of a JS function which will return the value of the node.
    // If we wish to compile a node as a function of variables, say x and y, we need to create an ArrowFunctionNode
    // which contains the parameters x and y as arguments and the return value as its child node. Then, when the JS
    // function is run, it will return another JS function (in the spirit of a closure) which can be used after.
    // To the end of generating this source code correctly and without the possibility of eval() type insecurities, only
    // a limited number of operations can be done by the children of this node to modify/add to the source code. These
    // are:
    // getUnusedName()
    // setVariable(name, string)
    // setVariableToFunctionEvaluation(name, functionName (string), arguments (Array of string arguments)) (preferred)
    // requestDependency(funcName), something like IntervalFunctions.Add or RealFunctions.Multiply
    // requestGlobalVariable(varName), something like "cow::a" or "my_namespace::chicken::feet", returning a string
    //   which can be used for that global variable

    let sourceCode = ""

    // Id for variables
    let nameId = 0

    function getUnusedName() {
      return "$" + (nameId++)
    }

    function setVariable(name, string) {
      sourceCode += `${name} = ${string};\n`
    }

    function setVariableToFunctionEvaluation(name, funcName, args) {
      sourceCode += `${name} = ${funcName}(${args.join(', ')});`
    }

    const dependencies = {}

    function getDependency(funcName) {
      let name = dependencies[funcName]

      if (name)
        return name

      name = dependencies[funcName] = getUnusedName() + "_func"

      setVariable(name, resolveDependency(funcName))
    }

    function requestDependency(funcName) {
      // Remove whitespace, so the function is unambiguous
      funcName = funcName.replace(/\s+/g, "")

      return getDependency(funcName)
    }

    function requestGlobalVariable() {

    }

    const compileInfo = {
      getUnusedName,
      setVariable,
      compilationMode
    }


  }
}

class ConstantNode extends ASTNode {
  constructor({ value }) {
    super()

    this.value = value
  }

  nodeType() {
    return "constant"
  }
}

class NumberNode extends ConstantNode {
  constructor(opts = {}) {
    super(opts)
  }

  nodeType() {
    return "number"
  }
}

class StringNode extends ConstantNode {
  constructor({ contents, quote }) {
    super()

    this.value = contents
    this.quote = quote
  }

  nodeType() {
    return "string"
  }
}

class OperatorNode extends ASTNode {
  constructor({ op, implicit }) {
    super()

    this.op = op
    this.implicit = implicit
  }

  nodeType() {
    return "operator"
  }
}

class FunctionNode extends OperatorNode {
  constructor({ name, implicit = false }) {
    super({op: name, implicit})

    this.name = name
  }

  nodeType() {
    return "function"
  }
}

class ArrowFunctionNode extends ASTNode {
  nodeType() {
    return "arrow_function"
  }
}

class GroupingNode extends ASTNode {
  constructor({ parenType }) {
    super()

    this.parenType = parenType
  }

  nodeType() {
    return "group"
  }
}

class VariableNode extends ASTNode {
  constructor({ name }) {
    super()

    this.name = name
  }

  nodeType() {
    return "variable"
  }
}

const typeClassMap = {
  number: NumberNode,
  string: StringNode,
  variable: VariableNode,
  node: GroupingNode,
  function: FunctionNode,
  operator: OperatorNode,
  arrow_function: ArrowFunctionNode
}

function constructNodeFromObj(obj) {
  const constructor = typeClassMap[obj.type]
  if (!constructor) {
    throw new ParserError("Huh? Can't convert token of type " + obj.type)
  }

  const node = new constructor(obj)

  node.token = obj

  return node
}

/**
 * Convert the result of parseString (or similar) to an ASTNode. Modifies each node's "node" property, then deletes it.
 * Also deletes each node's children property.
 * @param parsedObj
 */
function objectToNode(parsedObj) {
  let ret

  applyToNodesRecursively(parsedObj, (child, parent) => {
    const node = constructNodeFromObj(child)

    child.node = node

    if (!parent)
      ret = node
    else
      parent.node.addChild(node)
  })

  applyToNodesRecursively(parsedObj, (child) => {
    delete child.children
    delete child.node
  }, true)

  return ret
}

function parseNode(string, options={}) {
  return objectToNode(parseString(string, options))
}

function parseExpression(string, options={}) {
  const node = parseNode(string, options)

  return new Expression(string, node)
}

export class Expression {
  constructor(string, rootNode) {
    this.string = string

    if (!rootNode)
      rootNode = parseNode(string)

    this.rootNode = rootNode
  }

  static from(string, options={}) {
    switch (typeof string) {
      case "number":
      case "boolean":
      case "bigint":
        throw new TypeError("unimplemented")
      case "string":
        return parseExpression(string, options)
      case "object":
        return objectToNode(string)
      default:
        throw new TypeError("Invalid provided type")
    }
  }
}
