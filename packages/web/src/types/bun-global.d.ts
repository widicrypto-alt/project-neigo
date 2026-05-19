// Minimal Bun global shim — lets the web tsconfig type-check server files
// that reference Bun.password (used in auth.ts). No runtime effect in browser.
declare const Bun: {
  password: {
    hash(
      password: string,
      options?: { algorithm?: string; memoryCost?: number; timeCost?: number },
    ): Promise<string>;
    verify(password: string, hash: string): Promise<boolean>;
  };
};
