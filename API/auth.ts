import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as signOutFromFirebase,
} from "firebase/auth";
import { auth } from "../firebase/firebase";

export const register = async ({
  email,
  password,
}: {
  email: string;
  password: string;
}) => {
  return await createUserWithEmailAndPassword(auth, email, password);
};

export const login = async ({
  email,
  password,
}: {
  email: string;
  password: string;
}) => {
  return await signInWithEmailAndPassword(auth, email, password);
};

export const logout = async () => {
  return await signOutFromFirebase(auth);
};
