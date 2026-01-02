import React from "react";
import { useTranslation, Trans } from "react-i18next";

const About = () => {
  const { t } = useTranslation();

  return (
    <div className="bg-gradient-to-br from-purple-50 via-white to-blue-50 w-full min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Header Section */}
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-600 mb-4">
              <Trans i18nKey="about.title" />
            </h1>
            <div className="w-24 h-1 bg-gradient-to-r from-purple-600 to-blue-600 mx-auto rounded-full"></div>
          </div>

          {/* Main Content Card */}
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            {/* Featured Image */}
            <div className="relative bg-gray-900 overflow-hidden">
              <img
                src="./masal.jpeg"
                alt={t("featuredEventAlt")}
                className="w-full h-auto object-contain max-h-[600px]"
              />
            </div>

            {/* Content Section */}
            <div className="p-8 md:p-12 space-y-8">
              {/* Event Details Box */}
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-6 border-l-4 border-purple-600">
                <div className="whitespace-pre-line text-gray-800 font-medium leading-relaxed">
                  <Trans i18nKey="about.eventDetails" />
                </div>
              </div>

              {/* Artist and Performance Info */}
              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-blue-500">
                  <p className="text-sm text-gray-600 mb-1">{t("about.artist")}</p>
                  <p className="text-xl font-bold text-gray-800">
                    <Trans i18nKey="about.artistName" />
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-purple-500">
                  <p className="text-lg font-semibold text-gray-800">
                    <Trans i18nKey="about.duration" />
                  </p>
                </div>
              </div>

              {/* Concept */}
              <div className="bg-blue-50 rounded-lg p-4 border-l-4 border-blue-600">
                <p className="text-gray-800 font-medium">
                  <Trans i18nKey="about.concept" />
                </p>
              </div>

              {/* Main Description - Highlighted */}
              <div className="my-8">
                <p className="text-2xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-600 text-center italic">
                  <Trans i18nKey="about.paragraph1" />
                </p>
              </div>

              {/* Story Paragraphs */}
              <div className="prose prose-lg max-w-none space-y-6">
                <p className="text-gray-700 leading-relaxed text-lg">
                  <Trans i18nKey="about.paragraph2" />
                </p>

                <p className="text-gray-700 leading-relaxed text-lg">
                  <Trans i18nKey="about.paragraph3" />
                </p>

                <p className="text-gray-700 leading-relaxed text-lg">
                  <Trans i18nKey="about.paragraph4" />
                </p>

                <p className="text-gray-700 leading-relaxed text-lg">
                  <Trans i18nKey="about.paragraph5" />
                </p>

                <p className="text-gray-700 leading-relaxed text-lg font-semibold">
                  <Trans i18nKey="about.paragraph6" />
                </p>

                <p className="text-gray-700 leading-relaxed text-lg italic">
                  <Trans i18nKey="about.paragraph7" />
                </p>

                <p className="text-gray-700 leading-relaxed text-lg">
                  <Trans i18nKey="about.paragraph8" />
                </p>

                <p className="text-gray-700 leading-relaxed text-lg bg-purple-50 p-6 rounded-lg border-l-4 border-purple-600">
                  <Trans i18nKey="about.paragraph9" />
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default About;
