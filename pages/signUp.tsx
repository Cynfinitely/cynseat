import React, { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AuthError } from "firebase/auth";
import { useTranslation } from "react-i18next";
import { register } from "../API/auth";
import { useAuth } from "../contexts/AuthContext";
import { mapAuthError } from "../lib/authErrors";
import { getSafeReturnUrl } from "../lib/returnUrl";
import PageMeta from "../components/PageMeta";

const SignUp: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const returnUrl = getSafeReturnUrl(router.query.returnUrl);

  useEffect(() => {
    if (!authLoading && user) {
      router.replace(returnUrl);
    }
  }, [authLoading, user, returnUrl, router]);

  const handleSignUp = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(t("passwordsDoNotMatch"));
      return;
    }

    setLoading(true);
    try {
      await register({ email, password });
      router.push(returnUrl);
    } catch (signUpError) {
      const authError = signUpError as AuthError;
      setError(mapAuthError(authError.code, t));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <PageMeta title={t("signUp")} />
      <div className="page-narrow">
        <div className="card p-8">
          <div className="mb-6 space-y-1">
            <h1 className="text-2xl font-semibold text-gray-900">{t("signUp")}</h1>
            <p className="text-gray-600">{t("signUpSubtitle")}</p>
          </div>

          {error ? (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <form onSubmit={handleSignUp} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                {t("email")}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder={t("emailPlaceholder")}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                {t("password")}
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder={t("passwordPlaceholder")}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pr-20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-sm font-medium text-purple-700"
                >
                  {showPassword ? t("hidePassword") : t("showPassword")}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-gray-700"
              >
                {t("confirmPassword")}
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder={t("passwordPlaceholder")}
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-field"
              />
            </div>

            <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
              {t("emailForTicketsNote")}
            </p>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? t("signingUp") : t("signUp")}
            </button>
          </form>

          <p className="mt-6 border-t border-gray-200 pt-4 text-center text-gray-600">
            {t("alreadyHaveAccount")}{" "}
            <Link
              href={`/signIn?returnUrl=${encodeURIComponent(returnUrl)}`}
              className="font-semibold text-purple-700 hover:text-purple-800"
            >
              {t("signIn")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignUp;
