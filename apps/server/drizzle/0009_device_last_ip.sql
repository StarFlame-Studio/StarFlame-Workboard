ALTER TABLE `devices` ADD COLUMN `last_ip` varchar(64);
--> statement-breakpoint
UPDATE `devices` d
JOIN (
  SELECT `actor_id`, SUBSTRING_INDEX(GROUP_CONCAT(`ip` ORDER BY `created_at` DESC), ',', 1) AS `ip`
  FROM `audit_logs`
  WHERE `actor_type` = 'device' AND `actor_id` IS NOT NULL AND `ip` IS NOT NULL AND `ip` <> ''
  GROUP BY `actor_id`
) a ON a.`actor_id` = d.`id`
SET d.`last_ip` = a.`ip`
WHERE d.`last_ip` IS NULL;
