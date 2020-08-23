import {isValidCompilationMode} from "./compilation_mode"

function assertSameArgCount(arr) {
  const cnt = arr[0].length
}

// A Multifunction that can be evaluated in several compilation modes, but not necessarily all compilation modes
class Multifunction {
  constructor(params) {
    this.functions = Object.fromEntries(params.filter(entry => isValidCompilationMode(entry)))

    // Check types
    if (!Object.keys(this.functions).every(fn => typeof fn === "function"))
      throw new TypeError("Non-function provided to Multifunction constructor")
  }

}
