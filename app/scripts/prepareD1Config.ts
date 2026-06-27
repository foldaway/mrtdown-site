import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type D1DatabaseConfig = {
  binding?: string;
  database_id?: string;
};

type WranglerConfig = {
  d1_databases?: D1DatabaseConfig[];
  env?: Record<
    string,
    {
      d1_databases?: D1DatabaseConfig[];
    }
  >;
};

const PLACEHOLDER_D1_ID = /^0{8}-0{4}-0{4}-0{4}-0{11}[1-9]$/;
const targetEnv = process.env.CLOUDFLARE_ENV;
const d1DatabaseId = process.env.D1_DATABASE_ID;

if (targetEnv == null || targetEnv.length === 0) {
  throw new Error('CLOUDFLARE_ENV must be set before preparing D1 config');
}

if (d1DatabaseId == null || d1DatabaseId.length === 0) {
  throw new Error(
    `D1_DATABASE_ID must be set for the ${targetEnv} environment`,
  );
}

if (PLACEHOLDER_D1_ID.test(d1DatabaseId)) {
  throw new Error(
    `Refusing to use placeholder D1 database ID: ${d1DatabaseId}`,
  );
}

const wranglerConfigPath = resolve('wrangler.jsonc');
const config = JSON.parse(
  readFileSync(wranglerConfigPath, 'utf8'),
) as WranglerConfig;
const envConfig = config.env?.[targetEnv];
if (envConfig == null) {
  throw new Error(`Missing wrangler environment config: ${targetEnv}`);
}

const dbBinding = envConfig.d1_databases?.find(
  (database) => database.binding === 'DB',
);
if (dbBinding == null) {
  throw new Error(`Missing DB D1 binding for ${targetEnv}`);
}

dbBinding.database_id = d1DatabaseId;

if (targetEnv === 'production') {
  const rootDbBinding = config.d1_databases?.find(
    (database) => database.binding === 'DB',
  );
  if (rootDbBinding != null) {
    rootDbBinding.database_id = d1DatabaseId;
  }
}

writeFileSync(`${wranglerConfigPath}`, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Prepared wrangler D1 config for ${targetEnv}`);
