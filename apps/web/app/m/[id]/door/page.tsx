import { DoorScreen } from "../../../../components/moment-day";

type Props = { params: Promise<{ id: string }> };

export const metadata = { title: "Pintu masuk · Smudge" };
export default async function Page({ params }: Props) {
  const { id } = await params;
  return <DoorScreen id={decodeURIComponent(id)} />;
}
