import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { prisma } from "./prisma.js";
import { sendEmail, verificationEmail } from "./email.js";
import { USAGE_TYPES, isStrongPassword, isUsageType } from "@ocrinvoice/shared";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
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
      "/email-otp/send-verification-otp": {
        window: 60,
        max: 5,
      },
      "/email-otp/verify-email": {
        window: 60,
        max: 10,
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") {
        return;
      }
      const password = ctx.body?.password;
      if (typeof password !== "string" || !isStrongPassword(password)) {
        throw new APIError("BAD_REQUEST", {
          code: "PASSWORD_TOO_WEAK",
          message: "Password must have at least 8 characters, one digit and one uppercase letter",
        });
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
      async sendVerificationOTP({ email, otp, type }) {
        if (process.env.NODE_ENV === "development") {
          console.log(`[email-otp] ${type} ${email}: ${otp}`);
        }
        if (type === "email-verification") {
          await sendEmail(verificationEmail(email, otp));
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
