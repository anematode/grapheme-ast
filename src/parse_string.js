import {expressionTokenizer} from "./expression_tokenizer"

/**
 * Convert string into a dict representation of its AST.
 * @param string
 * @param options
 */
function parseString(string, options={
  implicitMultiplication: true,
}) {
  const tokens = expressionTokenizer(string, options)


}
