import type { Metadata } from "next";
import { OrgPage } from "../../../components/org-page";
import { metadataBase, publicJson } from "../../share-meta";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const org = await publicJson<{ name: string; members: number }>(
    `/orgs/${encodeURIComponent(id)}`,
  );
  if (!org) return { title: "Smudge" };
  const title = `${org.name} on Smudge`;
  const description = `${org.members} ${org.members === 1 ? "person" : "people"} on Smudge.`;
  return { metadataBase, title, description, openGraph: { title, description } };
}
export default async function Page({ params }: Props) {
  const { id } = await params;
  return <OrgPage id={decodeURIComponent(id)} />;
}
