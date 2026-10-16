import { AppRpcException } from '@am/core';
import { ShopErrorCode, ShopErrors } from '@am/contracts';

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
