import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as signOutFromFirebase,
} from "firebase/auth";
import { auth } from "../firebase/firebase";

function requireAuth() {
  if (!auth) {
    throw new Error("Firebase auth is not configured.");
  }
  return auth;
}

export const register = async ({
  email,
  password,
}: {
  email: string;
  password: string;
}) => {
  return await createUserWithEmailAndPassword(requireAuth(), email, password);
};

export const login = async ({
  email,
  password,
}: {
  email: string;
  password: string;
}) => {
  return await signInWithEmailAndPassword(requireAuth(), email, password);
};

export const logout = async () => {
  return await signOutFromFirebase(requireAuth());
};
