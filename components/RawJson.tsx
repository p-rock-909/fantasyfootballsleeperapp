"use client";

import { useState } from "react";

/** Collapsed raw JSON of a response, for seeing exactly what the model returned. */
export default function RawJson({ value }: { value: unknown }) {
  const [open, setOpen] = useState(false);
  const json = JSON.stringify(value, null, 2);
  return (
    <div>
      <div className="flex items-center gap-3">
        <button className="text-[10px] text-zinc-600 hover:text-zinc-400" onClick={() => setOpen((v) => !v)}>{open ? "▾" : "▸"} Raw</button>
        {open && <button className="text-[10px] text-zinc-600 hover:text-zinc-400" onClick={() => navigator.clipboard?.writeText(json)}>Copy</button>}
      </div>
      {open && <pre className="mt-1 max-h-64 overflow-auto rounded bg-zinc-900 p-2 text-[10px] leading-tight text-zinc-400">{json}</pre>}
    </div>
  );
}
