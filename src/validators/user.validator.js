const { z } = require("zod");

const createUserSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  fullName: z.string().trim().min(2).max(150),
  password: z.string().min(8).max(128),
  status: z.enum(["active", "inactive"]).optional(),
  roles: z.array(z.string().trim().min(1)).optional().default([]),
}).strict();

const updateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(150).optional(),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  roles: z.array(z.string().trim().min(1)).optional(),
}).strict();

const updateUserStatusSchema = z.object({
  status: z.enum(["active", "inactive", "pending", "under_review", "approved", "rejected", "suspended"]).default("active"),
}).strict();

const approveApplicationSchema = z.object({
  roleCodes: z.array(z.string().trim().min(1)).min(1).optional(),
  roles: z.array(z.string().trim().min(1)).min(1).optional(),
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
  permissions: z.array(z.string().trim().min(1)).default([]),
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
};
