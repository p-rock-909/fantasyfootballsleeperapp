import MatchupBoard from "@/components/MatchupBoard";

export default async function MatchupsPage({ params }: PageProps<"/league/[leagueId]/matchups">) {
  const { leagueId } = await params;
  return <MatchupBoard leagueId={leagueId} />;
}
