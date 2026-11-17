"use client";

export function PrintButton() {
  return <button className="btn-outline" onClick={() => window.print()}>Print / save PDF</button>;
}
