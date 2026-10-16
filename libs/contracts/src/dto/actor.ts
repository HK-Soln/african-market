/**
 * Who is asking, as the gateway read it from the verified access token. Services decide with
 * this, never with ids sent in a request body. Shop roles in a token can be up to 15 minutes old
 * (the access token's life); services that own the shop also know its owner for certain.
 */
export interface ActorClaims {
  userId: string;
  roles: string[];
  shops: Array<{ shopId: string; role: 'owner' | 'manager' | 'staff' }>;
}

/** A text in each language the apps use; any of them may be missing. */
export type LocalizedString = { en?: string; ar?: string; fr?: string };
