ALTER TABLE `devices` MODIFY COLUMN `role` enum('terminal','teacher','student','parent','guest') NOT NULL DEFAULT 'terminal';
