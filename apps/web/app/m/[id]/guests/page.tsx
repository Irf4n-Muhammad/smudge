import { GuestList } from "../../../../components/gatherings";

type Props = { params: Promise<{ id: string }> };

export const metadata = { title: "Guest list · Smudge" };
export default async function Page({ params }: Props) {
  const { id } = await params;
  return <GuestList id={decodeURIComponent(id)} />;
}
