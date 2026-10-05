// Redis key layout of the accounts feature (see the spec's storage table). Server-only.

export const userKey = (id: string) => `user:${id}`;
export const emailKey = (email: string) => `email:${email}`;
export const sessionKey = (hash: string) => `sess:${hash}`;
export const userSessionsKey = (userId: string) => `usess:${userId}`;
export const tokenKey = (hash: string) => `tok:${hash}`;
export const dataKey = (userId: string) => `data:${userId}`;
export const dataVersionKey = (userId: string) => `datav:${userId}`;
