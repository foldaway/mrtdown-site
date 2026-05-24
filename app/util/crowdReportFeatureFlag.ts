export type CrowdReportFeatureEnv = {
  CROWD_REPORTS_ENABLED?: string;
  TIER?: string;
};

export type CrowdReportFeatureOptions = {
  isLocalDev?: boolean;
};

export function isCrowdReportsFeatureEnabled(
  env: CrowdReportFeatureEnv,
  options: CrowdReportFeatureOptions = {},
) {
  const explicit = env.CROWD_REPORTS_ENABLED?.trim().toLowerCase();
  if (explicit != null && explicit.length > 0) {
    return ['1', 'true', 'yes', 'on'].includes(explicit);
  }

  if (options.isLocalDev) {
    return true;
  }

  if (env.TIER == null || env.TIER.trim() === '') {
    return false;
  }

  return env.TIER !== 'production';
}
