PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_repo` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner` text NOT NULL,
	`full_name` text NOT NULL,
	`description` text,
	`stars` integer DEFAULT 0 NOT NULL,
	`language` text,
	`last_fetched_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_repo`("id", "name", "owner", "full_name", "description", "stars", "language", "last_fetched_at", "created_at", "updated_at") SELECT "id", "name", "owner", "full_name", "description", "stars", "language", "last_fetched_at", "created_at", "updated_at" FROM `repo`;--> statement-breakpoint
DROP TABLE `repo`;--> statement-breakpoint
ALTER TABLE `__new_repo` RENAME TO `repo`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_user_star` (
	`user_id` text NOT NULL,
	`repo_id` integer NOT NULL,
	`starred_at` integer NOT NULL,
	`last_checked_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `repo_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`repo_id`) REFERENCES `repo`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_user_star`("user_id", "repo_id", "starred_at", "last_checked_at") SELECT "user_id", "repo_id", "starred_at", "last_checked_at" FROM `user_star`;--> statement-breakpoint
DROP TABLE `user_star`;--> statement-breakpoint
ALTER TABLE `__new_user_star` RENAME TO `user_star`;