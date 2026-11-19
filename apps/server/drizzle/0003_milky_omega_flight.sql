CREATE TABLE `custom_cards` (
	`id` char(26) NOT NULL,
	`class_id` char(26) NOT NULL,
	`title` varchar(32) NOT NULL,
	`content` text,
	`sort_index` int NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `custom_cards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `custom_cards` ADD CONSTRAINT `custom_cards_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_custom_class` ON `custom_cards` (`class_id`,`sort_index`);