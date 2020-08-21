/**
 * Abstraction of an allowed typecast from the type from to the type to
 */
class Typecast {
  constructor({ from, to }) {
    this.from = from
    this.to = to
  }

  canCast(type, compilationMode) {
    return this.from.equals(type)
  }
}
