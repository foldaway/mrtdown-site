import { PostHogProvider } from '@posthog/react';
import type { ReactNode } from 'react';
import type { PostHog, PostHogConfig } from 'posthog-js';

const NOOP_POSTHOG_CLIENT = {
  config: {},
  capture: () => undefined,
  captureException: () => undefined,
} as unknown as PostHog;

type OptionalPostHogProviderProps = {
  apiKey?: string;
  children: ReactNode;
  options: Partial<PostHogConfig>;
};

export function OptionalPostHogProvider({
  apiKey,
  children,
  options,
}: OptionalPostHogProviderProps) {
  if (apiKey == null || apiKey === '') {
    return (
      <PostHogProvider client={NOOP_POSTHOG_CLIENT}>{children}</PostHogProvider>
    );
  }

  return (
    <PostHogProvider apiKey={apiKey} options={options}>
      {children}
    </PostHogProvider>
  );
}
