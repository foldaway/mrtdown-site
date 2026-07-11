import { Client } from '@upstash/workflow';

const { QSTASH_URL, QSTASH_TOKEN } = process.env;

export function getClient() {
  return new Client({
    baseUrl: QSTASH_URL,
    token: QSTASH_TOKEN,
  });
}
