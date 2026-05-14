import { add, clamp } from "./math";

describe("math", () => {
  it("adds", () => {
    expect(add(2, 3)).toBe(5);
  });

  it("clamps", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});
