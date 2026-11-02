const { z } = require("zod");

const createUserSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  fullName: z.string().trim().min(2).max(150),
  password: z.string().min(8).max(128),
  status: z.enum(["active", "inactive"]).optional(),
}).strict();

const updateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(150).optional(),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()).optional(),
  status: z.enum(["active", "inactive"]).optional(),
}).strict();

const updateUserStatusSchema = z.object({
  status: z.enum(["active", "inactive", "pending", "under_review", "approved", "rejected", "suspended"]).default("active"),
}).strict();

const approveApplicationSchema = z.object({
  roleCodes: z.array(z.string().trim().min(1)).min(1).optional(),
  roles: z.array(z.string().trim().min(1)).min(1).optional(),
  permissionIds: z.array(z.number().int().positive()).optional(),
  notes: z.string().trim().max(2000).optional(),
}).strict();

const rejectApplicationSchema = z.object({
  reason: z.string().trim().min(2).max(2000),
}).strict();

const requestCorrectionsSchema = z.object({
  notes: z.string().trim().min(2).max(2000),
}).strict();

const assignUserRolesSchema = z.object({
  roles: z.array(z.string().trim().min(1)).default([]),
}).strict();

const updateRolePermissionsSchema = z.object({
  permissions: z.array(z.union([
    z.string().trim().min(1),
    z.number().int().positive(),
  ])).optional(),
  permissionIds: z.array(z.number().int().positive()).optional(),
}).strict();

const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(128),
  code: z.string().trim().regex(/^[A-Za-z0-9_]{2,64}$/).optional(),
  description: z.string().trim().max(2000).optional(),
}).strict();

const updateRoleSchema = z.object({
  name: z.string().trim().min(2).max(128).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
}).strict();

const createModuleSchema = z.object({
  key: z.string().trim().regex(/^[a-zA-Z0-9_-]{2,64}$/).optional(),
  name: z.string().trim().min(2).max(128),
  description: z.string().trim().max(2000).optional(),
}).strict();

const updateModuleSchema = z.object({
  name: z.string().trim().min(2).max(128).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
}).strict();

const createPermissionSchema = z.object({
  key: z.string().trim().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*(\.[a-zA-Z0-9][a-zA-Z0-9_-]*)+$/),
  name: z.string().trim().min(2).max(128),
  description: z.string().trim().max(2000).optional(),
  moduleId: z.number().int().positive(),
}).strict();

const updatePermissionSchema = z.object({
  key: z.string().trim().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*(\.[a-zA-Z0-9][a-zA-Z0-9_-]*)+$/).optional(),
  name: z.string().trim().min(2).max(128).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  moduleId: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
}).strict();

const updateUserAccessSchema = z.object({
  roleIds: z.array(z.number().int().positive()),
  permissionIds: z.array(z.number().int().positive()),
}).strict();

const updateUserPermissionOverridesSchema = z.object({
  grantPermissionIds: z.array(z.number().int().positive()),
  denyPermissionIds: z.array(z.number().int().positive()),
}).strict();

module.exports = {
  createUserSchema,
  updateUserSchema,
  updateUserStatusSchema,
  approveApplicationSchema,
  rejectApplicationSchema,
  requestCorrectionsSchema,
  assignUserRolesSchema,
  updateRolePermissionsSchema,
  createRoleSchema,
  updateRoleSchema,
  createModuleSchema,
  updateModuleSchema,
  createPermissionSchema,
  updatePermissionSchema,
  updateUserAccessSchema,
  updateUserPermissionOverridesSchema,
};
