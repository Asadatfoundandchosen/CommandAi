import { MongoClient } from "mongodb";

/** Requires MongoDB (e.g. GitHub Actions service). Skipped locally unless RUN_MONGO_INTEGRATION=1. */
const runMongo = process.env.RUN_MONGO_INTEGRATION === "1";
const mongoDescribe = runMongo ? describe : describe.skip;

mongoDescribe("MongoDB integration", () => {
  it("connects and responds to ping", async () => {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("MONGODB_URI is not set");
    }
    const client = new MongoClient(uri);
    await client.connect();
    try {
      const admin = await client.db("admin").command({ ping: 1 });
      expect(admin.ok).toBe(1);
    } finally {
      await client.close();
    }
  });
});
