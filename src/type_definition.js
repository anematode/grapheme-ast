import {validCompilationModes} from "./compilation_mode"
import {Multifunction} from "./multifunction"

/**
 * Provides information about a given type. Should only be used internally
 */
export class TypeDefinition {
  constructor(params={}) {
    // Parameters:
    // name (string): The name of the type. e.g. "complex", "real", "list"
    // checkValid (Function -> Function): A function; when passed the template arguments of the type, it will return another
    // function which, when called with the Type instance, checks whether it is valid. This returned fn does NOT have the
    // responsibility of checking whether its child types are valid.
    // isInstance: Fn returning Multifunction that checks whether an object is a valid instance of this type. Note that this will include conventional
    // undefined values such as null for vec2 and NaN for real
    // isDefined: Fn returning Multifunction whether an object is a defined instance of this type. For example, vec2(NaN, y), vec2(x, NaN)
    // are both undefined forms of the type. list::<vec2>::isDefined([ vec2(NaN, 0), vec2(1, 1) ]) is still true though;
    // it doesn't check whether every element is defined.

    this.name = params.name
    this.supportedCompilationModes = params.supportedCompilationModes

    this.checkValid = params.checkValid
    this.isInstance = params.isInstance
    this.isDefined = params.isDefined

    this.description = params.description
  }
}
