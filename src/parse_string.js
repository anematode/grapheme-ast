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

  // The parsing steps are as follows:
  // 0. Tokenize (this includes checking for balanced parens)
  // 1. Check token validity
  //   a. Function templates not malformed
  //   b. No namespaced, templated functions (since all template functions are in the global scope)
  // 2. Check certain common
}
