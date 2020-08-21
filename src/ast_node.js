import {applyToNodesRecursively} from "./traverse_nodes"

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
  nodeType() {
    return "number"
  }
}

class StringNode extends ConstantNode {
  nodeType() {
    return "string"
  }
}

class OperatorNode extends ASTNode {
  nodeType() {
    return "operator"
  }
}

class FunctionNode extends OperatorNode {
  nodeType() {
    return "function"
  }
}

class ArrowFunctionNode extends ASTNode {
  nodeType() {
    return "arrow_function"
  }
}


function constructNodeFromObj(obj) {
  switch (obj.type) {
    case "number": {
      const node = new NumberNode()

      node.token = obj
      node.value = obj.value

      
    }
    case "string":

    case "node":

    case "function":

    case "operator":

    case "arrow_function":
  }
}

/**
 * Convert the result of parseString (or similar) to an ASTNode. Modifies each node's "node" property, then deletes it.
 * Also deletes each node's children property.
 * @param parsedObj
 */
function objectToNode(parsedObj) {
  applyToNodesRecursively(parsedObj, (child, _, parent) => {
    const node = constructNodeFromObj(child)

    child.node = node

    parent.node.addChild(node)
  })

  applyToNodesRecursively(parsedObj, (child) => {
    delete child.children
    delete child.node
  })
}
