import { z } from "zod";
import { signupSchema } from "./identity.js";

/** Handles that would read as the platform speaking. */
export const reservedHandles = [
  "admin",
  "administrator",
  "api",
  "forma",
  "help",
  "moderator",
  "official",
  "root",
  "security",
  "staff",
  "support",
  "system",
];

const email = z.string().trim().toLowerCase().email().max(254);
// Length beats composition rules; the upper bound keeps hashing cost predictable.
const password = z.string().min(10, "PASSWORD_TOO_SHORT").max(200, "PASSWORD_TOO_LONG");

export const registerSchema = signupSchema.extend({ email, password }).strict();
export const loginSchema = z
  .object({
    login: z.string().trim().toLowerCase().min(3).max(254),
    password: z.string().min(1).max(200),
  })
  .strict();
export const forgotPasswordSchema = z.object({ email }).strict();
export const tokenSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
export const resetPasswordSchema = tokenSchema.extend({ password }).strict();
export const changePasswordSchema = z
  .object({ current: z.string().min(1).max(200), next: password })
  .strict();

export interface AccountView {
  userId: string;
  email: string | null;
  emailVerified: boolean;
  hasPassword: boolean;
}
export interface AuthState {
  mode: "demo" | "production";
  signedIn: boolean;
  account: AccountView | null;
  /** Whether "Continue with Google" is configured on this server. */
  google: boolean;
  moderator: boolean;
}
