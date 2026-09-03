import TradeBoard from "@/components/TradeBoard";

export default async function TradesPage({ params }: PageProps<"/league/[leagueId]/trades">) {
  const { leagueId } = await params;
  return <TradeBoard leagueId={leagueId} />;
}
