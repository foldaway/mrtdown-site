CREATE TABLE `crowd_report_abuse_events` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text,
	`ip_hash` text NOT NULL,
	`user_agent_hash` text,
	`client_fingerprint_hash` text,
	`turnstile_token_hash` text,
	`turnstile_outcome` text NOT NULL,
	`rate_limit_bucket_start_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_crowd_report_abuse_events_report_id_crowd_reports_id_fk` FOREIGN KEY (`report_id`) REFERENCES `crowd_reports`(`id`) ON DELETE CASCADE,
	CONSTRAINT "crowd_report_abuse_events_turnstile_outcome_check" CHECK("turnstile_outcome" is null or "turnstile_outcome" in ('skipped', 'passed', 'missing_token', 'failed'))
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
	`id` text PRIMARY KEY NOT NULL,
	`effect` text,
	`window_start_at` text NOT NULL,
	`window_end_at` text NOT NULL,
	`report_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`dispatched_at` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "crowd_report_clusters_effect_check" CHECK("effect" is null or "effect" in ('delay', 'no-service', 'crowding', 'skipped-stop', 'unknown')),
	CONSTRAINT "crowd_report_clusters_status_check" CHECK("status" is null or "status" in ('pending', 'accepted', 'rejected', 'dispatched'))
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
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_crowd_report_moderation_events_report_id_crowd_reports_id_fk` FOREIGN KEY (`report_id`) REFERENCES `crowd_reports`(`id`) ON DELETE CASCADE,
	CONSTRAINT "crowd_report_moderation_events_actor_check" CHECK("actor" is null or "actor" in ('system')),
	CONSTRAINT "crowd_report_moderation_events_action_check" CHECK("action" is null or "action" in ('submitted', 'automated_accepted', 'automated_duplicate', 'automated_rejected'))
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
	`id` text PRIMARY KEY NOT NULL,
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
	CONSTRAINT "crowd_reports_effect_check" CHECK("effect" is null or "effect" in ('delay', 'no-service', 'crowding', 'skipped-stop', 'unknown')),
	CONSTRAINT "crowd_reports_status_check" CHECK("status" is null or "status" in ('pending', 'accepted', 'rejected', 'duplicate', 'dispatched')),
	CONSTRAINT "crowd_reports_still_happening_check" CHECK("still_happening" is null or "still_happening" in (0, 1)),
	CONSTRAINT "crowd_reports_dispatch_payload_json_check" CHECK("dispatch_payload" is null or json_valid("dispatch_payload")),
	CONSTRAINT "crowd_reports_delay_minutes_check" CHECK("delay_minutes" is null or ("delay_minutes" >= 0 and "delay_minutes" <= 180))
);
--> statement-breakpoint
CREATE TABLE `evidences` (
	`id` text PRIMARY KEY NOT NULL,
	`ts` text NOT NULL,
	`text` text NOT NULL,
	`type` text NOT NULL,
	`render` text,
	`source_url` text NOT NULL,
	`issue_id` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_evidences_issue_id_issues_id_fk` FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT "evidences_type_check" CHECK("type" is null or "type" in ('statement.official', 'report.public', 'report.media')),
	CONSTRAINT "evidences_render_json_check" CHECK("render" is null or json_valid("render"))
);
--> statement-breakpoint
CREATE TABLE `impact_event_basis_evidences` (
	`impact_event_id` text NOT NULL,
	`evidence_id` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `impact_event_basis_evidences_pk` PRIMARY KEY(`impact_event_id`, `evidence_id`),
	CONSTRAINT `fk_impact_event_basis_evidences_impact_event_id_impact_events_id_fk` FOREIGN KEY (`impact_event_id`) REFERENCES `impact_events`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_impact_event_basis_evidences_evidence_id_evidences_id_fk` FOREIGN KEY (`evidence_id`) REFERENCES `evidences`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `impact_event_causes` (
	`impact_event_id` text NOT NULL,
	`type` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `impact_event_causes_pk` PRIMARY KEY(`impact_event_id`, `type`),
	CONSTRAINT `fk_impact_event_causes_impact_event_id_impact_events_id_fk` FOREIGN KEY (`impact_event_id`) REFERENCES `impact_events`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT "impact_event_causes_type_check" CHECK("type" is null or "type" in ('signal.fault', 'track.fault', 'train.fault', 'power.fault', 'station.fault', 'security', 'weather', 'passenger.incident', 'platform_door.fault', 'delay', 'track.work', 'system.upgrade', 'elevator.outage', 'escalator.outage', 'air_conditioning.issue', 'station.renovation'))
);
--> statement-breakpoint
CREATE TABLE `impact_event_entity_facilities` (
	`impact_event_id` text NOT NULL,
	`station_id` text NOT NULL,
	`line_id` text,
	`kind` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `impact_event_entity_facilities_pk` PRIMARY KEY(`impact_event_id`, `station_id`, `kind`),
	CONSTRAINT `fk_impact_event_entity_facilities_impact_event_id_impact_events_id_fk` FOREIGN KEY (`impact_event_id`) REFERENCES `impact_events`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_impact_event_entity_facilities_station_id_stations_id_fk` FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`),
	CONSTRAINT `fk_impact_event_entity_facilities_line_id_lines_id_fk` FOREIGN KEY (`line_id`) REFERENCES `lines`(`id`),
	CONSTRAINT "impact_event_entity_facilities_kind_check" CHECK("kind" is null or "kind" in ('lift', 'escalator', 'screen-door'))
);
--> statement-breakpoint
CREATE TABLE `impact_event_entity_services` (
	`impact_event_id` text NOT NULL,
	`service_id` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `impact_event_entity_services_pk` PRIMARY KEY(`impact_event_id`, `service_id`),
	CONSTRAINT `fk_impact_event_entity_services_impact_event_id_impact_events_id_fk` FOREIGN KEY (`impact_event_id`) REFERENCES `impact_events`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_impact_event_entity_services_service_id_services_id_fk` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`)
);
--> statement-breakpoint
CREATE TABLE `impact_event_facility_effects` (
	`impact_event_id` text NOT NULL,
	`kind` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `impact_event_facility_effects_pk` PRIMARY KEY(`impact_event_id`, `kind`),
	CONSTRAINT `fk_impact_event_facility_effects_impact_event_id_impact_events_id_fk` FOREIGN KEY (`impact_event_id`) REFERENCES `impact_events`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT "impact_event_facility_effects_kind_check" CHECK("kind" is null or "kind" in ('out-of-service', 'degraded'))
);
--> statement-breakpoint
CREATE TABLE `impact_event_periods` (
	`impact_event_id` text NOT NULL,
	`index` integer NOT NULL,
	`start_ts` text NOT NULL,
	`end_ts` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `impact_event_periods_pk` PRIMARY KEY(`impact_event_id`, `index`),
	CONSTRAINT `fk_impact_event_periods_impact_event_id_impact_events_id_fk` FOREIGN KEY (`impact_event_id`) REFERENCES `impact_events`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `impact_event_service_effects` (
	`impact_event_id` text NOT NULL,
	`kind` text NOT NULL,
	`duration` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `impact_event_service_effects_pk` PRIMARY KEY(`impact_event_id`, `kind`),
	CONSTRAINT `fk_impact_event_service_effects_impact_event_id_impact_events_id_fk` FOREIGN KEY (`impact_event_id`) REFERENCES `impact_events`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT "impact_event_service_effects_kind_check" CHECK("kind" is null or "kind" in ('delay', 'no-service', 'reduced-service', 'service-hours-adjustment'))
);
--> statement-breakpoint
CREATE TABLE `impact_event_service_scopes` (
	`impact_event_id` text NOT NULL,
	`index` integer NOT NULL,
	`type` text NOT NULL,
	`station_id` text,
	`from_station_id` text,
	`to_station_id` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `impact_event_service_scopes_pk` PRIMARY KEY(`impact_event_id`, `index`),
	CONSTRAINT `fk_impact_event_service_scopes_impact_event_id_impact_events_id_fk` FOREIGN KEY (`impact_event_id`) REFERENCES `impact_events`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT `fk_impact_event_service_scopes_station_id_stations_id_fk` FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`),
	CONSTRAINT `fk_impact_event_service_scopes_from_station_id_stations_id_fk` FOREIGN KEY (`from_station_id`) REFERENCES `stations`(`id`),
	CONSTRAINT `fk_impact_event_service_scopes_to_station_id_stations_id_fk` FOREIGN KEY (`to_station_id`) REFERENCES `stations`(`id`),
	CONSTRAINT "impact_event_service_scopes_type_check" CHECK("type" is null or "type" in ('service.whole', 'service.segment', 'service.point')),
	CONSTRAINT "impact_event_service_scopes_type_station_shape_check" CHECK(
          (
            "type" = 'service.whole'
            and "station_id" is null
            and "from_station_id" is null
            and "to_station_id" is null
          )
          or (
            "type" = 'service.point'
            and "station_id" is not null
            and "from_station_id" is null
            and "to_station_id" is null
          )
          or (
            "type" = 'service.segment'
            and "station_id" is null
            and "from_station_id" is not null
            and "to_station_id" is not null
          )
        )
);
--> statement-breakpoint
CREATE TABLE `impact_events` (
	`id` text PRIMARY KEY NOT NULL,
	`ts` text NOT NULL,
	`issue_id` text NOT NULL,
	`type` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_impact_events_issue_id_issues_id_fk` FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT "impact_events_type_check" CHECK("type" is null or "type" in ('periods.set', 'service_scopes.set', 'service_effects.set', 'facility_effects.set', 'causes.set'))
);
--> statement-breakpoint
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
	CONSTRAINT `fk_issue_day_facts_issue_id_issues_id_fk` FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE CASCADE ON DELETE CASCADE,
	CONSTRAINT "issue_day_facts_issue_type_check" CHECK("issue_type" is null or "issue_type" in ('disruption', 'maintenance', 'infra')),
	CONSTRAINT "issue_day_facts_active_anytime_check" CHECK("active_anytime" in (0, 1)),
	CONSTRAINT "issue_day_facts_active_end_of_day_check" CHECK("active_end_of_day" in (0, 1))
);
--> statement-breakpoint
CREATE TABLE `issues_next` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`title_meta` text NOT NULL,
	`hash` text NOT NULL,
	`evidences` text NOT NULL,
	`impact_events` text NOT NULL,
	CONSTRAINT "issues_next_type_check" CHECK("type" is null or "type" in ('disruption', 'maintenance', 'infra')),
	CONSTRAINT "issues_next_title_json_check" CHECK("title" is null or json_valid("title")),
	CONSTRAINT "issues_next_title_meta_json_check" CHECK("title_meta" is null or json_valid("title_meta")),
	CONSTRAINT "issues_next_evidences_json_check" CHECK("evidences" is null or json_valid("evidences")),
	CONSTRAINT "issues_next_impact_events_json_check" CHECK("impact_events" is null or json_valid("impact_events"))
);
--> statement-breakpoint
CREATE TABLE `issues` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`title_meta` text NOT NULL,
	`hash` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "issues_type_check" CHECK("type" is null or "type" in ('disruption', 'maintenance', 'infra')),
	CONSTRAINT "issues_title_json_check" CHECK("title" is null or json_valid("title")),
	CONSTRAINT "issues_title_meta_json_check" CHECK("title_meta" is null or json_valid("title_meta"))
);
--> statement-breakpoint
CREATE TABLE `landmarks_next` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`hash` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `landmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`hash` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
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
--> statement-breakpoint
CREATE TABLE `line_operators` (
	`line_id` text NOT NULL,
	`operator_id` text NOT NULL,
	`started_at` text,
	`ended_at` text,
	`hash` text NOT NULL,
	CONSTRAINT `line_operators_pk` PRIMARY KEY(`line_id`, `operator_id`),
	CONSTRAINT `fk_line_operators_line_id_lines_id_fk` FOREIGN KEY (`line_id`) REFERENCES `lines`(`id`),
	CONSTRAINT `fk_line_operators_operator_id_operators_id_fk` FOREIGN KEY (`operator_id`) REFERENCES `operators`(`id`)
);
--> statement-breakpoint
CREATE TABLE `line_services` (
	`line_id` text NOT NULL,
	`service_id` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `line_services_pk` PRIMARY KEY(`line_id`, `service_id`),
	CONSTRAINT `fk_line_services_line_id_lines_id_fk` FOREIGN KEY (`line_id`) REFERENCES `lines`(`id`),
	CONSTRAINT `fk_line_services_service_id_services_id_fk` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`)
);
--> statement-breakpoint
CREATE TABLE `lines_next` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`color` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`operating_hours` text NOT NULL,
	`hash` text NOT NULL,
	`operators` text NOT NULL,
	CONSTRAINT "lines_next_type_check" CHECK("type" is null or "type" in ('mrt.high', 'mrt.medium', 'lrt')),
	CONSTRAINT "lines_next_name_json_check" CHECK("name" is null or json_valid("name")),
	CONSTRAINT "lines_next_operating_hours_json_check" CHECK("operating_hours" is null or json_valid("operating_hours")),
	CONSTRAINT "lines_next_operators_json_check" CHECK("operators" is null or json_valid("operators"))
);
--> statement-breakpoint
CREATE TABLE `lines` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`color` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`operating_hours` text NOT NULL,
	`hash` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "lines_type_check" CHECK("type" is null or "type" in ('mrt.high', 'mrt.medium', 'lrt')),
	CONSTRAINT "lines_name_json_check" CHECK("name" is null or json_valid("name")),
	CONSTRAINT "lines_operating_hours_json_check" CHECK("operating_hours" is null or json_valid("operating_hours"))
);
--> statement-breakpoint
CREATE TABLE `metadata` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `operators_next` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`founded_at` text NOT NULL,
	`url` text,
	`hash` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `operators` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`founded_at` text NOT NULL,
	`url` text,
	`hash` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `public_holidays` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`holiday_name` text NOT NULL,
	`hash` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `service_revision_path_station_entries` (
	`service_revision_id` text NOT NULL,
	`service_id` text NOT NULL,
	`station_id` text NOT NULL,
	`display_code` text NOT NULL,
	`path_index` integer NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `sr_path_entries_pk` PRIMARY KEY(`service_revision_id`, `service_id`, `station_id`, `path_index`),
	CONSTRAINT `sr_path_entries_revision_fk` FOREIGN KEY (`service_revision_id`,`service_id`) REFERENCES `service_revisions`(`id`,`service_id`),
	CONSTRAINT `sr_path_entries_station_fk` FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`)
);
--> statement-breakpoint
CREATE TABLE `service_revisions` (
	`id` text NOT NULL,
	`service_id` text NOT NULL,
	`start_at` text,
	`end_at` text,
	`operating_hours` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `service_revisions_pk` PRIMARY KEY(`id`, `service_id`),
	CONSTRAINT `fk_service_revisions_service_id_services_id_fk` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`)
);
--> statement-breakpoint
CREATE TABLE `services_next` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`hash` text NOT NULL,
	`line_id` text NOT NULL,
	`revisions` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `services` (
	`id` text PRIMARY KEY NOT NULL,
	`line_id` text NOT NULL,
	`name` text NOT NULL,
	`hash` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_services_line_id_lines_id_fk` FOREIGN KEY (`line_id`) REFERENCES `lines`(`id`)
);
--> statement-breakpoint
CREATE TABLE `station_codes` (
	`line_id` text NOT NULL,
	`station_id` text NOT NULL,
	`code` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`structure_type` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `station_codes_pk` PRIMARY KEY(`line_id`, `station_id`, `code`),
	CONSTRAINT `fk_station_codes_line_id_lines_id_fk` FOREIGN KEY (`line_id`) REFERENCES `lines`(`id`),
	CONSTRAINT `fk_station_codes_station_id_stations_id_fk` FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`),
	CONSTRAINT "station_codes_structure_type_check" CHECK("structure_type" is null or "structure_type" in ('elevated', 'underground', 'at_grade', 'in_building'))
);
--> statement-breakpoint
CREATE TABLE `station_landmarks` (
	`station_id` text NOT NULL,
	`landmark_id` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `station_landmarks_pk` PRIMARY KEY(`station_id`, `landmark_id`),
	CONSTRAINT `fk_station_landmarks_station_id_stations_id_fk` FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`),
	CONSTRAINT `fk_station_landmarks_landmark_id_landmarks_id_fk` FOREIGN KEY (`landmark_id`) REFERENCES `landmarks`(`id`)
);
--> statement-breakpoint
CREATE TABLE `stations_next` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`hash` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`town_id` text NOT NULL,
	`station_codes` text NOT NULL,
	`landmark_ids` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`hash` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`town_id` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_stations_town_id_towns_id_fk` FOREIGN KEY (`town_id`) REFERENCES `towns`(`id`)
);
--> statement-breakpoint
CREATE TABLE `statistics_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`as_of` text NOT NULL,
	`data` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `towns_next` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`hash` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `towns` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`hash` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
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
CREATE INDEX `stations_coordinates_idx` ON `stations` (`latitude`,`longitude`);--> statement-breakpoint
CREATE INDEX `statistics_snapshots_as_of_idx` ON `statistics_snapshots` (`as_of`);