import { AppRpcException } from '@am/core';
import { CatalogErrorCode, CatalogErrors } from '@am/contracts';

const STATUS: Partial<Record<CatalogErrorCode, number>> = {
  [CatalogErrors.shopNotFound]: 404,
  [CatalogErrors.forbidden]: 403,
  [CatalogErrors.adminOnly]: 403,
  [CatalogErrors.productNotFound]: 404,
  [CatalogErrors.categoryNotFound]: 404,
  [CatalogErrors.branchNotFound]: 404,
  [CatalogErrors.variantNotFound]: 404,
  [CatalogErrors.invalidTransition]: 409,
  [CatalogErrors.skuTaken]: 409,
  [CatalogErrors.tooManyProducts]: 409,
  [CatalogErrors.tooManyCategories]: 409,
};

const MESSAGE: Record<CatalogErrorCode, string> = {
  [CatalogErrors.validationFailed]: 'Invalid request',
  [CatalogErrors.shopNotFound]: 'No such shop',
  [CatalogErrors.forbidden]: 'You may not change this',
  [CatalogErrors.adminOnly]: 'Only an admin can do this',
  [CatalogErrors.productNotFound]: 'No such product',
  [CatalogErrors.categoryNotFound]: 'No such category',
  [CatalogErrors.categoryInactive]: 'This category takes no new products',
  [CatalogErrors.categoryInvalid]: 'Not a valid category',
  [CatalogErrors.branchNotFound]: 'No such branch',
  [CatalogErrors.variantNotFound]: 'No such variant',
  [CatalogErrors.declarationRequired]: 'Food products need the seller declaration',
  [CatalogErrors.invalidTransition]: 'Not possible in the current status',
  [CatalogErrors.reasonRequired]: 'A reason is required',
  [CatalogErrors.skuTaken]: 'This SKU is already used in the shop',
  [CatalogErrors.tooManyProducts]: 'This shop has as many products as it can have',
  [CatalogErrors.tooManyCategories]: 'There are as many categories as there can be',
};

/** The one place catalog turns an error code into what goes back over TCP. */
export function catalogError(
  code: CatalogErrorCode,
  details?: Record<string, unknown>,
): AppRpcException {
  return new AppRpcException({
    status: STATUS[code] ?? 400,
    code,
    message: MESSAGE[code],
    details,
  });
}

export const invalid = (path: string, message: string) =>
  catalogError(CatalogErrors.validationFailed, { issues: [{ path, message }] });
