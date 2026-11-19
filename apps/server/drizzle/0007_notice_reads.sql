CREATE TABLE `notice_reads` (
	`notice_id` char(26) NOT NULL,
	`device_id` char(26) NOT NULL,
	`read_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `notice_reads_notice_id_device_id_pk` PRIMARY KEY(`notice_id`,`device_id`)
);--> statement-breakpoint
ALTER TABLE `notice_reads` ADD CONSTRAINT `notice_reads_notice_id_notices_id_fk` FOREIGN KEY (`notice_id`) REFERENCES `notices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notice_reads` ADD CONSTRAINT `notice_reads_device_id_devices_id_fk` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_notice_reads_device` ON `notice_reads` (`device_id`);
