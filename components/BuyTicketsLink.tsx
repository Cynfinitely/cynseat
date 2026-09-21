import Link from "next/link";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { getBuyTicketsHref } from "../lib/returnUrl";

type BuyTicketsLinkProps = {
  className?: string;
  children?: ReactNode;
};

export default function BuyTicketsLink({
  className = "btn-primary",
  children,
}: BuyTicketsLinkProps) {
  const { user } = useAuth();
  const { t } = useTranslation();

  return (
    <Link href={getBuyTicketsHref(Boolean(user))} className={className}>
      {children ?? t("buyTickets")}
    </Link>
  );
}
