
const validCompilationModes = ["double", "interval", "arbitrary"]

export function isValidCompilationMode(str) {
  return validCompilationModes.includes(str)
}
