import type { TFunction } from "i18next";

export function mapAuthError(code: string | undefined, t: TFunction): string {
  switch (code) {
    case "auth/user-not-found":
      return t("userNotFoundCreateAccount");
    case "auth/wrong-password":
      return t("wrongPassword");
    case "auth/invalid-credential":
      return t("invalidCredentials");
    case "auth/invalid-email":
      return t("invalidEmail");
    case "auth/user-disabled":
      return t("userDisabled");
    case "auth/too-many-requests":
      return t("tooManyRequests");
    case "auth/email-already-in-use":
      return t("emailInUse");
    case "auth/weak-password":
      return t("weakPassword");
    default:
      return t("authError");
  }
}
