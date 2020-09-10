const fallbackIdentity = x => x
const fallbackMulti = new Multifunction({

})

  /**
 * Provides information about a given type, including checking for validity, checking if a
 */
class TypeDefinition {
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
    if (!this.name)
      throw new TypeError("No name provided")

    this.supportedCompilationModes

    this.checkValid = params.checkValid ? params.checkValid : new Multifunction
  }
}
