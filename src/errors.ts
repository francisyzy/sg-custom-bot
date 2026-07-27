export class LtaServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LtaServiceError";
  }
}
