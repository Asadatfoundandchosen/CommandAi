import assert from "node:assert/strict";
import { test } from "node:test";

import { hashPassword, verifyPassword } from "./user.password.js";

test("verifyPassword accepts hashed password", () => {
  const h = hashPassword("correct horse battery staple");
  assert.equal(verifyPassword("correct horse battery staple", h), true);
  assert.equal(verifyPassword("wrong", h), false);
});
