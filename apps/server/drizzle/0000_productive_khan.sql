CREATE TABLE `attendance_records` (
	`id` char(26) NOT NULL,
	`class_id` char(26) NOT NULL,
	`date` date NOT NULL,
	`student_id` char(26) NOT NULL,
	`status` enum('present','absent','late','excluded') NOT NULL DEFAULT 'present',
	`note` varchar(255),
	`updated_by` char(26),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `attendance_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `uk_attendance` UNIQUE(`class_id`,`date`,`student_id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` char(26) NOT NULL,
	`actor_type` enum('user','device','system') NOT NULL,
	`actor_id` char(26),
	`class_id` char(26),
	`action` varchar(64) NOT NULL,
	`target` varchar(128),
	`detail` json,
	`ip` varchar(64),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `classes` (
	`id` char(26) NOT NULL,
	`name` varchar(64) NOT NULL,
	`grade` varchar(16),
	`school` varchar(128),
	`join_code` varchar(12) NOT NULL,
	`password_hash` varchar(100) NOT NULL,
	`owner_id` char(26) NOT NULL,
	`settings` json,
	`status` enum('active','archived') NOT NULL DEFAULT 'active',
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `classes_id` PRIMARY KEY(`id`),
	CONSTRAINT `uk_classes_join_code` UNIQUE(`join_code`)
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` char(26) NOT NULL,
	`class_id` char(26) NOT NULL,
	`name` varchar(64) NOT NULL,
	`uuid` char(36) NOT NULL,
	`token_hash` char(64),
	`is_read_only` boolean NOT NULL DEFAULT false,
	`user_agent` varchar(255),
	`last_seen_at` datetime(3),
	`status` enum('active','revoked') NOT NULL DEFAULT 'active',
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `devices_id` PRIMARY KEY(`id`),
	CONSTRAINT `uk_devices_uuid` UNIQUE(`uuid`)
);
--> statement-breakpoint
CREATE TABLE `exam_subjects` (
	`id` char(26) NOT NULL,
	`exam_id` char(26) NOT NULL,
	`subject_id` char(26) NOT NULL,
	`start_at` datetime(3) NOT NULL,
	`end_at` datetime(3) NOT NULL,
	`room` varchar(64),
	`note` varchar(255),
	`sort_index` int NOT NULL DEFAULT 0,
	CONSTRAINT `exam_subjects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exams` (
	`id` char(26) NOT NULL,
	`class_id` char(26) NOT NULL,
	`title` varchar(64) NOT NULL,
	`note` varchar(255),
	`status` enum('planned','finished') NOT NULL DEFAULT 'planned',
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `exams_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `homework` (
	`id` char(26) NOT NULL,
	`class_id` char(26) NOT NULL,
	`subject_id` char(26) NOT NULL,
	`content` text,
	`due_date` date NOT NULL,
	`status` enum('draft','published') NOT NULL DEFAULT 'published',
	`pinned` boolean NOT NULL DEFAULT false,
	`version` int NOT NULL DEFAULT 1,
	`updated_by` char(26),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `homework_id` PRIMARY KEY(`id`),
	CONSTRAINT `uk_homework` UNIQUE(`class_id`,`subject_id`,`due_date`)
);
--> statement-breakpoint
CREATE TABLE `notices` (
	`id` char(26) NOT NULL,
	`class_id` char(26) NOT NULL,
	`title` varchar(64) NOT NULL,
	`content` text,
	`level` enum('info','urgent') NOT NULL DEFAULT 'info',
	`pinned` boolean NOT NULL DEFAULT false,
	`publish_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`expire_at` datetime(3),
	`created_by` char(26),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `notices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` char(26) NOT NULL,
	`subject_type` enum('user','device') NOT NULL,
	`subject_id` char(26) NOT NULL,
	`token_hash` char(64) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`revoked_at` datetime(3),
	`user_agent` varchar(255),
	`ip` varchar(64),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `refresh_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `uk_rt_hash` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` char(26) NOT NULL,
	`class_id` char(26) NOT NULL,
	`name` varchar(32) NOT NULL,
	`pinyin` varchar(64),
	`student_no` varchar(16),
	`status` enum('active','left') NOT NULL DEFAULT 'active',
	`sort_index` int NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `students_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` char(26) NOT NULL,
	`class_id` char(26) NOT NULL,
	`code` varchar(32) NOT NULL,
	`name` varchar(32) NOT NULL,
	`color` varchar(16),
	`icon` varchar(32),
	`sort_index` int NOT NULL DEFAULT 0,
	`enabled` boolean NOT NULL DEFAULT true,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `subjects_id` PRIMARY KEY(`id`),
	CONSTRAINT `uk_subjects_class_code` UNIQUE(`class_id`,`code`)
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`skey` varchar(64) NOT NULL,
	`value` json,
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `system_settings_skey` PRIMARY KEY(`skey`)
);
--> statement-breakpoint
CREATE TABLE `upload_assets` (
	`id` char(26) NOT NULL,
	`class_id` char(26),
	`owner_type` enum('user','device') NOT NULL,
	`owner_id` char(26) NOT NULL,
	`object_key` varchar(255) NOT NULL,
	`url` varchar(512) NOT NULL,
	`size` int NOT NULL DEFAULT 0,
	`mime` varchar(64),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `upload_assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` char(26) NOT NULL,
	`username` varchar(32) NOT NULL,
	`password_hash` varchar(100) NOT NULL,
	`name` varchar(32) NOT NULL,
	`role` enum('owner','admin','teacher') NOT NULL DEFAULT 'teacher',
	`avatar_url` varchar(255),
	`status` enum('active','disabled') NOT NULL DEFAULT 'active',
	`last_login_at` datetime(3),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `uk_users_username` UNIQUE(`username`)
);
--> statement-breakpoint
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `classes` ADD CONSTRAINT `classes_owner_id_users_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `devices` ADD CONSTRAINT `devices_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_subjects` ADD CONSTRAINT `exam_subjects_exam_id_exams_id_fk` FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exams` ADD CONSTRAINT `exams_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `homework` ADD CONSTRAINT `homework_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `homework` ADD CONSTRAINT `homework_subject_id_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notices` ADD CONSTRAINT `notices_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `students` ADD CONSTRAINT `students_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subjects` ADD CONSTRAINT `subjects_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_attendance_class_date` ON `attendance_records` (`class_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_audit_time` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_class` ON `audit_logs` (`class_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_classes_owner` ON `classes` (`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_devices_class` ON `devices` (`class_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_es_exam` ON `exam_subjects` (`exam_id`,`start_at`);--> statement-breakpoint
CREATE INDEX `idx_exams_class` ON `exams` (`class_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_homework_class_date` ON `homework` (`class_id`,`due_date`);--> statement-breakpoint
CREATE INDEX `idx_notices_class` ON `notices` (`class_id`,`pinned`,`publish_at`);--> statement-breakpoint
CREATE INDEX `idx_rt_subject` ON `refresh_tokens` (`subject_type`,`subject_id`);--> statement-breakpoint
CREATE INDEX `idx_students_class` ON `students` (`class_id`,`status`,`sort_index`);--> statement-breakpoint
CREATE INDEX `idx_upload_class` ON `upload_assets` (`class_id`,`created_at`);