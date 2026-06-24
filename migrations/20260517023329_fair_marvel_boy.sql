CREATE TABLE `issue_day_facts` (
	`date` text NOT NULL,
	`issue_id` text NOT NULL,
	`issue_type` text NOT NULL,
	`as_of` text NOT NULL,
	`active_anytime` integer NOT NULL,
	`active_end_of_day` integer NOT NULL,
	`duration_seconds` integer NOT NULL,
	`inferred_interval_count` integer NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `issue_day_facts_pk` PRIMARY KEY(`date`, `issue_id`),
	CONSTRAINT `fk_issue_day_facts_issue_id_issues_id_fk` FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `line_day_facts` (
	`date` text NOT NULL,
	`line_id` text NOT NULL,
	`as_of` text NOT NULL,
	`service_seconds` integer NOT NULL,
	`downtime_disruption_seconds` integer NOT NULL,
	`downtime_maintenance_seconds` integer NOT NULL,
	`downtime_infra_seconds` integer NOT NULL,
	`issue_count_disruption` integer NOT NULL,
	`issue_count_maintenance` integer NOT NULL,
	`issue_count_infra` integer NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `line_day_facts_pk` PRIMARY KEY(`date`, `line_id`),
	CONSTRAINT `fk_line_day_facts_line_id_lines_id_fk` FOREIGN KEY (`line_id`) REFERENCES `lines`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
