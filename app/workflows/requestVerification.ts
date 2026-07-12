export function isWorkflowRequestVerificationConfigured(
  environment: Readonly<Record<string, string | undefined>>,
) {
  if (environment.QSTASH_DEV === 'true' || environment.QSTASH_DEV === '1') {
    return true;
  }

  return Boolean(
    environment.QSTASH_CURRENT_SIGNING_KEY &&
      environment.QSTASH_NEXT_SIGNING_KEY,
  );
}
