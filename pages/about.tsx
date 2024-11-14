import React from "react";
import { useTranslation, Trans } from "react-i18next";

const About = () => {
  const { t } = useTranslation();

  return (
    <div className="bg-red-100 w-full min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-6">
          <div className="mb-8 text-center">
            <h1 className="text-4xl font-bold mb-4">
              <Trans i18nKey="about.title" />
            </h1>
            <p className="text-gray-600 text-base">
              <Trans i18nKey="about.contact" />
            </p>
          </div>

          <img
            src="/gameImage.jpg"
            alt="Featured"
            className="w-full h-auto mb-8 rounded-lg shadow-md"
          />

          <div className="prose prose-sm sm:prose lg:prose-lg xl:prose-xl mx-auto text-gray-800">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <p className="text-xl font-semibold">
                <Trans i18nKey="about.age" />
              </p>
              <p className="text-xl font-semibold">
                <Trans i18nKey="about.duration" />
              </p>
              <p className="text-xl font-semibold">
                <Trans i18nKey="about.language" />
              </p>
            </div>

            <p>
              <Trans i18nKey="about.paragraph1" />
            </p>

            <img
              src="/gameImage3.jpg"
              alt="Featured"
              className="w-full h-auto mb-8 rounded-lg shadow-md mt-8"
            />

            <img
              src="/gameImage2.jpg"
              alt="Featured"
              className="w-full h-auto mb-8 rounded-lg shadow-md mt-8"
            />

            <h2 className="my-8 text-xl font-semibold">
              <Trans i18nKey="about.creditsTitle" />
            </h2>
            <p className="text-l font-semibold my-4">
              <Trans i18nKey="about.paragraph2" />
            </p>
            <p>
              <Trans i18nKey="about.paragraph3" />
            </p>
            <p>
              <Trans i18nKey="about.paragraph4" />
            </p>
            <p>
              <Trans i18nKey="about.paragraph5" />
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default About;
