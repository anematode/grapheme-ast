import {TypeDefinition} from "./type_definition"
import {Type} from "./type"

function checkValidNoArgs(typename) {
  return function(args) {
    if (args.length === 0)
      return

    throw new TypeError(typename + " should not have template parameters, but found definition " + new Type(typename, args).toString())
  }
}

/**
 * Type definition for a class abstracting a real number on the extended number line.
 *
 * @type {TypeDefinition}
 */
const real = new TypeDefinition({
  name: "real",
  checkValid: type => {

  }
})
