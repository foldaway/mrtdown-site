CREATE TABLE `statistics_snapshots` (
	`id` text PRIMARY KEY,
	`as_of` text NOT NULL,
	`data` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `statistics_snapshots_as_of_idx` ON `statistics_snapshots` (`as_of`);
