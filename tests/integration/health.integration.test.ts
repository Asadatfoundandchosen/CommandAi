import request from "supertest";
import { createHttpApp } from "../fixtures/http-app";

describe("HTTP integration (supertest)", () => {
  it("GET /health returns 200", async () => {
    const app = createHttpApp();
    const res = await request(app).get("/health").expect(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
