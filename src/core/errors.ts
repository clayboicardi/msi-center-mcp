export class SafetyError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SafetyError";
  }
}

export class ValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
