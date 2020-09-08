
const validCompilationModes = ["double", "interval"]

export function isValidCompilationMode(str) {
  return validCompilationModes.includes(str)
}
