CREATE TABLE `crowd_report_abuse_events` (
	`id` text PRIMARY KEY,
	`report_id` text,
	`ip_hash` text NOT NULL,
	`user_agent_hash` text,
	`client_fingerprint_hash` text,
	`turnstile_token_hash` text,
	`turnstile_outcome` text NOT NULL,
	`rate_limit_bucket_start_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_crowd_report_abuse_events_report_id_crowd_reports_id_fk` FOREIGN KEY (`report_id`) REFERENCES `crowd_reports`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `crowd_report_cluster_lines` (
	`cluster_id` text NOT NULL,
	`line_id` text NOT NULL,
	CONSTRAINT `crowd_report_cluster_lines_pk` PRIMARY KEY(`cluster_id`, `line_id`),
	CONSTRAINT `fk_crowd_report_cluster_lines_cluster_id_crowd_report_clusters_id_fk` FOREIGN KEY (`cluster_id`) REFERENCES `crowd_report_clusters`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_crowd_report_cluster_lines_line_id_lines_id_fk` FOREIGN KEY (`line_id`) REFERENCES `lines`(`id`)
);
--> statement-breakpoint
CREATE TABLE `crowd_report_cluster_stations` (
	`cluster_id` text NOT NULL,
	`station_id` text NOT NULL,
	CONSTRAINT `crowd_report_cluster_stations_pk` PRIMARY KEY(`cluster_id`, `station_id`),
	CONSTRAINT `fk_crowd_report_cluster_stations_cluster_id_crowd_report_clusters_id_fk` FOREIGN KEY (`cluster_id`) REFERENCES `crowd_report_clusters`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_crowd_report_cluster_stations_station_id_stations_id_fk` FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`)
);
--> statement-breakpoint
CREATE TABLE `crowd_report_clusters` (
	`id` text PRIMARY KEY,
	`effect` text,
	`window_start_at` text NOT NULL,
	`window_end_at` text NOT NULL,
	`report_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`dispatched_at` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `crowd_report_lines` (
	`report_id` text NOT NULL,
	`line_id` text NOT NULL,
	CONSTRAINT `crowd_report_lines_pk` PRIMARY KEY(`report_id`, `line_id`),
	CONSTRAINT `fk_crowd_report_lines_report_id_crowd_reports_id_fk` FOREIGN KEY (`report_id`) REFERENCES `crowd_reports`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_crowd_report_lines_line_id_lines_id_fk` FOREIGN KEY (`line_id`) REFERENCES `lines`(`id`)
);
--> statement-breakpoint
CREATE TABLE `crowd_report_moderation_events` (
	`id` text PRIMARY KEY,
	`report_id` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_crowd_report_moderation_events_report_id_crowd_reports_id_fk` FOREIGN KEY (`report_id`) REFERENCES `crowd_reports`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `crowd_report_rate_limits` (
	`ip_hash` text NOT NULL,
	`bucket_start_at` text NOT NULL,
	`submission_count` integer DEFAULT 0 NOT NULL,
	`client_fingerprint_hash` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `crowd_report_rate_limits_pk` PRIMARY KEY(`ip_hash`, `bucket_start_at`)
);
--> statement-breakpoint
CREATE TABLE `crowd_report_stations` (
	`report_id` text NOT NULL,
	`station_id` text NOT NULL,
	CONSTRAINT `crowd_report_stations_pk` PRIMARY KEY(`report_id`, `station_id`),
	CONSTRAINT `fk_crowd_report_stations_report_id_crowd_reports_id_fk` FOREIGN KEY (`report_id`) REFERENCES `crowd_reports`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_crowd_report_stations_station_id_stations_id_fk` FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`)
);
--> statement-breakpoint
CREATE TABLE `crowd_reports` (
	`id` text PRIMARY KEY,
	`observed_at` text NOT NULL,
	`direction_text` text,
	`effect` text,
	`delay_minutes` integer,
	`still_happening` integer,
	`text` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`cluster_id` text,
	`duplicate_of_id` text,
	`dispatched_at` text,
	`dispatch_payload` text,
	`dispatch_error` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_crowd_reports_cluster_id_crowd_report_clusters_id_fk` FOREIGN KEY (`cluster_id`) REFERENCES `crowd_report_clusters`(`id`),
	CONSTRAINT `fk_crowd_reports_duplicate_of_id_crowd_reports_id_fk` FOREIGN KEY (`duplicate_of_id`) REFERENCES `crowd_reports`(`id`) ON DELETE SET NULL,
	CONSTRAINT "crowd_reports_delay_minutes_check" CHECK("delay_minutes" is null or ("delay_minutes" >= 0 and "delay_minutes" <= 180))
);
--> statement-breakpoint
CREATE INDEX `crowd_report_abuse_events_report_id_idx` ON `crowd_report_abuse_events` (`report_id`);--> statement-breakpoint
CREATE INDEX `crowd_report_abuse_events_ip_hash_created_at_idx` ON `crowd_report_abuse_events` (`ip_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `crowd_report_cluster_lines_line_id_idx` ON `crowd_report_cluster_lines` (`line_id`);--> statement-breakpoint
CREATE INDEX `crowd_report_cluster_stations_station_id_idx` ON `crowd_report_cluster_stations` (`station_id`);--> statement-breakpoint
CREATE INDEX `crowd_report_clusters_status_idx` ON `crowd_report_clusters` (`status`);--> statement-breakpoint
CREATE INDEX `crowd_report_clusters_window_start_at_idx` ON `crowd_report_clusters` (`window_start_at`);--> statement-breakpoint
CREATE INDEX `crowd_report_lines_line_id_idx` ON `crowd_report_lines` (`line_id`);--> statement-breakpoint
CREATE INDEX `crowd_report_moderation_events_report_id_idx` ON `crowd_report_moderation_events` (`report_id`);--> statement-breakpoint
CREATE INDEX `crowd_report_moderation_events_created_at_idx` ON `crowd_report_moderation_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `crowd_report_rate_limits_bucket_start_at_idx` ON `crowd_report_rate_limits` (`bucket_start_at`);--> statement-breakpoint
CREATE INDEX `crowd_report_stations_station_id_idx` ON `crowd_report_stations` (`station_id`);--> statement-breakpoint
CREATE INDEX `crowd_reports_observed_at_idx` ON `crowd_reports` (`observed_at`);--> statement-breakpoint
CREATE INDEX `crowd_reports_status_idx` ON `crowd_reports` (`status`);--> statement-breakpoint
CREATE INDEX `crowd_reports_cluster_id_idx` ON `crowd_reports` (`cluster_id`);--> statement-breakpoint
CREATE INDEX `crowd_reports_duplicate_of_id_idx` ON `crowd_reports` (`duplicate_of_id`);--> statement-breakpoint
CREATE INDEX `evidences_issue_id_idx` ON `evidences` (`issue_id`);--> statement-breakpoint
CREATE INDEX `evidences_ts_idx` ON `evidences` (`ts`);--> statement-breakpoint
CREATE INDEX `impact_event_basis_evidences_impact_event_id_idx` ON `impact_event_basis_evidences` (`impact_event_id`);--> statement-breakpoint
CREATE INDEX `impact_event_basis_evidences_evidence_id_idx` ON `impact_event_basis_evidences` (`evidence_id`);--> statement-breakpoint
CREATE INDEX `impact_event_causes_impact_event_id_idx` ON `impact_event_causes` (`impact_event_id`);--> statement-breakpoint
CREATE INDEX `impact_event_entity_facilities_impact_event_id_idx` ON `impact_event_entity_facilities` (`impact_event_id`);--> statement-breakpoint
CREATE INDEX `impact_event_entity_facilities_station_id_idx` ON `impact_event_entity_facilities` (`station_id`);--> statement-breakpoint
CREATE INDEX `impact_event_entity_facilities_line_id_idx` ON `impact_event_entity_facilities` (`line_id`);--> statement-breakpoint
CREATE INDEX `impact_event_entity_services_impact_event_id_idx` ON `impact_event_entity_services` (`impact_event_id`);--> statement-breakpoint
CREATE INDEX `impact_event_entity_services_service_id_idx` ON `impact_event_entity_services` (`service_id`);--> statement-breakpoint
CREATE INDEX `impact_event_facility_effects_impact_event_id_idx` ON `impact_event_facility_effects` (`impact_event_id`);--> statement-breakpoint
CREATE INDEX `impact_event_facility_effects_kind_idx` ON `impact_event_facility_effects` (`kind`);--> statement-breakpoint
CREATE INDEX `impact_event_periods_start_at_idx` ON `impact_event_periods` (`start_ts`);--> statement-breakpoint
CREATE INDEX `impact_event_periods_end_at_idx` ON `impact_event_periods` (`end_ts`);--> statement-breakpoint
CREATE INDEX `impact_event_service_effects_impact_event_id_idx` ON `impact_event_service_effects` (`impact_event_id`);--> statement-breakpoint
CREATE INDEX `impact_event_service_effects_kind_idx` ON `impact_event_service_effects` (`kind`);--> statement-breakpoint
CREATE INDEX `impact_event_service_scopes_impact_event_id_idx` ON `impact_event_service_scopes` (`impact_event_id`);--> statement-breakpoint
CREATE INDEX `impact_event_service_scopes_type_idx` ON `impact_event_service_scopes` (`type`);--> statement-breakpoint
CREATE INDEX `impact_event_service_scopes_station_id_idx` ON `impact_event_service_scopes` (`station_id`);--> statement-breakpoint
CREATE INDEX `impact_event_service_scopes_from_station_id_idx` ON `impact_event_service_scopes` (`from_station_id`);--> statement-breakpoint
CREATE INDEX `impact_event_service_scopes_to_station_id_idx` ON `impact_event_service_scopes` (`to_station_id`);--> statement-breakpoint
CREATE INDEX `impact_events_issue_id_idx` ON `impact_events` (`issue_id`);--> statement-breakpoint
CREATE INDEX `issue_day_facts_issue_id_idx` ON `issue_day_facts` (`issue_id`);--> statement-breakpoint
CREATE INDEX `issue_day_facts_date_issue_type_idx` ON `issue_day_facts` (`date`,`issue_type`);--> statement-breakpoint
CREATE INDEX `issue_day_facts_as_of_idx` ON `issue_day_facts` (`as_of`);--> statement-breakpoint
CREATE INDEX `line_day_facts_line_id_idx` ON `line_day_facts` (`line_id`);--> statement-breakpoint
CREATE INDEX `line_day_facts_date_idx` ON `line_day_facts` (`date`);--> statement-breakpoint
CREATE INDEX `line_day_facts_as_of_idx` ON `line_day_facts` (`as_of`);--> statement-breakpoint
CREATE INDEX `line_operators_line_id_idx` ON `line_operators` (`line_id`);--> statement-breakpoint
CREATE INDEX `line_operators_operator_id_idx` ON `line_operators` (`operator_id`);--> statement-breakpoint
CREATE INDEX `line_services_line_id_idx` ON `line_services` (`line_id`);--> statement-breakpoint
CREATE INDEX `line_services_service_id_idx` ON `line_services` (`service_id`);--> statement-breakpoint
CREATE INDEX `service_revision_path_entries_service_revision_id_idx` ON `service_revision_path_station_entries` (`service_revision_id`);--> statement-breakpoint
CREATE INDEX `service_revision_path_entries_service_id_idx` ON `service_revision_path_station_entries` (`service_id`);--> statement-breakpoint
CREATE INDEX `service_revision_path_entries_station_id_idx` ON `service_revision_path_station_entries` (`station_id`);--> statement-breakpoint
CREATE INDEX `service_revision_path_entries_path_index_idx` ON `service_revision_path_station_entries` (`path_index`);--> statement-breakpoint
CREATE INDEX `service_revisions_service_id_idx` ON `service_revisions` (`service_id`);--> statement-breakpoint
CREATE INDEX `services_line_id_idx` ON `services` (`line_id`);--> statement-breakpoint
CREATE INDEX `station_codes_line_id_idx` ON `station_codes` (`line_id`);--> statement-breakpoint
CREATE INDEX `station_codes_station_id_idx` ON `station_codes` (`station_id`);--> statement-breakpoint
CREATE INDEX `station_landmarks_station_id_idx` ON `station_landmarks` (`station_id`);--> statement-breakpoint
CREATE INDEX `station_landmarks_landmark_id_idx` ON `station_landmarks` (`landmark_id`);--> statement-breakpoint
CREATE INDEX `stations_next_coordinates_idx` ON `stations_next` (`latitude`,`longitude`);--> statement-breakpoint
CREATE INDEX `stations_coordinates_idx` ON `stations` (`latitude`,`longitude`);
