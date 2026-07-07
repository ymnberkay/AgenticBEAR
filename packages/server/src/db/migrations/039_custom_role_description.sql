-- Free-text description for custom roles.
ALTER TABLE custom_roles ADD COLUMN description TEXT NOT NULL DEFAULT '';
