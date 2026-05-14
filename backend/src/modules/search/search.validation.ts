import { z } from "zod";

export const searchGetQuerySchema = z.object({
  q: z.preprocess(
    (v) => (Array.isArray(v) ? v[0] : v),
    z.string().min(1).max(2000),
  ),
});
