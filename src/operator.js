import {Multifunction} from "./multifunction"
import {Type} from "./type"

/**
 * Find the ith item of the infinite sequence a, b, ..., z, aa, ab, ..., zz, aaa, ...
 * Credit to https://stackoverflow.com/questions/181596/how-to-convert-a-column-number-e-g-127-into-an-excel-column-e-g-aa
 * @param i
 * @returns {string}
 */
function getArgOfIndex(i) {
  let dividend = i
  let ret = ""
  let modulo = 0

  while (dividend > 0) {
    modulo = (dividend - 1) % 26
    ret = String.fromCharCode(97 + modulo) + ret
    dividend = Math.floor((dividend - modulo) / 26)
  }

  return ret
}
/**
 * Generate the list a, b, ..., z, aa, ... of length len
 * @param len
 * @returns {Array}
 */
function getDefaultArgNames(len) {
  const arr = []

  for (let i = 0; i < len; ++i) {
    arr.push(getArgOfIndex(i))
  }

  return arr
}

/**
 * Abstracts an operator, which has some signature of well-defined types and some return type. The function called
 * when evaluating the operator depends on the evaluation mode, which can currently be either "double" or "interval".
 * One day, arbitrary precision may be implemented, as well as limited floating point and quadruple precision arithmetic,
 * so that is open for future usage.
 */
export class Operator {
  constructor(params={}) {
    // The return type of the operator. A return type of "void" signifies the function does nothing.
    this.returnType = Type.from(params.returnType)

    // Handle strange signatures
    if (!params.signature)
      params.signature = []

    if (!Array.isArray(params.signature))
      params.signature = [params.signature]

    // An Array containing a list of types which is the signature of the operator.
    this.signature = params.signature.map(Type.from)

    // An Array of the names of each argument. Optional; defaults to a, b, c, ..., z
    this.argNames = params.argNames ? params.argNames : getDefaultArgNames(this.signature.length)

    this.description = params.description ? params.description : ""

    this.multifunction = new Multifunction(params.multi)

    // A list of properties this operator satisfies, for the purposes of optimization/simplification etc.
    this.properties = []
  }

  toString() {
    const args = '(' + this.signature.join(', ') + ')'
    const ret = this.returnType.toString()

    return args + ' -> ' + ret
  }

  /**
   * Whether this operator has a given property
   * @param prop
   * @returns {boolean}
   */
  hasProperty(prop) {
    return this.properties.includes(prop)
  }

  /**
   * Evaluate in a given mode, with given args
   * @param mode
   * @param args
   * @returns {*}
   */
  evaluate(mode, ...args) {
    return this.multifunction.getFunction(mode)(...args)
  }

  /**
   * Evaluate in a given mode, with args passed to the function as an ARRAY.
   * @param mode
   * @param args
   * @returns {*}
   */
  evaluateArray(mode, args) {
    return this.multifunction.getFunction(mode)(...args)
  }
}
