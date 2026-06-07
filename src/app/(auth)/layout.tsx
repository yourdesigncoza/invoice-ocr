import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <Image
            src="/spendsilo_mark.png"
            alt="SpendSilo"
            width={33}
            height={36}
            priority
            className="h-9 w-auto"
          />
          <span className="text-xl font-bold tracking-tight">SpendSilo</span>
        </div>
        <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
          {children}
        </div>
        <p className="mt-4 text-center text-xs text-muted">
          Supplier spend intelligence
        </p>
      </div>
    </div>
  );
}
