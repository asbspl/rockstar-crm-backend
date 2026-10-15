
const { z } = require("zod");

// Registration validation
const registerSchema = z
  .object({
    // Personal details
    name: z.string().trim().min(2).max(150).optional(),
    fullName: z.string().trim().min(2).max(150).optional(),

    phone: z.string().trim().min(8).max(20),

    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),

    password: z.string().min(8).max(128),

    // Address details
    addressLine1: z.string().trim().min(2).max(200).optional(),
    address_line1: z.string().trim().min(2).max(200).optional(),

    addressLine2: z.string().trim().max(200).optional(),
    address_line2: z.string().trim().max(200).optional(),

    location: z.string().trim().min(2).max(120).optional(),
    state: z.string().trim().min(2).max(120).optional(),
    city: z.string().trim().min(2).max(120).optional(),

    pinCode: z.string().trim().min(3).max(20).optional(),
    pin_code: z.string().trim().min(3).max(20).optional(),

    // KYC details
    panNumber: z.string().trim().max(20).optional(),
    pan: z.string().trim().max(20).optional(),

    aadhaarNumber: z.string().trim().max(20).optional(),
    aadhaar: z.string().trim().max(20).optional(),

    // Payment details
    upiId: z.string().trim().max(120).optional(),
    upi: z.string().trim().max(120).optional(),
    paymentUpi: z.string().trim().max(120).optional(),

    accountName: z.string().trim().max(150).optional(),
    accountNumber: z.string().trim().max(40).optional(),
    ifscCode: z.string().trim().max(20).optional(),

    // Privacy policy acceptance
    // FormData sends text values as strings.
    privacyAccepted: z
      .union([z.boolean(), z.string()])
      .transform((value) => value === true || value === "true")
      .refine((value) => value === true, {
        message: "Privacy policy must be accepted",
      }),
  })
  .strict()
  .refine((data) => data.name || data.fullName, {
    message: "Name is required",
    path: ["name"],
  })
  .refine((data) => data.addressLine1 || data.address_line1, {
    message: "Address line 1 is required",
    path: ["addressLine1"],
  })
  .refine((data) => data.location, {
    message: "Location is required",
    path: ["location"],
  })
  .refine((data) => data.state, {
    message: "State is required",
    path: ["state"],
  })
  .refine((data) => data.city, {
    message: "City is required",
    path: ["city"],
  })
  .refine((data) => data.pinCode || data.pin_code, {
    message: "PIN code is required",
    path: ["pinCode"],
  });

// Login validation
const loginSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),

    password: z.string().min(1).max(128),
  })
  .strict();

// Refresh token validation
const refreshTokenSchema = z
  .object({
    refreshToken: z.string().min(1).max(2000).optional(),
  })
  .strict();

// Change password validation
const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(8).max(128),
  })
  .strict();

// Request password reset validation
const requestPasswordResetSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
  })
  .strict();

// Reset password validation
const resetPasswordSchema = z
  .object({
    token: z.string().min(1).max(2000),
    newPassword: z.string().min(8).max(128),
  })
  .strict();

// Logout validation
const logoutSchema = z
  .object({
    refreshToken: z.string().min(1).max(2000).optional(),
  })
  .strict();

module.exports = {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  logoutSchema,
};
