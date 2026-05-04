export class AppApiError extends Error {
  public readonly httpStatus: number;
  public readonly serverMessage: string;

  constructor(httpStatus: number, serverMessage: string) {
    super(serverMessage);
    this.name = 'AppApiError';
    this.httpStatus = httpStatus;
    this.serverMessage = serverMessage;
    Object.setPrototypeOf(this, AppApiError.prototype);
  }
}
