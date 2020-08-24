import {isValidCompilationMode} from "./compilation_mode"

function assertSameArgCount(arr) {
  const cnt = arr[0].length
}

// A Multifunction that can be evaluated in several compilation modes, but not necessarily all compilation modes
class Multifunction {
  constructor(params) {
    this.functions = Object.fromEntries(params.filter(entry => isValidCompilationMode(entry)))

    const fns = Object.keys(this.functions)

    if (!fns.length)
      throw new RangeError("No functions provided")

    // Check types
    if (!fns.every(fn => typeof fn === "function"))
      throw new TypeError("Non-function provided to Multifunction constructor")

    const length1 = fns[0].length

    // Check that all have the same argCount
    fns.every(fn => fn.length === length1 ||
      (throw new RangeError(`Function has the wrong number of arguments (expected ${length1}, found ${fn.length})`)))
  }


}
