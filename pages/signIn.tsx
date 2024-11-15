// app/signin.tsx

import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { onAuthStateChanged, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase/firebase";
import Link from "next/link";
import { AuthError } from "firebase/auth";
import { useTranslation } from "react-i18next";

const SignIn: React.FC = () => {
  const [email, setEmail] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const router = useRouter();
  const { t } = useTranslation();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.push("/about");
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      // User has been signed in successfully.
    } catch (error) {
      const { code } = error as AuthError;

      // Handle error.
      if (code === "auth/user-not-found") {
        setError(t("userNotFound"));
      } else if (code === "auth/wrong-password") {
        setError(t("wrongPassword"));
      } else {
        setError(t("unexpectedError"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-red-100 w-full h-full">
      <div className="flex flex-col justify-center items-center w-full h-full gap-6">
        <h1>{t("signIn")}</h1>
        <form
          onSubmit={handleSignIn}
          className="flex flex-col">
          <input
            name="email"
            type="email"
            placeholder={t("email")}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="p-2 border rounded mb-2"
          />
          <div className="relative">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder={t("password")}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="p-2 border rounded mb-2 w-full"
            />
          </div>
          <div className="flex items-center mb-2">
            <input
              type="checkbox"
              id="showPassword"
              checked={showPassword}
              onChange={() => setShowPassword(!showPassword)}
              className="mr-2"
            />
            <label htmlFor="showPassword">{t("showPassword")}</label>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="p-2 bg-blue-500 text-white rounded">
            {t("signIn")}
          </button>
        </form>
        {error && <p className="text-red-500">{error}</p>}

        <Link
          href="/signUp"
          className="underline mt-2">
          {t("ifYouDontHaveAccount")}
        </Link>
      </div>
    </div>
  );
};

export default SignIn;
