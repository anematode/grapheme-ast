import {Multifunction} from "./multifunction"

class Operator {
  constructor(params) {
    this.returnType = params.returnType
    this.signature = params.signature

    this.multifunction = new Multifunction(params)
  }

  
}
