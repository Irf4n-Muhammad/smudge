import type { Metadata } from "next";
import { Widget } from "../../../components/widget";
import { metadataBase, publicJson } from "../../share-meta";

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const view = await publicJson<{ user: { name: string } }>(`/users/${encodeURIComponent(handle)}`);
  const title = view ? `${view.user.name} right now` : "Smudge";
  return { metadataBase, title, robots: { index: false } };
}
/** A friend's page the size of a widget (ADR 0042); the native app shows this on the home screen. */
export default async function Page({ params }: Props) {
  const { handle } = await params;
  return (
    <main className="widget-page">
      <Widget handle={decodeURIComponent(handle)} />
    </main>
  );
}
