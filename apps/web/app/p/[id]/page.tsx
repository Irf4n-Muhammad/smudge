import type { Metadata } from "next";
import { SharedPost } from "../../../components/share-pages";
import { metadataBase, publicJson } from "../../share-meta";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const post = await publicJson<{
    title: string;
    caption: string;
    hasCover: boolean;
    author: { name: string };
  }>(`/posts/${encodeURIComponent(id)}`);
  if (!post) return { title: "Smudge" };
  const title = `${post.title} · ${post.author.name} on Smudge`;
  return {
    metadataBase,
    title,
    description: post.caption || `A post by ${post.author.name} on Smudge.`,
    openGraph: {
      title,
      description: post.caption || undefined,
      ...(post.hasCover ? { images: [`/api/public/posts/${encodeURIComponent(id)}/cover`] } : {}),
    },
  };
}
export default async function Page({ params }: Props) {
  const { id } = await params;
  return <SharedPost id={id} />;
}
