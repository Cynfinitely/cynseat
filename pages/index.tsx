import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase/firebase"; // Import your auth object
import { User } from "firebase/auth"; // Import the User type

const Home: React.FC = () => {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  return (
    <div className="bg-red-100 w-full h-full">
      <div className="flex flex-col justify-center items-center w-full h-full">
        {user ? (
          // If the user is signed in, display a welcome message with their name
          <h1 className="text-2xl">{t("welcome")}</h1>
        ) : (
          // If the user is not signed in, display a sign in link
          <>
            <h1 className="text-2xl">{t("welcome")}</h1>
            <Link href="/signIn" className="underline">
              {t("pleaseSignIn")}
            </Link>
          </>
        )}
      </div>
    </div>
  );
};

export default Home;
