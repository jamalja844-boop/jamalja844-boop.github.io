// Testconfiguratie: aparte testdatabase en vaste testsleutels (nooit productie).
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://studio:studio@localhost:5432/ai_studio_test";
process.env.APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY_TEST ?? Buffer.alloc(32, 7).toString("base64");
process.env.APP_URL = "http://localhost:3100";
process.env.ENABLE_DEMO_PROVIDER = "true";
process.env.DATABASE_POOL_MAX = "5";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;
