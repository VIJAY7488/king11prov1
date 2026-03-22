import dotenv from "dotenv";

dotenv.config();

if (!process.env.MONGODB_URL) {
  throw new Error("❌ MONGODB_URL is missing in .env");
}

const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parseInt(process.env.PORT ?? "4000", 10),

  // MongoDB
  mongoUri: process.env.MONGODB_URL,

  // Redis
  redisHost: process.env.REDIS_HOST ?? "127.0.0.1",
  redisPort: parseInt(process.env.REDIS_PORT ?? "6379", 10),
  redisPassword: process.env.REDIS_PASSWORD ?? "",
  redisDb: parseInt(process.env.REDIS_DB ?? "0", 10),
  redisTls: process.env.REDIS_TLS === "true",

  // JWT
  jwtSecret: process.env.JWT_SECRET ?? "change_this_secret",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  jwtRefreshSecret:
    process.env.JWT_REFRESH_SECRET ?? "refresh_change_me_in_production",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "30d",
  cookieDomain: process.env.COOKIE_DOMAIN ?? "",
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173,https://king11pro.live")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
} as const;

export default config;
