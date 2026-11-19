ALTER TABLE `exam_subjects` MODIFY COLUMN `subject_id` char(26);--> statement-breakpoint
ALTER TABLE `exam_subjects` ADD `name` varchar(32);--> statement-breakpoint
ALTER TABLE `exams` ADD `room` varchar(64);