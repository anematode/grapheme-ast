import {applyToNodesRecursively} from "./traverse_nodes"
import {ParserError} from "./parser_error"

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
}

class ConstantNode extends ASTNode {
  constructor() {
    super()

    this.value = undefined
  }

  setValue(v) {
    this.value = v
  }

  nodeType() {
    return "constant"
  }
}

class NumberNode extends ConstantNode {
  constructor({ value }) {
    super()

    this.value = value
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
  constructor({ name, op, implicit }) {
    super({op, implicit})

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

export class Expression {
  constructor(string, rootNode) {
    this.string = string
    this.rootNode = rootNode
  }
}

/**
 * Convert the result of parseString (or similar) to an ASTNode. Modifies each node's "node" property, then deletes it.
 * Also deletes each node's children property.
 * @param parsedObj
 */
export function objectToNode(parsedObj) {
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
