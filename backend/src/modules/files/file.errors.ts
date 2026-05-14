export class FileServiceError extends Error {
  constructor(
    message: string,
    readonly code: "bad_request" | "not_configured" = "bad_request",
  ) {
    super(message);
    this.name = "FileServiceError";
  }
}
