export class MediaError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}
