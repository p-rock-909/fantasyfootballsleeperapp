import DraftBoard from "@/components/DraftBoard";

export default async function DraftPage({ params }: PageProps<"/draft/[draftId]">) {
  const { draftId } = await params;
  return <DraftBoard draftId={draftId} />;
}
