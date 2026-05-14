declare global {
  namespace Express {
    interface Request {
      /** Set by auth middleware (optional). Used for rate limiting when present. */
      tenantId?: string;
      userId?: string;
    }
  }
}

export {};
