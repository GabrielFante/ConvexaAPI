const defaults: Record<string, string> = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://convexa:convexa@localhost:5432/convexa_test",
  JWT_SECRET: "chave-de-teste-com-no-minimo-32-caracteres",
  INTERNAL_API_KEY: "chave-interna-de-teste-com-32-caracteres",
  APP_URL: "http://localhost:5173",
  CORS_ORIGINS: "http://localhost:5173",
  DATABASE_POOL_MAX: "5",
  DATABASE_POOL_CONNECTION_TIMEOUT_MS: "2000",
  DATABASE_STATEMENT_TIMEOUT_MS: "3000",
};

for (const [key, value] of Object.entries(defaults)) {
  process.env[key] = value;
}
