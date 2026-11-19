CREATE TABLE `student_lists` (
	`id` char(26) NOT NULL,
	`class_id` char(26) NOT NULL,
	`name` varchar(32) NOT NULL,
	`is_default` boolean NOT NULL DEFAULT false,
	`sort_index` int NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `student_lists_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `students` ADD `list_id` char(26);--> statement-breakpoint
ALTER TABLE `student_lists` ADD CONSTRAINT `student_lists_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_lists_class` ON `student_lists` (`class_id`,`sort_index`);