/** All money is integer fils (1 AED = 100 fils) plus an ISO currency. Never use floats for money. */
export type Fils = number;
export type CurrencyCode = 'AED';

export interface Money {
  amountFils: Fils;
  currency: CurrencyCode;
}

export const aedToFils = (aed: number): Fils => Math.round(aed * 100);
export const filsToAed = (fils: Fils): number => fils / 100;

/** UAE VAT is 5%. Prices are shown VAT-inclusive; this extracts the VAT part of an inclusive amount. */
export const VAT_RATE = 0.05;
export const vatFromInclusive = (inclusiveFils: Fils): Fils =>
  Math.round(inclusiveFils - inclusiveFils / (1 + VAT_RATE));
