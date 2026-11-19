ALTER TABLE `users` ADD `email` varchar(128);--> statement-breakpoint
CREATE UNIQUE INDEX `uk_users_email` ON `users` (`email`);--> statement-breakpoint
ALTER TABLE `classes` ADD `class_code` varchar(32);--> statement-breakpoint
ALTER TABLE `classes` ADD `class_uid` varchar(32);--> statement-breakpoint
UPDATE `classes` SET `class_code` = UPPER(SUBSTRING(MD5(CONCAT(`id`, '-code')), 1, 8)), `class_uid` = CONCAT('C', UPPER(SUBSTRING(MD5(CONCAT(`id`, '-uid')), 1, 11)));--> statement-breakpoint
ALTER TABLE `classes` MODIFY `class_code` varchar(32) NOT NULL;--> statement-breakpoint
ALTER TABLE `classes` MODIFY `class_uid` varchar(32) NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uk_classes_class_code` ON `classes` (`class_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `uk_classes_class_uid` ON `classes` (`class_uid`);--> statement-breakpoint
ALTER TABLE `classes` MODIFY `join_code` varchar(12) NULL;--> statement-breakpoint
ALTER TABLE `classes` MODIFY `password_hash` varchar(100) NULL;--> statement-breakpoint
CREATE TABLE `class_access_codes` (
	`id` char(26) NOT NULL,
	`class_id` char(26) NOT NULL,
	`code` varchar(32) NOT NULL,
	`role` enum('terminal','teacher','student','parent') NOT NULL DEFAULT 'terminal',
	`permission` enum('read','write') NOT NULL DEFAULT 'read',
	`label` varchar(64),
	`enabled` boolean NOT NULL DEFAULT true,
	`expires_at` datetime(3),
	`last_used_at` datetime(3),
	`created_by` char(26),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `class_access_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `uk_access_class_code` UNIQUE(`class_id`,`code`)
);--> statement-breakpoint
ALTER TABLE `class_access_codes` ADD CONSTRAINT `class_access_codes_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_access_class` ON `class_access_codes` (`class_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `class_members` (
	`class_id` char(26) NOT NULL,
	`user_id` char(26) NOT NULL,
	`role` enum('owner','teacher') NOT NULL DEFAULT 'teacher',
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `class_members_class_id_user_id_pk` PRIMARY KEY(`class_id`,`user_id`)
);--> statement-breakpoint
ALTER TABLE `class_members` ADD CONSTRAINT `class_members_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `class_members` ADD CONSTRAINT `class_members_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_members_user` ON `class_members` (`user_id`);--> statement-breakpoint
ALTER TABLE `devices` ADD `access_code_id` char(26);--> statement-breakpoint
ALTER TABLE `devices` ADD `role` enum('terminal','teacher','student','parent') NOT NULL DEFAULT 'terminal';--> statement-breakpoint
ALTER TABLE `devices` ADD `permission` enum('read','write') NOT NULL DEFAULT 'write';--> statement-breakpoint
CREATE INDEX `idx_devices_access` ON `devices` (`access_code_id`);--> statement-breakpoint
INSERT INTO `class_access_codes` (`id`,`class_id`,`code`,`role`,`permission`,`label`,`enabled`,`created_by`,`created_at`,`updated_at`)
SELECT CONCAT('AC', SUBSTRING(MD5(CONCAT(c.`id`,'-legacy')), 1, 24)), c.`id`, UPPER(SUBSTRING(MD5(CONCAT(c.`id`,'-access')), 1, 10)), 'terminal', 'write', '迁移自动生成 · 原一体机授权码', true, c.`owner_id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3) FROM `classes` c;--> statement-breakpoint
UPDATE `devices` d JOIN `class_access_codes` a ON a.`class_id` = d.`class_id` SET d.`access_code_id` = a.`id`, d.`role` = 'terminal', d.`permission` = IF(d.`is_read_only`, 'read', 'write');--> statement-breakpoint
INSERT INTO `class_members` (`class_id`,`user_id`,`role`,`created_at`)
SELECT `id`, `owner_id`, 'owner', CURRENT_TIMESTAMP(3) FROM `classes`;
