CREATE TABLE `teachers` (
	`id` char(26) NOT NULL,
	`class_id` char(26) NOT NULL,
	`name` varchar(32) NOT NULL,
	`subject` varchar(32),
	`is_head_teacher` boolean NOT NULL DEFAULT false,
	`sort_index` int NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `teachers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `teachers` ADD CONSTRAINT `teachers_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_teachers_class` ON `teachers` (`class_id`,`sort_index`);