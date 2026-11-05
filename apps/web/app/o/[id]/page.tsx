import type { Metadata } from "next";
import { CreateOrg, OrgPage } from "../../../components/org-page";
import { metadataBase, publicJson } from "../../share-meta";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (id === "new") return { metadataBase, title: "Start an organisation on Smudge" };
  const org = await publicJson<{ name: string; members: number; visibility?: string }>(
    `/orgs/${encodeURIComponent(id)}`,
  );
  // A private organisation answers nobody here; a link-only one stays out of search.
  if (!org) return { title: "Smudge", robots: { index: false } };
  const robots = org.visibility === "link" ? { robots: { index: false } } : {};
  const title = `${org.name} on Smudge`;
  const description = `${org.members} ${org.members === 1 ? "person" : "people"} on Smudge.`;
  return { metadataBase, title, description, openGraph: { title, description }, ...robots };
}
export default async function Page({ params }: Props) {
  const { id } = await params;
  if (id === "new") return <CreateOrg />;
  return <OrgPage id={decodeURIComponent(id)} />;
}
