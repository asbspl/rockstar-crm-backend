# Rockstar CRM RBAC API

RBAC definitions are stored in PostgreSQL. The frontend loads active roles, permission definitions, module groups, role defaults, and effective user permissions through the endpoints below.

## Data model

- `roles` and `permissions` contain unique role codes and permission keys.
- `permission_modules` groups permissions. `permissions.module_id` links each definition to a module.
- `role_permissions` stores role defaults; `user_roles` stores user assignments.
- `user_permissions.effect` stores user overrides (`grant` or `deny`).
- Effective access is the union of active role defaults and explicit grants, minus explicit denials. A denial always wins.
- Existing user permission rows are migrated as `grant`; existing role and user assignments are preserved.

## Roles

All routes require authentication.

| Method | Path | Authorization | Purpose |
|---|---|---|---|
| GET | `/api/roles` | `users.read`, `roles.read`, or `settings.read` | List active and inactive roles, including assigned-user counts |
| POST | `/api/roles` | `roles.create` | Create a role; code is generated from its name unless supplied |
| PUT | `/api/roles/:id` | `roles.update` | Edit name/description or activate/deactivate |
| DELETE | `/api/roles/:id` | `roles.delete` | Delete only when no users are assigned |
| GET | `/api/roles/:id/permissions` | `users.read`, `roles.read`, `settings.read`, or `users.assign_permission` | Read active role defaults |
| PUT | `/api/roles/:id/permissions` | `permissions.assign` or `users.assign_permission` | Replace role defaults with `{"permissionIds":[1,2]}` or permission keys |

Built-in administrator roles cannot be edited or deleted by non-Super Admins. The Super Admin role cannot be deleted.

## Modules and permissions

All routes require authentication.

| Method | Path | Authorization | Purpose |
|---|---|---|---|
| GET | `/api/permissions` | `users.read`, `permissions.read`, or `settings.read` | List permission definitions with module and active status |
| POST | `/api/permissions` | `permissions.create` | Add a permission; its key must start with the selected module key |
| PUT | `/api/permissions/:id` | `permissions.update` | Edit a definition or activate/deactivate it |
| GET | `/api/permissions/modules` | `users.read`, `permissions.read`, or `settings.read` | List modules |
| POST | `/api/permissions/modules` | `modules.manage` | Add a module |
| PUT | `/api/permissions/modules/:id` | `modules.manage` | Edit or activate/deactivate a module |
| DELETE | `/api/permissions/modules/:id` | `modules.manage` | Delete only when no permission definitions use it |

Creating an inventory module with key `inventory` allows definitions such as `inventory.read` and `inventory.update`; these are returned by the same APIs and automatically appear in permission matrices.

## User access

All routes require authentication.

| Method | Path | Authorization | Purpose |
|---|---|---|---|
| GET | `/api/users/:id/roles` | `users.read` or `users.assign_role` | Read assigned roles |
| PUT | `/api/users/:id/roles` | `users.assign_role` | Replace roles without deleting existing user overrides |
| GET | `/api/users/:id/access` | `users.permissions.read` or `users.read` | Read roles, overrides, and effective permissions |
| PUT | `/api/users/:id/access` | Both `users.assign_role` and `users.permissions.update` | Atomically save role IDs and the desired effective permission IDs |
| GET | `/api/users/:id/permissions` | `users.permissions.read` or `users.read` | Read user permission overrides and effective permissions |
| PUT | `/api/users/:id/permissions` | `users.permissions.update` | Replace explicit grants and denials using `grantPermissionIds` and `denyPermissionIds` |
| GET | `/api/users/:id/effective-permissions` | `users.permissions.read` or `users.read` | Read the final effective permission set |

The combined access endpoint accepts:

```json
{
  "roleIds": [3],
  "permissionIds": [1, 2, 8]
}
```

`permissionIds` is the desired final effective set. The backend calculates the direct grant/deny overrides against the selected roles and saves the update in a transaction.

Registration approval remains at `PATCH /api/admin/registrations/:id/review` and accepts `decision`, `roleIds`, and `permissionIds`. For approval, `permissionIds` is likewise the desired effective set; when a role is chosen, its active defaults are automatically included by the frontend.

## Authorization and privilege boundaries

- Protected API handlers authorize against permissions resolved from the current database state, not the frontend.
- Inactive roles, permissions, and modules do not contribute effective access.
- Explicit user denials override role grants.
- Users cannot change their own roles or permission overrides through the access APIs.
- Only a Super Admin can assign administrator roles (Admin or Super Admin), edit built-in administrator roles, or manage permission definitions/modules.
- Non-Super Admins cannot grant administrative permission keys or permissions they do not hold.
- Database uniqueness and foreign-key constraints prevent duplicate definitions and invalid assignments.

## Migration

Run the backend migration command to apply `src/database/migrations/0019_dynamic_rbac.sql`. It adds module metadata and the grant/deny effect while retaining existing assignments and converting existing direct permissions to grants.
