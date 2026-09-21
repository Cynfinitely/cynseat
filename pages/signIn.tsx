import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { AuthError } from "firebase/auth";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { auth } from "../firebase/firebase";
import { useAuth } from "../contexts/AuthContext";
import { mapAuthError } from "../lib/authErrors";
import { getSafeReturnUrl } from "../lib/returnUrl";
import PageMeta from "../components/PageMeta";

const SignIn: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const returnUrl = getSafeReturnUrl(router.query.returnUrl);

  useEffect(() => {
    if (!authLoading && user) {
      router.replace(returnUrl);
    }
  }, [authLoading, user, returnUrl, router]);

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!auth) {
        setError(t("authError"));
        return;
      }
      await signInWithEmailAndPassword(auth, email, password);
    } catch (signInError) {
      const authError = signInError as AuthError;
      setError(mapAuthError(authError.code, t));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <PageMeta title={t("signIn")} />
      <div className="page-narrow">
        <div className="card p-8">
          <div className="mb-6 space-y-1">
            <h1 className="text-2xl font-semibold text-gray-900">{t("signIn")}</h1>
            <p className="text-gray-600">{t("signInSubtitle")}</p>
          </div>

          {error ? (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <form onSubmit={handleSignIn} className="space-y-4">
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
                  autoComplete="current-password"
                  placeholder={t("passwordPlaceholder")}
                  required
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

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? t("signingIn") : t("signIn")}
            </button>
          </form>

          <p className="mt-6 border-t border-gray-200 pt-4 text-center text-gray-600">
            {t("dontHaveAccount")}{" "}
            <Link
              href={`/signUp?returnUrl=${encodeURIComponent(returnUrl)}`}
              className="font-semibold text-purple-700 hover:text-purple-800"
            >
              {t("createAccount")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignIn;
