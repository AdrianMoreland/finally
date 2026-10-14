/** jose is ESM-only; tests replace the auth guard, so only the shape is needed. */
export const createRemoteJWKSet = (): (() => never) => () => {
  throw new Error('jose is stubbed in tests');
};
export const jwtVerify = (): Promise<never> => Promise.reject(new Error('jose is stubbed in tests'));
export type JWTVerifyGetKey = () => never;
