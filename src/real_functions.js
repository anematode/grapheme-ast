
const RealFunctions = {
  Add: (x, y) => x + y,
  Multiply: (x, y) => x * y,
  Divide: (x, y) => x / y,
  Subtract: (x, y) => x - y,
  Sin: Math.sin,
  Cos: Math.cos,
  Pow: Math.pow,
  Atan2: Math.atan2,
  UnaryMinus: x => -x
}

export { RealFunctions }
