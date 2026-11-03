/**
 * The error types.
 *
 * Two kinds of thing go wrong in a diff tool, and they want different
 * treatment. A patch that will not parse is a problem with the *input*, and
 * the only useful response is to say which line and why. A patch that parses
 * but will not apply is not broken at all -- it simply does not match the
 * file in front of it, which is ordinary and expected, and the caller wants
 * the details rather than an exception.
 *
 * So `ParseError` is thrown and a failed apply is a returned result. That
 * line is drawn here and held everywhere else.
 */

/** The base class, so a caller can catch everything from this library. */
export class MendError extends Error {
  /**
   * @param {string} message what went wrong
   */
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** A patch that could not be read. */
export class ParseError extends MendError {
  /**
   * @param {string} message what went wrong
   * @param {object} [where] where it went wrong
   * @param {number} [where.line] the one-based line number
   * @param {string} [where.text] the offending line
   */
  constructor(message, where = {}) {
    const at = where.line === undefined ? '' : ` on line ${where.line}`;
    super(`${message}${at}`);
    this.line = where.line ?? null;
    this.text = where.text ?? null;
  }

  /**
   * The error with the offending line underneath it.
   *
   * @returns {string} two or three lines of text
   */
  format() {
    if (this.text === null) return this.message;
    return `${this.message}\n  | ${this.text}`;
  }
}

/** A caller mistake: the wrong type, or an impossible combination of options. */
export class UsageError extends MendError {}
