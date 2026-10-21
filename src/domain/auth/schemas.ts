import { z } from "zod";

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

const email = z.email("invalid_email").max(254, "too_long");
const password = z
  .string()
  .min(MIN_PASSWORD_LENGTH, "password_too_short")
  .max(MAX_PASSWORD_LENGTH, "too_long");

export const signUpSchema = z.object({
  name: z.string().trim().min(2, "too_short").max(80, "too_long"),
  email,
  password,
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "required").max(MAX_PASSWORD_LENGTH, "too_long"),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({ password });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const inviteMemberSchema = z.object({
  email,
  role: z.enum(["admin", "member", "door_staff"]),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
