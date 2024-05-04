import Link from "next/link";
import { useTranslation } from "react-i18next";

const Home: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="bg-red-100 w-screen h-screen">
      <div className="flex flex-col justify-center items-center w-full h-full">
        <h1 className="text-2xl">{t("welcome")}</h1>
        <Link href="/signIn">{t("pleaseSignIn")}</Link>
      </div>
    </div>
  );
};

export default Home;
