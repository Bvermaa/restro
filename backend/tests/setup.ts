process.env.NODE_ENV = 'test';
process.env.PORT = '4001';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-length-long!';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-length-long!';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/qr_restaurant_db?schema=public';
