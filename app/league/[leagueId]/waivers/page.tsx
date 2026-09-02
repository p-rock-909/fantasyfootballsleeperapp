import WaiverBoard from "@/components/WaiverBoard";

export default async function WaiversPage({ params }: PageProps<"/league/[leagueId]/waivers">) {
  const { leagueId } = await params;
  return <WaiverBoard leagueId={leagueId} />;
}
