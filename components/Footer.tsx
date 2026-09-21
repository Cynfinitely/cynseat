import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";

export default function Footer() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <footer className="mt-auto border-t border-gray-200 bg-white py-6">
      <div className="page-wide flex flex-col items-center gap-3 px-4 text-sm text-gray-600 sm:flex-row sm:justify-between sm:px-6">
        <p>
          © {new Date().getFullYear()} CynSeat. {t("allRightsReserved")}
        </p>
        <nav className="flex items-center gap-4" aria-label="Footer">
          <Link href="/about" className="hover:text-purple-700">
            {t("aboutGame")}
          </Link>
          {user ? (
            <Link href="/tickets" className="hover:text-purple-700">
              {t("myTickets")}
            </Link>
          ) : (
            <Link href="/signIn" className="hover:text-purple-700">
              {t("signIn")}
            </Link>
          )}
        </nav>
      </div>
    </footer>
  );
}
