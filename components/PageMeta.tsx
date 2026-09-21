import Head from "next/head";

type PageMetaProps = {
  title: string;
  description?: string;
};

export default function PageMeta({ title, description }: PageMetaProps) {
  const fullTitle = `${title} · CynSeat`;
  return (
    <Head>
      <title>{fullTitle}</title>
      {description ? <meta name="description" content={description} /> : null}
    </Head>
  );
}
