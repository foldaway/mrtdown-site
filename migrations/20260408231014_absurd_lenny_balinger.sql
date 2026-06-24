CREATE TABLE `evidences` (
	`id` text PRIMARY KEY,
	`ts` text NOT NULL,
	`text` text NOT NULL,
	`type` text NOT NULL,
	`render` text,
	`source_url` text NOT NULL,
	`issue_id` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_evidences_issue_id_issues_id_fk` FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
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
	CONSTRAINT `fk_impact_event_causes_impact_event_id_impact_events_id_fk` FOREIGN KEY (`impact_event_id`) REFERENCES `impact_events`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
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
	CONSTRAINT `fk_impact_event_entity_facilities_line_id_lines_id_fk` FOREIGN KEY (`line_id`) REFERENCES `lines`(`id`)
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
	CONSTRAINT `fk_impact_event_facility_effects_impact_event_id_impact_events_id_fk` FOREIGN KEY (`impact_event_id`) REFERENCES `impact_events`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
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
	CONSTRAINT `fk_impact_event_service_effects_impact_event_id_impact_events_id_fk` FOREIGN KEY (`impact_event_id`) REFERENCES `impact_events`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
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
	`id` text PRIMARY KEY,
	`ts` text NOT NULL,
	`issue_id` text NOT NULL,
	`type` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_impact_events_issue_id_issues_id_fk` FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `issues_next` (
	`id` text PRIMARY KEY,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`title_meta` text NOT NULL,
	`hash` text NOT NULL,
	`evidences` text NOT NULL,
	`impact_events` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `issues` (
	`id` text PRIMARY KEY,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`title_meta` text NOT NULL,
	`hash` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `landmarks_next` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`hash` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `landmarks` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`hash` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
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
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`color` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`operating_hours` text NOT NULL,
	`hash` text NOT NULL,
	`operators` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lines` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`color` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`operating_hours` text NOT NULL,
	`hash` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `metadata` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `operators_next` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`founded_at` text NOT NULL,
	`url` text,
	`hash` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `operators` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`founded_at` text NOT NULL,
	`url` text,
	`hash` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `public_holidays` (
	`id` text PRIMARY KEY,
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
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`hash` text NOT NULL,
	`line_id` text NOT NULL,
	`revisions` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `services` (
	`id` text PRIMARY KEY,
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
	CONSTRAINT `fk_station_codes_station_id_stations_id_fk` FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`)
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
	`id` text PRIMARY KEY,
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
	`id` text PRIMARY KEY,
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
CREATE TABLE `towns_next` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`hash` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `towns` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`hash` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
