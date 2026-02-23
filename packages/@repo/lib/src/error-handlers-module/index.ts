/**
 * @description Custom error class that extends the built-in Error class for error responses
 */
export class ErrorResponse extends Error {
  constructor(public message: string, public statusCode: number) {
    super(message); // Call the parent constructor with the message

    // Set the prototype chain explicitly for older environments (optional)
    Object.setPrototypeOf(this, ErrorResponse.prototype);
  }
}
