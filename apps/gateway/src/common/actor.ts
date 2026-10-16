import type { AuthenticatedUser } from '@am/auth';
import type { ActorClaims } from '@am/contracts';

/**
 * Who is asking, as services decide with it: from the verified access token, never from a body.
 * Staff carry the branches they work at.
 */
export const actorOf = (user: AuthenticatedUser): ActorClaims => ({
  userId: user.id,
  roles: user.roles,
  shops: user.shops.map(({ shopId, role, branchIds }) => ({ shopId, role, branchIds })),
});

/** The signed-in actor on a public route, if anyone is signed in. */
export const optionalActor = (user: AuthenticatedUser | undefined): ActorClaims | undefined =>
  user ? actorOf(user) : undefined;
