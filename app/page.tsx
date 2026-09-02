import AppNav from "@/components/AppNav";
import SetupForm from "@/components/SetupForm";

export default function Home() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 px-4 py-2 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
          <AppNav />
          <span className="text-sm text-zinc-500">Sleeper Draft Assistant</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl px-4 py-12">
        <h1 className="text-3xl font-bold tracking-tight">Sleeper Draft Assistant</h1>
        <p className="mt-2 text-zinc-400">
          Connect your Sleeper league for live draft pick recommendations, and for weekly start/sit advice once the season
          starts. Draft preferences come from <code className="rounded bg-zinc-800 px-1">content/preferences.md</code>; the
          weekly rules come from <code className="rounded bg-zinc-800 px-1">content/start-sit-rules.md</code>.
        </p>
        <SetupForm />
      </main>
    </>
  );
}
