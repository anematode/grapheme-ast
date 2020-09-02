import {isValidCompilationMode} from "./compilation_mode"

function assertSameArgCount(arr) {
  const cnt = arr[0].length
}

// A Multifunction that can be evaluated in several compilation modes, but not necessarily all compilation modes
class Multifunction {
  constructor(funcMap) {
    if (!funcMap)
      throw new TypeError("No arguments passed to multifunction constructor")

    const compilationModes = Object.keys(funcMap)

    if (!compilationModes.length)
      throw new RangeError("No functions provided")

    compilationModes.forEach(compilationType => {
      if (!isValidCompilationMode(compilationType))
        throw new TypeError("Invalid compilation type " + compilationType)
    })

    this.functions = funcMap


    const fns = Object.values(funcMap)

    // Check types
    if (!fns.every(fn => typeof fn === "function"))
      throw new TypeError("Non-function provided to Multifunction constructor")

    const length1 = fns[0].length

    // Check that all have the same argCount
    fns.forEach(fn => {
      if (fn.length !== length1)
        throw new RangeError(`Function has the wrong number of arguments (expected ${length1}, found ${fn.length})`)
    })
  }

  getFunction(compilationMode) {
    const func = this.functions[compilationMode]

    return func ? func : null
  }
}

export { Multifunction }
