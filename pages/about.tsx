import React from "react";
import { useTranslation } from "react-i18next";

const About = () => {
  const { t } = useTranslation();

  return (
    <div className="bg-red-100 w-full min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="py-8">
            <h1 className="text-3xl font-bold mb-2">{t("aboutTitle")}</h1>
            <p className="text-gray-500 text-sm">{t("organizers")}</p>
          </div>

          <img
            src="/gameImage.jpg"
            alt="Featured image"
            className="w-full h-auto mb-8"
          />

          <div className=" flex flex-col gap-5 prose prose-sm sm:prose lg:prose-lg xl:prose-xl mx-auto">
            <p>Yaş: 7+</p>
            <p>Süre: 2 saat</p>
            <p>Dil: Türkçe</p>
            <p>
              Heyecan dolu bir gösteriye hazır mısınız? Karşınızda, sizi
              güldürecek, hüzünlendirecek ve düşündürecek bir oyun: &quot;Kör
              Terazi!&rdquo; Suçsuz yere hapishaneye atılmış öğretmen
              Cevahir&apos;in ve hırslı bir gazetecinin macerasını izlemeye
              hazır olun. Kara mizahın eşliğinde, bu iki perdelik komedi-dramda,
              adalet arayışı ve insan doğasının çelişkileriyle yüzleşeceksiniz.
              Adaletsizliğe karşı sessiz kalanlar, bir gün adalete muhtaç kalır
              mı? &quot;Kör Terazi&quot;, beklenmedik bir yolculuğa davet ediyor
              sizi. Uzun süredir titizlikle hazırlanan bu oyun, adaletsizliğin
              farklı yönleriyle ele alındığı, düşündürücü ve eğlenceli bir
              deneyim sunuyor. İzleyicilerini ağır bir konuyu eğlenceli bir
              biçimde izlemeye davet ediyor. Gençlerin sahnede sergilediği
              enerji, bu oyunu gerçekten özel kılıyor. Sıra dışı yeteneklerin
              sahnedeki performansları, izleyicileri adeta büyülüyor. Hazır
              mısınız? &quot;Kör Terazi&quot; sizleri bekliyor!
            </p>
            <p>Oyunun künyesi Süre: 2 saat Dil: Türkçe Yaş: 7+</p>
            <p>
              Yazan-Yöneten: Filiz Aksu Yapımcı: M.Mahir Aksu Yönetmen Asistanı:
              Melike Demirci Ses-Işık: Yusuf Enes, Adem Buchan Dekor ve Işık
              Tasarım: Filiz Aksu
            </p>
            <p>
              Oyuncular: Yavuz Okan Özbayıs, Kemal Buchan, Muhammed Emin Aksu,
              M.Mahir Aksu, Nurefşan Kocagöz, İnci Sueda Koca, Berre Betül
              Araman, Melike Demirci, Berivan Yabalak
            </p>
            <p>
              Sahne Amiri: İnci Sueda Koca Selman Mektup Seslendirme: Mahir
              Ergin Final Sahnesi Koreografi Müziği: Grifon Fotoğraf: Ahmet
              Karayel Logo Tasarım: Özer Hekimoğlu Afiş Tasarım: Muhammed
              Bahadır Broşür Tasarım: Selmoly
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default About;
