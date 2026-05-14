import "express-session";

declare module "express-session" {
  // Extend when persisting `req.session.userId`, etc.
  interface SessionData {
    // userId?: string;
  }
}
