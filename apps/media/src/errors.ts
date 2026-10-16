import { AppRpcException } from '@am/core';
import { MediaErrorCode, MediaErrors } from '@am/contracts';

const STATUS: Partial<Record<MediaErrorCode, number>> = {
  [MediaErrors.forbidden]: 403,
  [MediaErrors.notFound]: 404,
  [MediaErrors.tooLarge]: 413,
  [MediaErrors.typeNotAllowed]: 415,
  [MediaErrors.rateLimited]: 429,
  [MediaErrors.uploadMissing]: 409,
  [MediaErrors.uploadExpired]: 410,
  [MediaErrors.notReady]: 409,
  [MediaErrors.alreadyAttached]: 409,
  [MediaErrors.fileRejected]: 422,
};

const MESSAGE: Record<MediaErrorCode, string> = {
  [MediaErrors.validationFailed]: 'Invalid request',
  [MediaErrors.forbidden]: 'You may not upload this',
  [MediaErrors.typeNotAllowed]: 'This kind of file is not accepted here',
  [MediaErrors.tooLarge]: 'The file is too large',
  [MediaErrors.rateLimited]: 'Too many uploads; try again later',
  [MediaErrors.notFound]: 'No such file',
  [MediaErrors.uploadMissing]: 'The file has not arrived yet',
  [MediaErrors.uploadExpired]: 'The upload took too long; start again',
  [MediaErrors.fileRejected]: 'The file could not be used',
  [MediaErrors.notReady]: 'The file is not ready',
  [MediaErrors.wrongPurpose]: 'The file was uploaded for something else',
  [MediaErrors.alreadyAttached]: 'The file is already in use',
};

/** The one place media turns an error code into what goes back over TCP. */
export function mediaError(
  code: MediaErrorCode,
  details?: Record<string, unknown>,
): AppRpcException {
  return new AppRpcException({
    status: STATUS[code] ?? 400,
    code,
    message: MESSAGE[code],
    details,
  });
}
