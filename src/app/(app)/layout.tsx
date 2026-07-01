import { Wordmark } from "@/components/wordmark";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-6">
          <Wordmark />
          <p className="hidden text-sm text-muted-foreground sm:block">
            Optimize for valuable leads, not cheap ones.
          </p>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}
