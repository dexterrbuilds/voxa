// Explicit rollout switch; legacy auth remains available for dormant platform users.
export const privyEnabled = process.env.NEXT_PUBLIC_SYNQ_AUTH_PROVIDER === "privy";
