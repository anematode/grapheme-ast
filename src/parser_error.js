
// ParserError class; represents errors encountered while parsing expressions
class ParserError extends Error {
  name="ParserError"
}

// The maximum length of string before the error message will include ellipses surrounding the string for brevity
const MAX_LENGTH = 75

/**
 * Returns the string of an error message for a given line, with an error at a given index and line number.
 * @param line
 * @param index
 * @param lineIndex
 * @param message
 * @param includeIndexInfo
 * @returns {string}
 */
function generateErrorMessage(line, index, lineIndex, message, includeIndexInfo) {
  // The excerpt of the whole line shown, and the number of spaces needed to correctly position the caret
  let excerpt, newIndex

  // If the line is very long, include ellipses as appropriate
  if (line.length > MAX_LENGTH) {
    const paddingSize = Math.round((MAX_LENGTH - 1) / 2)

    // Calculate the indices of the excerpt by surrounding the position of the error
    let minExcerptIndex = index - paddingSize, maxExcerptIndex = index + paddingSize + 1
    let minNeedsEllipsis = true, maxNeedsEllipsis = true

    // Clamp the minExcerptIndex and record if the left ellipsis is not necessary; ditto for maxExcerptIndex
    if (minExcerptIndex < 0) {
      minExcerptIndex = 0
      minNeedsEllipsis = false
    }

    if (maxExcerptIndex > line.length - 1) {
      maxExcerptIndex = line.length - 1
      maxNeedsEllipsis = false
    }

    // Synthesize the excerpt
    excerpt = (minNeedsEllipsis ? "... " : '') + line.slice(minExcerptIndex, maxExcerptIndex) + (maxNeedsEllipsis ? " ..." : '')

    // Calculate the number of spaces needed, compensating for the left ellipsis if necessary
    newIndex = index - minExcerptIndex + (minNeedsEllipsis ? 4 : 0)
  } else {
    excerpt = line
    newIndex = index
  }

  // Synthesize the text of the error message, potentially with index and line information
  const errorMessage = message + (includeIndexInfo ? (", index " + index + (lineIndex !== -1 ? ", line " + (lineIndex + 1) : '')) : '')
  const spaces = " ".repeat(newIndex)

  return errorMessage + '\n' + excerpt + '\n' + spaces + "^"
}

/**
 * Get the string of an error message, given a string, the error's location, a message, and whether to include the line
 * and index.
 * @param string {String}
 * @param index {number}
 * @param message {String}
 * @param includeIndexInfo {boolean}
 * @returns {string}
 */
function getErrorInStringMessage(string, index, message="Unknown error", includeIndexInfo=true) {
  // Clamp index to a valid range. Note that index=string.length will result in the error being shown immediately after
  // the end of the string. This would be used for example in an unbalanced parenthesis error
  if (index < 0)
    index = 0

  if (index > string.length)
    index = string.length

  const lines = string.split('\n')

  let totalLength = 0  // Length of the string so far (iterating over lines)
  let lineIndex = 0    // The line index we are on
  let indexInLine = 0  // The index within the line of the error

  for (; lineIndex < lines.length; ++lineIndex) {
    // Iterate over all lines
    const line = lines[lineIndex]

    // We add one to compensate for the implicit \n at the end of every line
    const lineLength = line.length + 1

    const prevTotalLength = totalLength

    // Accumulate the total length so far
    totalLength += lineLength

    // This condition means that the error location is in the current line. Thus we store the index within this line
    // and break.
    if (totalLength > index) {
      indexInLine = index - prevTotalLength
      break
    }
  }

  // Should never happen, since the clamping prevents index from being greater than string.length
  if (lineIndex >= lines.length) {
    lineIndex = lines.length - 1
    indexInLine = lines[lineIndex].length
  }

  // The line in which the error appears
  const line = lines[lineIndex]

  // Don't include line information if the string only consists of one line
  if (lines.length === 1)
    lineIndex = -1

  return generateErrorMessage(line, indexInLine, lineIndex, message, includeIndexInfo)
}

/**
 * Get a ParserError for a given string. See getErrorInStringMessage for parameter details.
 * @returns {ParserError}
 */
function errorInString(...args) {
  return new ParserError(getErrorInStringMessage(...args))
}

export { ParserError, errorInString }
