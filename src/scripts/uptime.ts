/* Footer uptime counter — reads the build time from document.body[data-build-time]
   (set by BaseLayout) and updates the #uptime-val span every minute. No-op in
   error mode. */

const UPDATE_INTERVAL_MS = 60_000;

const uptimeEl = document.getElementById('uptime-val');
const buildTime = document.body.dataset.buildTime;

if (uptimeEl && buildTime && document.body.dataset.error !== 'true') {
  const bootDate = new Date(buildTime);

  function updateUptime(): void {
    const diff = Math.max(0, Date.now() - bootDate.getTime());
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    uptimeEl!.textContent = `${days}d ${hours}h ${mins}m`;
  }

  updateUptime();
  const interval = setInterval(updateUptime, UPDATE_INTERVAL_MS);
  window.addEventListener('beforeunload', () => clearInterval(interval));
}

export {};
