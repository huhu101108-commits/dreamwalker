CREATE TABLE dw_reports (
  fingerprint TEXT PRIMARY KEY, runtime TEXT NOT NULL, message TEXT NOT NULL, stack TEXT NOT NULL,
  version TEXT NOT NULL, place TEXT NOT NULL, device TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1, first INTEGER NOT NULL, last INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX dw_reports_last ON dw_reports(last);
--> statement-breakpoint
CREATE TABLE dw_play_days (day TEXT NOT NULL, runtime TEXT NOT NULL, sessions INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day, runtime));
