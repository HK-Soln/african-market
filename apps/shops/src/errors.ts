import { AppRpcException } from '@am/core';
import {
  ShopErrorCode,
  ShopErrors,
  VerificationErrorCode,
  VerificationErrors,
} from '@am/contracts';

const STATUS: Partial<Record<ShopErrorCode, number>> = {
  [ShopErrors.notFound]: 404,
  [ShopErrors.branchNotFound]: 404,
  [ShopErrors.forbidden]: 403,
  [ShopErrors.tooManyBranches]: 409,
  [ShopErrors.tooManyShops]: 409,
};

const MESSAGE: Record<ShopErrorCode, string> = {
  [ShopErrors.validationFailed]: 'Invalid request',
  [ShopErrors.notFound]: 'No such shop',
  [ShopErrors.forbidden]: 'You may not change this shop',
  [ShopErrors.branchNotFound]: 'No such branch',
  [ShopErrors.outsideUae]: 'The location is outside the UAE',
  [ShopErrors.serviceAreaInvalid]: 'The delivery area is not a valid area in the UAE',
  [ShopErrors.deliveryAreaMissing]: 'Delivery needs an area or a radius',
  [ShopErrors.tooManyBranches]: 'This shop has as many branches as it can have',
  [ShopErrors.tooManyShops]: 'You have created as many shops as you can',
};

/** The one place shops turns an error code into what goes back over TCP. */
export function shopError(code: ShopErrorCode, details?: Record<string, unknown>): AppRpcException {
  return new AppRpcException({
    status: STATUS[code] ?? 400,
    code,
    message: MESSAGE[code],
    details,
  });
}

const VERIFICATION_STATUS: Partial<Record<VerificationErrorCode, number>> = {
  [VerificationErrors.ownerOnly]: 403,
  [VerificationErrors.adminOnly]: 403,
  [VerificationErrors.incomplete]: 409,
  [VerificationErrors.kycNotPassed]: 409,
  [VerificationErrors.invalidTransition]: 409,
  [VerificationErrors.requestNotFound]: 404,
  [VerificationErrors.documentUnavailable]: 404,
  [VerificationErrors.webhookRejected]: 401,
  [VerificationErrors.providerUnavailable]: 503,
};

const VERIFICATION_MESSAGE: Record<VerificationErrorCode, string> = {
  [VerificationErrors.ownerOnly]: 'Only the shop owner can do this',
  [VerificationErrors.adminOnly]: 'Only an admin can do this',
  [VerificationErrors.incomplete]: 'The shop is not ready to be listed',
  [VerificationErrors.kycNotPassed]: "The owner's identity is not verified yet",
  [VerificationErrors.invalidTransition]: 'Not possible in the current status',
  [VerificationErrors.reasonRequired]: 'A reason is required',
  [VerificationErrors.requestNotFound]: 'No such verification',
  [VerificationErrors.documentUnavailable]: 'That document is not available',
  [VerificationErrors.webhookRejected]: 'Webhook signature not valid',
  [VerificationErrors.providerUnavailable]: 'The verification provider is unavailable; try again',
};

export function verificationError(
  code: VerificationErrorCode,
  details?: Record<string, unknown>,
): AppRpcException {
  return new AppRpcException({
    status: VERIFICATION_STATUS[code] ?? 400,
    code,
    message: VERIFICATION_MESSAGE[code],
    details,
  });
}
