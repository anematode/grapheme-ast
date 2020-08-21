import {isFunction} from "./parser_error"

/**
 * Error raised if a cycle is detected
 */
class CyclicalError extends Error {
}

/**
 * Recurse through the children of a node and call func for each node. Note that this doesn't actually use recursion,
 * which means it can handle deeply nested expressions which would otherwise overflow the stack. Huzzah! Note that if
 * you give this function an object with cyclical references, it will get pissed and crash (but only after gobbling up
 * all of your memory). You can avoid this by setting checkCycles=true, which will throw an error if a cycle is detected.
 * The depth of recursion is given by depth, which defaults to Infinity.
 * @param topNode
 * @param func {Function} Signature is (node, parent, depth)
 * @param childrenFirst {boolean} Whether to call func on children first or the upper node first
 * @param rtl {boolean} Whether to call func on children from right to left or left to right
 * @param onlyNodesWithChildren {boolean} If true, only call func on nodes that have children
 * @param depth {Number}
 * @param checkCycles {boolean}
 */
export function applyToNodesRecursively(topNode, func, childrenFirst = false, rtl = false, onlyNodesWithChildren = false, depth = Infinity, checkCycles = false) {
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

  // Forward node to func if func has two arguments, meaning (node, parent)
  function forwardToFunc2(node, parent) {
    func(node, parent)
  }

  // Forward node to func if func has three arguments, meaning (node, parent, depth)
  function forwardToFunc3(node, parent) {
    func(node, parent, nodeStack.length - 1)
  }

  const forwardCallback = (func.length <= 1) ? func : ((func.length === 2) ? forwardToFunc2 : forwardToFunc3)

  // If childrenFirst is false, we need to explicitly call func on the top node, since it won't be called in the main loop
  if (!childrenFirst)
    forwardCallback(topNode, null)

  let currentNode

  // The main loop of the iteration. We break out of it once the stack is empty. The first time in a while I've used a
  // label. Send your "bad practice" complaints to /dev/null or certainlynotasheep@gmail.com.
  // noinspection JSAssignmentUsedAsCondition (To appease Monseigneur Harvey Webstorm)
  main: while (currentNode = peek()) { // While there is a node whose children we must iterate over...
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
            forwardCallback(child, currentNode)
        } else {
          // Check for cycles
          if (checkCycles && nodeStack.some(node => node === child))
            throw new CyclicalError("Object contains a cycle!")

          // child needs to be traversed because it has at least one child.
          // Update the index of currentNode in the stack.
          setIndex(i + (rtl ? -1 : 1))

          // If childrenFirst is false, call func
          if (!childrenFirst)
            forwardCallback(child, currentNode)

          // Add this child to the list
          nodeStack.push(child)
          nodeChildIndexStack.push(rtl ? child.children.length - 1 : 0)

          // Continue the main loop with the new child
          continue main
        }
      }
    }

    // Call func on the current node.
    if (childrenFirst)
      forwardCallback(currentNode, null)

    // Pop the last values in the stack, starting iteration at the parent
    nodeStack.pop()
    nodeChildIndexStack.pop()
  } // main
}
