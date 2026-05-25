/** Raised when a JWT was revoked via the Redis blacklist. */
export class UnauthorizedError extends Error {
  constructor(message = "Token has been revoked") {
    super(message);
    this.name = "UnauthorizedError";
  }
}
