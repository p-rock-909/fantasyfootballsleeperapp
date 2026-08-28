import SetupForm from "@/components/SetupForm";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Sleeper Draft Assistant</h1>
      <p className="mt-2 text-zinc-400">
        Connect your Sleeper draft, paste your rankings, and get Claude&apos;s pick recommendations live while you&apos;re on the clock.
        Your preferences come from <code className="rounded bg-zinc-800 px-1">content/preferences.md</code>.
      </p>
      <SetupForm />
    </main>
  );
}
