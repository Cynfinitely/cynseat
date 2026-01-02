import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase/firebase";
import { User } from "firebase/auth";

const Home: React.FC = () => {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="bg-gradient-to-br from-purple-50 via-white to-blue-50 w-full min-h-full">
      <div className="flex flex-col justify-center items-center w-full min-h-full px-4 py-12">
        <div className="max-w-4xl w-full text-center space-y-8">
          {/* Hero Section */}
          <div className="space-y-6">
            <h1 className="text-5xl md:text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-600 leading-tight">
              {t("welcome")}
            </h1>
            
            {/* Event Highlight Card */}
            <div className="mt-12 bg-white rounded-3xl shadow-2xl overflow-hidden transform hover:scale-[1.02] transition-all duration-300">
              {/* Event Image */}
              <div className="relative bg-gray-900 overflow-hidden">
                <img
                  src="./masal.jpeg"
                  alt={t("about.title")}
                  className="w-full h-auto object-contain max-h-[400px]"
                />
              </div>
              
              {/* Event Info */}
              <div className="p-8 space-y-6">
                <h2 className="text-3xl md:text-4xl font-bold text-gray-800">
                  {t("about.title")}
                </h2>
                
                <div className="flex flex-wrap gap-4 justify-center text-gray-700">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">📅</span>
                    <span className="font-semibold">{t("eventDate")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🕐</span>
                    <span className="font-semibold">{t("eventTime")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">📍</span>
                    <span className="font-semibold">{t("eventVenue")}</span>
                  </div>
                </div>

                <p className="text-lg text-gray-600 italic">
                  {t("about.paragraph1")}
                </p>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                  <Link href="/about">
                    <button className="px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-full hover:from-purple-700 hover:to-blue-700 transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl w-full sm:w-auto">
                      {t("viewEventDetails")}
                    </button>
                  </Link>
                  
                  {user && (
                    <Link href="/tickets">
                      <button className="px-8 py-4 bg-white text-purple-600 font-semibold rounded-full border-2 border-purple-600 hover:bg-purple-50 transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl w-full sm:w-auto">
                        {t("buyTicket")}
                      </button>
                    </Link>
                  )}
                </div>

                {/* Sign in prompt for non-authenticated users */}
                {!user && (
                  <p className="text-gray-600 text-sm">
                    {t("signInToBuyTickets")}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
