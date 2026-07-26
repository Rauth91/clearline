/**
 * Feature flags — flip a value to re-enable gated UI in one place.
 * Data fields (job.ticket, account.haloClientId, etc.) stay in models/sync/export
 * regardless of these flags.
 */

export const FEATURES = {
  /** HaloPSA client ID fields, badges, and KB-oriented copy. */
  haloIntegration: false,
  /**
   * When true: home uses the job-narrative layout; Jobs hub is a plain list.
   * When false (default): home is toolkit-first; Jobs hub shows the day narrative header.
   */
  jobFirstHome: false,
}

