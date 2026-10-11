/**
 * A refresh token that was already rotated is accepted once more for this long. Two tabs that
 * refresh at the same moment both send the old token; without this, the slower one would look
 * like a thief and sign the person out everywhere. After the window, reuse revokes the family.
 */
export const REFRESH_REUSE_LEEWAY_SECONDS = 10;

export const USER_AGENT_MAX_LENGTH = 512;
