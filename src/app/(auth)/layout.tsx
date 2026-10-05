export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto grid min-h-dvh max-w-[1680px] gap-3.5 p-2.5 md:p-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Dunkle Markenfläche mit Wirbel-Muster */}
      <div className="fx-swirl fx-shell hidden flex-col justify-between rounded-2xl p-10 lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-red-50 text-[17px] font-bold text-red-950">Z</span>
          <span className="text-[22px] font-semibold tracking-[-0.03em]">Zoepp Media</span>
        </div>
        <div>
          <p className="max-w-[12em] text-[clamp(34px,3.4vw,48px)] font-semibold leading-[1.08] tracking-[-0.035em]">
            Recruiting, Kunden und Team – an einem ruhigen Ort.
          </p>
          <p className="mt-4 text-[15px] text-red-200">Zoepp Media Cloud</p>
        </div>
      </div>
      <div className="flex items-center justify-center rounded-2xl bg-panel p-4 md:p-10">{children}</div>
    </div>
  );
}
