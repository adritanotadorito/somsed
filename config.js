/**
 * Somsed - Public Beta Configuration
 * 
 * Instructions for public beta deployment:
 * 1. PostHog Project Key:
 *    Provide your public Project API Key (format: phc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx).
 *    This is a public client-side key intended for browser analytics.
 *    Never use your personal PostHog user API secret key.
 * 
 * 2. PostHog Host:
 *    - US Cloud: https://us.i.posthog.com
 *    - EU Cloud: https://eu.i.posthog.com
 *    - Self-hosted: Your custom domain
 * 
 * 3. Backend Curve Fitting API URL:
 *    - Local development: http://127.0.0.1:8001/fit
 *    - Production deployment: https://your-backend-domain.com/fit (or /api/fit behind a reverse proxy)
 */

window.SOMSED_CONFIG = {
  // PostHog Public Project API Key (Leave empty to disable analytics)
  POSTHOG_KEY: window.__SOMSED_POSTHOG_KEY__ || '',

  // PostHog API Host
  POSTHOG_HOST: window.__SOMSED_POSTHOG_HOST__ || 'https://us.i.posthog.com',

  // FastAPI Curve Fitting Backend URL
  BACKEND_URL: window.__SOMSED_BACKEND_URL__ || 'http://127.0.0.1:8001/fit',

  // Development analytics toggle:
  // - When false (default): Analytics is automatically disabled on localhost/127.0.0.1
  // - When true: Analytics events are sent to PostHog even on localhost
  DEV_ANALYTICS: false
};
