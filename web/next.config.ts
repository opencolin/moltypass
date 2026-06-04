import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // typedRoutes is intentionally OFF: several sidebar links in the
  // (dashboard) section point at routes the dashboard workstream
  // hasn't built yet (/grants, /keys, /devices, /anomalies, /policy,
  // /tokens). They render as stubs from the overview page. Re-enable
  // once those routes ship in v2.x.
};

export default nextConfig;
