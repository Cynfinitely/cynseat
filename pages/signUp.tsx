// app/signup.tsx

import React, { FormEvent, useState } from "react";
import { register } from "../API/auth";

const SignUp: React.FC = () => {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");

  const handleSignUp = async (event: FormEvent) => {
    event.preventDefault();

    try {
      const user = await register({ email, password });
      console.log("Registered user:", user);
    } catch (error) {
      console.error("Error registering user:", error);
    }
  };

  return (
    <div className="bg-red-100 w-screen h-screen">
      <div className="flex flex-col justify-center items-center w-full h-full">
        <h1>Sign Up</h1>
        <form onSubmit={handleSignUp} className="flex flex-col">
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
            Sign Up
          </button>
        </form>
      </div>
    </div>
  );
};

export default SignUp;
