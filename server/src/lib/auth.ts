import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { prisma } from "./prisma.js";
import { emailLanguage, passwordResetEmail, sendEmail, verificationEmail } from "./email.js";
import { USAGE_TYPES, isStrongPassword, isUsageType } from "@ocrinvoice/shared";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    // A new password closes the other sessions of the account (CA-02.14).
    revokeSessionsOnPasswordReset: true,
  },
  session: {
    // 60 days from the last use: the expiry is pushed forward at most once a day while the app is used.
    expiresIn: 60 * 60 * 24 * 60,
    updateAge: 60 * 60 * 24,
  },
  emailVerification: {
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
  },
  user: {
    additionalFields: {
      usageType: {
        type: [...USAGE_TYPES],
        required: false,
        defaultValue: "PERSONAL",
        input: true,
      },
    },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    customRules: {
      "/sign-in/email": {
        window: 60,
        max: 5,
      },
      "/change-password": {
        window: 60,
        max: 5,
      },
      "/email-otp/send-verification-otp": {
        window: 60,
        max: 5,
      },
      "/email-otp/verify-email": {
        window: 60,
        max: 10,
      },
      "/email-otp/request-password-reset": {
        window: 60,
        max: 5,
      },
      "/email-otp/reset-password": {
        window: 60,
        max: 10,
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/change-password") {
        if (typeof ctx.body?.newPassword !== "string" || !isStrongPassword(ctx.body.newPassword)) {
          throw new APIError("BAD_REQUEST", {
            code: "PASSWORD_TOO_WEAK",
            message: "Password must have at least 8 characters, one digit and one uppercase letter",
          });
        }
        if (ctx.body.newPassword === ctx.body.currentPassword) {
          throw new APIError("BAD_REQUEST", {
            code: "PASSWORD_SAME_AS_CURRENT",
            message: "The new password must be different from the current one",
          });
        }
        // A new password always closes the other sessions; the current one is renewed and stays active (CA-02.18).
        return { context: { ...ctx, body: { ...ctx.body, revokeOtherSessions: true } } };
      }
      if (ctx.path !== "/sign-up/email" && ctx.path !== "/email-otp/reset-password") {
        return;
      }
      // Checked before the reset code is used, so a weak password does not burn the code.
      const password = ctx.body?.password;
      if (typeof password !== "string" || !isStrongPassword(password)) {
        throw new APIError("BAD_REQUEST", {
          code: "PASSWORD_TOO_WEAK",
          message: "Password must have at least 8 characters, one digit and one uppercase letter",
        });
      }
      if (ctx.path !== "/sign-up/email") {
        return;
      }
      const usageType = ctx.body?.usageType;
      if (usageType !== undefined && !isUsageType(usageType)) {
        throw new APIError("BAD_REQUEST", {
          code: "INVALID_USAGE_TYPE",
          message: "usageType must be PERSONAL or COMPANY",
        });
      }
    }),
  },
  plugins: [
    expo(),
    emailOTP({
      overrideDefaultEmailVerification: true,
      otpLength: 6,
      expiresIn: 300,
      storeOTP: "hashed",
      async sendVerificationOTP({ email, otp, type }, ctx) {
        if (process.env.NODE_ENV === "development") {
          console.log(`[email-otp] ${type} ${email}: ${otp}`);
        }
        const language = emailLanguage(ctx?.headers?.get("accept-language") ?? ctx?.request?.headers.get("accept-language"));
        if (type === "email-verification") {
          await sendEmail(verificationEmail(email, otp, language));
        } else if (type === "forget-password") {
          await sendEmail(passwordResetEmail(email, otp, language));
        }
      },
    }),
  ],
  trustedOrigins: [
    "ocrinvoice://",
    ...(process.env.NODE_ENV === "development"
      ? ["exp://", "exp://**", "exp://192.168.*.*:*/**"]
      : []),
  ],
});
