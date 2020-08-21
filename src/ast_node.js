/**
 * Abstraction of a node in a Grapheme expression. This is the base class; there are a variety of node types which
 * derive from this class. All classes should support a clone() function, toJSON() function,
 *
 * Fields common:
 *   children: null | Array. children is null if the node has no children to save memory (about 40 bytes / childless
 *   node). To make things easier, ASTNode provides a getChildren() function
 *   token?: the token object, with its children property removed to save on memory. This field is optional; in generated
 *   nodes, this may not be defined at all.
 */
class ASTNode {

}
