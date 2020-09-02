import {Multifunction} from "./multifunction"

class Operator {
  constructor(params) {
    this.returnType = null
    this.signature = []

    this.multifunction = new Multifunction(params)
  }


}
