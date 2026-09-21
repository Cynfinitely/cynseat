import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { logout } from "../API/auth";
import { useAuth } from "../contexts/AuthContext";
import { getSafeReturnUrl } from "../lib/returnUrl";
import LanguageSwitcher from "./LanguageSwitcher";

export default function Header() {
  const { user, isAdmin } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const close = () => setMobileMenuOpen(false);
    router.events.on("routeChangeComplete", close);
    return () => {
      router.events.off("routeChangeComplete", close);
    };
  }, [router.events]);

  const handleSignOut = async () => {
    try {
      await logout();
      setMobileMenuOpen(false);
      router.push("/signIn");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const returnUrl = getSafeReturnUrl(router.query.returnUrl);
  const signInHref = `/signIn?returnUrl=${encodeURIComponent(returnUrl)}`;
  const signUpHref = `/signUp?returnUrl=${encodeURIComponent(returnUrl)}`;

  const navClass = (href: string) =>
    router.pathname === href ? "nav-link-active" : "nav-link";

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
      <div className="page-wide flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="text-xl font-semibold tracking-tight text-purple-700">
          CynSeat
        </Link>

        <nav className="hidden items-center gap-6 lg:flex" aria-label="Primary">
          <Link href="/about" className={navClass("/about")}>
            {t("aboutGame")}
          </Link>
          {user ? (
            <Link href="/tickets" className={navClass("/tickets")}>
              {t("myTickets")}
            </Link>
          ) : null}
          {isAdmin ? (
            <Link href="/admin" className={navClass("/admin")}>
              {t("admin")}
            </Link>
          ) : null}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          {user ? (
            <>
              <span className="max-w-[180px] truncate text-sm text-gray-600">
                {user.email}
              </span>
              <button type="button" onClick={handleSignOut} className="btn-ghost text-red-600">
                {t("signOut")}
              </button>
            </>
          ) : (
            <>
              <Link href={signInHref} className="btn-ghost">
                {t("signIn")}
              </Link>
              <Link href={signUpHref} className="btn-primary">
                {t("signUp")}
              </Link>
            </>
          )}
          <LanguageSwitcher />
        </div>

        <button
          type="button"
          className="btn-ghost lg:hidden"
          onClick={() => setMobileMenuOpen((open) => !open)}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-nav"
          aria-label={mobileMenuOpen ? t("closeMenu") : t("openMenu")}
        >
          {mobileMenuOpen ? t("closeMenu") : t("openMenu")}
        </button>
      </div>

      {mobileMenuOpen ? (
        <div id="mobile-nav" className="border-t border-gray-200 px-4 py-4 lg:hidden">
          <nav className="flex flex-col gap-3" aria-label="Mobile">
            <Link href="/about" className={navClass("/about")}>
              {t("aboutGame")}
            </Link>
            {user ? (
              <Link href="/tickets" className={navClass("/tickets")}>
                {t("myTickets")}
              </Link>
            ) : null}
            {isAdmin ? (
              <Link href="/admin" className={navClass("/admin")}>
                {t("admin")}
              </Link>
            ) : null}
            {user ? (
              <>
                <p className="truncate text-sm text-gray-600">{user.email}</p>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="btn-ghost justify-start px-0 text-red-600"
                >
                  {t("signOut")}
                </button>
              </>
            ) : (
              <>
                <Link href={signInHref} className="nav-link">
                  {t("signIn")}
                </Link>
                <Link href={signUpHref} className="btn-primary w-full">
                  {t("signUp")}
                </Link>
              </>
            )}
            <LanguageSwitcher />
          </nav>
        </div>
      ) : null}
    </header>
  );
}
