const GA_MEASUREMENT_ID = "G-ZSMHP9G89F";
const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;

window.dataLayer = window.dataLayer || [];
window.gtag = window.gtag || function gtag() {
  window.dataLayer.push(arguments);
};

const cleanEventParams = (params = {}) => {
  const cleaned = {};

  for (const [key, value] of Object.entries(params)) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) cleaned[key] = value;
    if (typeof value === "boolean") cleaned[key] = value;
    if (typeof value === "string" && value) cleaned[key] = value.slice(0, 100);
  }

  return cleaned;
};

window.trackVoiceCheckerEvent = (name, params = {}) => {
  if (!EVENT_NAME_PATTERN.test(String(name || ""))) return;

  window.gtag("event", name, {
    ...cleanEventParams(params),
    page_path: window.location.pathname,
    transport_type: "beacon"
  });
};

const loadGoogleAnalytics = () => {
  if (window.__voiceCheckerAnalyticsLoaded) return;
  window.__voiceCheckerAnalyticsLoaded = true;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID);
};

const scheduleAnalytics = () => {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(loadGoogleAnalytics, { timeout: 2500 });
    return;
  }

  window.setTimeout(loadGoogleAnalytics, 1500);
};

const removeQueryParam = (name) => {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(name)) return;
  url.searchParams.delete(name);
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
};

const trackPageEvents = () => {
  const params = new URLSearchParams(window.location.search);

  if (window.location.pathname === "/pricing/" || window.location.pathname === "/pricing") {
    window.trackVoiceCheckerEvent("pricing_view");
  }

  if (params.get("login") === "success") {
    window.trackVoiceCheckerEvent("login_success");
    removeQueryParam("login");
  }

  if (params.get("checkout") === "success") {
    window.trackVoiceCheckerEvent("checkout_success_return", {
      plan: "pro_monthly",
      value: 9.9,
      currency: "USD"
    });
    removeQueryParam("checkout");
  }

  if (params.get("checkout") === "credits") {
    window.trackVoiceCheckerEvent("credit_checkout_return", {
      pack_checks: 20,
      value: 4.99,
      currency: "USD"
    });
    removeQueryParam("checkout");
  }
};

document.addEventListener("click", (event) => {
  const loginLink = event.target.closest?.('a[href^="/auth/google"]');
  if (loginLink) window.trackVoiceCheckerEvent("login_click");
});

document.addEventListener("submit", (event) => {
  const creditForm = event.target.closest?.('form[action="/api/credits/checkout"]');
  if (creditForm) {
    window.trackVoiceCheckerEvent("credit_checkout_start", {
      pack_checks: 20,
      value: 4.99,
      currency: "USD"
    });
    return;
  }

  const form = event.target.closest?.('form[action="/api/checkout"]');
  if (form) {
    window.trackVoiceCheckerEvent("checkout_start", {
      plan: "pro_monthly",
      value: 9.9,
      currency: "USD"
    });
  }
});

trackPageEvents();

if (document.readyState === "complete") {
  scheduleAnalytics();
} else {
  window.addEventListener("load", scheduleAnalytics, { once: true });
}
