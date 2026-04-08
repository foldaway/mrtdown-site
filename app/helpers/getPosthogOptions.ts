import type { PostHogConfig } from 'posthog-js';

export function getPosthogOptions(): Partial<PostHogConfig> {
  const { VITE_PUBLIC_POSTHOG_HOST } = import.meta.env;

  let api_host = VITE_PUBLIC_POSTHOG_HOST;
  let ui_host: string | null = null;
  let debug = true;
  if (import.meta.env.PROD) {
    api_host = '/api/ph';
    ui_host = VITE_PUBLIC_POSTHOG_HOST;
    debug = false;
  }

  return {
    api_host,
    ui_host,
    defaults: '2026-01-30',
    __add_tracing_headers: [
      typeof window !== 'undefined' ? window.location.host : 'localhost',
    ],
    debug,
  };
}
