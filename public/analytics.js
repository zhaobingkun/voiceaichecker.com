const GA_MEASUREMENT_ID = "G-ZSMHP9G89F";

window.dataLayer = window.dataLayer || [];
window.gtag = window.gtag || function gtag() {
  window.dataLayer.push(arguments);
};

const loadGoogleAnalytics = () => {
  if (window.__voiceCheckerAnalyticsLoaded) {
    return;
  }

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

if (document.readyState === "complete") {
  scheduleAnalytics();
} else {
  window.addEventListener("load", scheduleAnalytics, { once: true });
}
