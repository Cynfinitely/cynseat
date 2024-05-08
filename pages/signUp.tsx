// app/signup.tsx

import React, { FormEvent, useState } from "react";
import { register } from "../API/auth";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/router";

const SignUp: React.FC = () => {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();
  const router = useRouter();

  const handleSignUp = async (event: FormEvent) => {
    event.preventDefault();

    try {
      await register({ email, password });
      router.push("/tickets");
    } catch (error: any) {
      setError(error.message);
    }
  };

  return (
    <div className="bg-red-100 w-full h-full">
      <div className="flex flex-col justify-center items-center w-full h-full">
        <h1>{t("signUp")}</h1>
        <form onSubmit={handleSignUp} className="flex flex-col">
          <input
            name="email"
            type="email"
            placeholder={t("email")}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="p-2 border rounded mb-2"
          />
          <input
            name="password"
            type="password"
            placeholder={t("password")}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="p-2 border rounded mb-2"
          />
          <button type="submit" className="p-2 bg-blue-500 text-white rounded">
            {t("signUp")}
          </button>
          {error && <p className="mt-2 text-red-500">{error}</p>}
        </form>
      </div>
    </div>
  );
};

export default SignUp;
