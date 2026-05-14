import { ciBuildMarker } from "./index";

describe("CI smoke (unit)", () => {
  it("exports build marker", () => {
    expect(ciBuildMarker).toBe("1commandai-ci");
  });
});
