import type { Metadata } from "next";
import { SharedProfile } from "../../../../components/share-pages";
import { metadataBase, publicJson } from "../../../share-meta";

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const view = await publicJson<{ user: { name: string; handle: string } }>(
    `/users/${encodeURIComponent(handle)}`,
  );
  if (!view) return { title: "Smudge" };
  const title = `${view.user.name}'s stories on Smudge`;
  return { metadataBase, title, openGraph: { title } };
}
export default async function Page({ params }: Props) {
  const { handle } = await params;
  return <SharedProfile handle={decodeURIComponent(handle)} page="stories" />;
}
