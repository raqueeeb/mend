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

/**
 * Throws a {@link UsageError} unless a condition holds.
 *
 * Used for the arguments a caller controls, where failing early with a clear
 * message beats producing a diff of `undefined`.
 *
 * @param {unknown} condition what must be true
 * @param {string} message what to say when it is not
 * @throws {UsageError} when the condition is falsy
 */
export function check(condition, message) {
  if (!condition) throw new UsageError(message);
}

/**
 * Checks that a value is a string, naming the argument in the message.
 *
 * @param {unknown} value the value
 * @param {string} name what the argument is called
 * @returns {string} the value
 * @throws {UsageError} when it is not a string
 */
export function requireText(value, name) {
  if (typeof value !== 'string') {
    throw new UsageError(`${name} must be a string, got ${describe(value)}`);
  }
  return value;
}

/**
 * Describes a value for an error message.
 *
 * `typeof null` is `'object'`, which is never what a reader wants to be
 * told, and an array called an object is nearly as unhelpful.
 *
 * @param {unknown} value any value
 * @returns {string} a short description
 */
export function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  if (typeof value === 'object') return 'an object';
  if (typeof value === 'string') return 'a string';
  return typeof value;
}
