
// What is a variable? A variable is a thing that is stored in Variables. It is stored as any other
// expression, except it also has an associated name (and namespace).
// The variable var, if defined in the global namespace, is stored in Variables.var. ::var resolves unambiguously to
// this var, no matter the current namespace. Now, my_namespace::var will be stored in Variables["my_namespace::var"].
// ::my_namespace::sub::var will be stored in Variables["my_namespace::sub::var"], et cetera. This leads to an
// unambiguous reference for each variable.


const Variables = {}

export { Variables }
