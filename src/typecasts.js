import {Typecast} from "./typecast"
import {Multifunction} from "./multifunction"


const identity = Object.assign(x => x, { cost: 0 })
const identityMulti = new Multifunction({
  "interval": identity,
  "double": identity
})

const Typecasts = [
  {
    from: "int",
    to: "real",
    identityMulti
  },
  {

  }
]

// Replace with actual typecast objects
for (let i = 0; i < Typecasts.length; ++i) {
  Typecasts[i] = new Typecast(Typecasts[i])
}
