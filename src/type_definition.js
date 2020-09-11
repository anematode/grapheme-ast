import {validCompilationModes} from "./compilation_mode"


const fallbackTypecheck = Object.assign(() => true, { cost: 0 })

const multiParams = {}

for (let key in validCompilationModes) {
  multiParams[key] = fallbackTypecheck
}

const fallbackTypecheckMulti = new Multifunction(multiParams)

/**
 * Provides information about a given type. Should only be used internally
 */
export class TypeDefinition {
  constructor(params={}) {
    // Parameters:
    // name: The name of the type. e.g. "complex", "real", "list"
    // checkValid: A function called with the Type instance which checks whether it is valid. It does NOT have the
    // responsibility of checking whether its child types are valid.
    // isInstance: Check whether an object is a valid instance of this type. Note that this will include conventional
    // undefined values such as null for vec2 and NaN for real
    // isDefined: Check whether an object is a defined instance of this type. For example, vec2(NaN, y), vec2(x, NaN)
    // are both undefined forms of the type. list::<vec2>::isDefined([ vec2(NaN, 0), vec2(1, 1) ]) is still true though;
    // it doesn't check whether every element is defined.

    this.name = params.name
    this.supportedCompilationModes = params.supportedCompilationModes

    this.checkValid = params.checkValid
    this.isInstance = params.isInstance
  }
}
