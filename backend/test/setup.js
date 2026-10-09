// Settings for tests: a throwaway database and made-up secrets. Import this first.
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.TICKR_API_KEY = 'tkf_test_key';
process.env.TICKR_WEBHOOK_SECRET = 'whsec_test_secret';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.STARTING_SAVINGS = '1000';
