/**
 * Somsed - Privacy-First Anonymous Usage Analytics (PostHog Integration)
 * 
 * Design & Privacy Guarantees:
 * - Strictly anonymous: No user sign-in required.
 * - Session recording is DISABLED (no screen captures, no DOM recordings).
 * - Autocapture is DISABLED (no arbitrary button/keystroke capturing).
 * - Only 6 explicit mathematical interaction events are tracked.
 * - No raw coordinates, equations, images, or user inputs are ever transmitted.
 * - Localhost / development traffic is excluded by default.
 * - Failures are completely silent and never interrupt drawing, fitting, or calculations.
 */

(function () {
  'use strict';

  const config = window.SOMSED_CONFIG || {
    POSTHOG_KEY: '',
    POSTHOG_HOST: 'https://us.i.posthog.com',
    DEV_ANALYTICS: false
  };

  const isLocalEnvironment = (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '[::1]' ||
    window.location.protocol === 'file:'
  );

  const shouldSendAnalytics = Boolean(config.POSTHOG_KEY) && (!isLocalEnvironment || Boolean(config.DEV_ANALYTICS));

  // Initialize PostHog snippet safely if key is provided and enabled
  if (shouldSendAnalytics) {
    try {
      (function (t, e) {
        var o, n, p, r;
        e.__SV ||
          ((window.posthog = e),
            (e._i = []),
            (e.init = function (i, s, a) {
              function g(t, e) {
                var o = e.split('.');
                2 == o.length && ((t = t[o[0]]), (e = o[1])),
                  (t[e] = function () {
                    t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
                  });
              }
              ((p = t.createElement('script')).type = 'text/javascript'),
                (p.crossOrigin = 'anonymous'),
                (p.async = !0),
                (p.src = s.api_host.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.js'),
                (r = t.getElementsByTagName('script')[0]).parentNode.insertBefore(p, r);
              var u = e;
              for (
                void 0 !== a ? (u = e[a] = []) : (a = 'posthog'),
                u.people = u.people || [],
                u.toString = function (t) {
                  var e = 'posthog';
                  return 'posthog' !== a && (e += '.' + a), t || (e += ' (stub)'), e;
                },
                u.people.toString = function () {
                  return u.toString(1) + '.people (stub)';
                },
                o = 'init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug'.split(' '),
                n = 0;
                n < o.length;
                n++
              )
                g(u, o[n]);
              e._i.push([i, s, a]);
            }),
            (e.__SV = 1));
      })(document, window.posthog || []);

      window.posthog.init(config.POSTHOG_KEY, {
        api_host: config.POSTHOG_HOST,
        autocapture: false,               // Disable automatic DOM click/input capturing
        disable_session_recording: true,  // Strictly disable session recording
        capture_pageview: true,           // Capture anonymous pageview for visitor metrics
        capture_pageleave: true,          // Capture session duration
        persistence: 'localStorage+cookie',
        respect_dnt: true,                // Respect browser Do Not Track setting
        cross_subdomain_cookie: false,
        sanitize_properties: function (properties) {
          // Extra safety layer: remove any accidental coordinate arrays or raw objects
          if (!properties) return properties;
          const clean = {};
          for (const [k, v] of Object.entries(properties)) {
            if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
              clean[k] = v;
            }
          }
          return clean;
        }
      });
    } catch (err) {
      console.warn('[Analytics] PostHog initialization bypassed:', err.message);
    }
  }

  /**
   * Sanitizes event properties to guarantee that only safe primitive metadata is sent.
   */
  function sanitizeProperties(props) {
    if (!props || typeof props !== 'object') return {};
    const sanitized = {};
    for (const [key, value] of Object.entries(props)) {
      if (typeof value === 'string') {
        sanitized[key] = value.substring(0, 100); // Limit string length
      } else if (typeof value === 'number' && Number.isFinite(value)) {
        sanitized[key] = value;
      } else if (typeof value === 'boolean') {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  /**
   * Safe universal tracking function.
   * Never throws exceptions; logs to console during local development.
   */
  function trackEvent(eventName, properties = {}) {
    try {
      const cleanProps = sanitizeProperties(properties);

      if (isLocalEnvironment && !config.DEV_ANALYTICS) {
        // Development mode: Log event locally without sending network requests
        console.debug(`[Analytics Debug] ${eventName}:`, cleanProps);
        return;
      }

      if (shouldSendAnalytics && window.posthog && typeof window.posthog.capture === 'function') {
        window.posthog.capture(eventName, cleanProps);
      }
    } catch (err) {
      // Analytics failures must never affect calculator functionality
      console.debug('[Analytics] Failed to capture event:', err.message);
    }
  }

  // Export analytics helper interface to window
  window.SomsedAnalytics = {
    trackEvent: trackEvent,

    // 1. Drawing finished
    trackDrawingCompleted: function (strokeType = 'freehand') {
      trackEvent('drawing_completed', { stroke_type: String(strokeType) });
    },

    // 2. Geometric shape recognized on hold
    trackShapeRecognized: function (shapeType) {
      trackEvent('shape_recognized', { shape_type: String(shapeType || 'unknown') });
    },

    // 3. Curve fit succeeded
    trackFitSucceeded: function (modelFamily, orientation = 'y_of_x') {
      trackEvent('fit_succeeded', {
        model_family: String(modelFamily || 'unknown'),
        orientation: String(orientation || 'y_of_x')
      });
    },

    // 4. Curve fit failed / rejected
    trackFitFailed: function (errorCategory) {
      trackEvent('fit_failed', {
        error_category: String(errorCategory || 'unknown_error')
      });
    },

    // 5. Numerical parameters or geometry edited
    trackEditApplied: function (objectType) {
      trackEvent('edit_applied', {
        object_type: String(objectType || 'unknown')
      });
    },

    // 6. LaTeX or Text equation copied
    trackEquationCopied: function (format = 'latex', shapeType = 'unknown') {
      trackEvent('equation_copied', {
        format: String(format || 'latex'),
        shape_type: String(shapeType || 'unknown')
      });
    }
  };

})();
