// app/signin.tsx

import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase/firebase";
import { login } from "../API/auth";
import Link from "next/link";

const SignIn: React.FC = () => {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.push("/tickets");
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      await login({ email, password });
    } catch (error) {
      console.error("Error signing in user:", error);
    }
  };

  return (
    <div className="bg-red-100 w-screen h-screen">
      <div className="flex flex-col justify-center items-center w-full h-full">
        <h1>Sign In</h1>
        <form onSubmit={handleSignIn} className="flex flex-col">
          <input
            name="email"
            type="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="p-2 border rounded mb-2"
          />
          <input
            name="password"
            type="password"
            placeholder="Password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="p-2 border rounded mb-2"
          />
          <button type="submit" className="p-2 bg-blue-500 text-white rounded">
            Sign In
          </button>
        </form>
        <p>
          If you dont have an account, please
          <Link href="/signUp"> sign up </Link>
        </p>
      </div>
    </div>
  );
};

export default SignIn;
