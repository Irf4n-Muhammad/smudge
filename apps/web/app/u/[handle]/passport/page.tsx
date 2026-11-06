import type { Metadata } from "next";
import { Passport } from "../../../../components/passport";
import { metadataBase } from "../../../share-meta";

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  return {
    metadataBase,
    title: `@${decodeURIComponent(handle)}’s passport on Smudge`,
    robots: { index: false },
  };
}
export default async function Page({ params }: Props) {
  const { handle } = await params;
  return <Passport handle={decodeURIComponent(handle)} />;
}
