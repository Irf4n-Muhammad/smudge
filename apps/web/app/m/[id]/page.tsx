import type { Metadata } from "next";
import { Invitation } from "../../../components/gatherings";
import { metadataBase, publicJson } from "../../share-meta";

type Props = { params: Promise<{ id: string }> };

// The preview WhatsApp shows when the link is pasted: the names, the date and the place.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const invite = await publicJson<{ title: string; date: string; place: string }>(
    `/gatherings/${encodeURIComponent(id)}`,
  );
  if (!invite) return { title: "Smudge" };
  const date = new Date(`${invite.date}T00:00:00`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const title = `Undangan: ${invite.title}`;
  const description = `${date} · ${invite.place}`;
  return { metadataBase, title, description, openGraph: { title, description } };
}
export default async function Page({ params }: Props) {
  const { id } = await params;
  return <Invitation id={decodeURIComponent(id)} />;
}
