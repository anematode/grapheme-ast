/**
 * Abstraction of an allowed typecast from the type from to the type to
 */
export class Typecast extends Operator {
  constructor(params={}) {
    params.returnType = params.to
    params.signature = params.from

    if (!params.description)
      params.description = `Typecast from ${params.from} to ${params.to}`

    super(params)

    this.from = params.from
    this.to = params.to
  }

  canCast(type) {
    return this.from.equals(type)
  }
}
