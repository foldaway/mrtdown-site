export function PlatformSign({
  color,
  label,
}: {
  color: string;
  label: string;
}) {
  return (
    <span
      aria-hidden="true"
      className="flex h-7 min-w-6 shrink-0 flex-col items-center justify-center rounded-xs px-0.5 text-white shadow-sm"
      style={{ backgroundColor: color }}
    >
      <span className="font-bold text-sm leading-none">{label}</span>
      <span className="mt-0.5 h-1.5 w-4 rounded-xs bg-white/90" />
    </span>
  );
}

export function ExitSign({ label }: { label: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-[#f7d70b] p-1 shadow-sm"
    >
      <span className="flex size-full items-center justify-center rounded-tl-xs rounded-tr-xs border-black border-s-2 border-t-6 border-r-2 border-b-0 font-bold text-black text-sm leading-none">
        {label}
      </span>
    </span>
  );
}
