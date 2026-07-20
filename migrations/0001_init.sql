CREATE TABLE IF NOT EXISTS visits (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  path TEXT NOT NULL,
  host TEXT NOT NULL,
  referrer_host TEXT,
  referrer_url TEXT,
  title TEXT,
  user_agent TEXT,
  browser_name TEXT,
  browser_version TEXT,
  os_name TEXT,
  os_version TEXT,
  device_vendor TEXT,
  device_model TEXT,
  device_type TEXT,
  ip_address TEXT,
  country TEXT,
  city TEXT,
  language TEXT,
  timezone TEXT,
  screen TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  event_type TEXT NOT NULL DEFAULT 'pageview',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_visits_site_time ON visits(site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visits_site_country ON visits(site_id, country);
CREATE INDEX IF NOT EXISTS idx_visits_site_path ON visits(site_id, path);
CREATE INDEX IF NOT EXISTS idx_visits_ip ON visits(ip_address);
CREATE INDEX IF NOT EXISTS idx_visits_browser ON visits(browser_name);
CREATE INDEX IF NOT EXISTS idx_visits_device ON visits(device_model);

CREATE TABLE IF NOT EXISTS visit_visitors (
  visit_id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_visit_visitors_visitor ON visit_visitors(visitor_id);
