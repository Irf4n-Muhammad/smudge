import type { Metadata } from "next";
import { SharedProfile } from "../../../components/share-pages";
import { metadataBase, publicJson } from "../../share-meta";

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const view = await publicJson<{ user: { name: string; handle: string; bio: string } }>(
    `/users/${encodeURIComponent(handle)}`,
  );
  if (!view) return { title: "Smudge" };
  const title = `${view.user.name} (@${view.user.handle}) on Smudge`;
  return {
    metadataBase,
    title,
    description: view.user.bio || `${view.user.name}'s page on Smudge.`,
    openGraph: { title, description: view.user.bio || undefined },
  };
}
export default async function Page({ params }: Props) {
  const { handle } = await params;
  return <SharedProfile handle={decodeURIComponent(handle)} />;
}
