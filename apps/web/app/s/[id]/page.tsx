import type { Metadata } from "next";
import { SharedSide } from "../../../components/share-pages";
import { metadataBase, publicJson } from "../../share-meta";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const side = await publicJson<{ name: string; tagline: string }>(
    `/sides/${encodeURIComponent(id)}`,
  );
  if (!side) return { title: "Smudge" };
  const title = `${side.name} on Smudge`;
  return {
    metadataBase,
    title,
    description: side.tagline,
    openGraph: { title, description: side.tagline },
  };
}
export default async function Page({ params }: Props) {
  const { id } = await params;
  return <SharedSide id={decodeURIComponent(id)} />;
}
