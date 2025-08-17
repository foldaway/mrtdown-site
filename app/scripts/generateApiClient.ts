import 'dotenv/config';
import { createClient } from '@hey-api/openapi-ts';
import { assert } from '../util/assert';

const { API_ENDPOINT } = process.env;
assert(
  API_ENDPOINT != null,
  'API_ENDPOINT must be set in environment variables',
);

const openApiUrl = new URL('/openapi.json', API_ENDPOINT);

createClient({
  input: openApiUrl.toString(),
  output: 'app/client',
});
