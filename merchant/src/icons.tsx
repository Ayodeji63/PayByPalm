const paths: Record<string, string> = {
  palm: "M9 12V6a1.5 1.5 0 0 1 3 0v6m0-5a1.5 1.5 0 0 1 3 0v5m0-3a1.5 1.5 0 0 1 3 0v6c0 4-2.5 6-6 6s-5-2-6-4l-2-4a1.5 1.5 0 0 1 2.5-1.5L9 14m0-5a1.5 1.5 0 0 0-3 0v3",
  merchants:
    "M3 10h18L19 4H5l-2 6Zm1 0v10h16V10M9 20v-6h6v6M3 10c0 3 4 3 4 0 0 3 5 3 5 0 0 3 5 3 5 0 0 3 4 3 4 0",
  terminals: "M6 3h12v18H6V3Zm3 3h6v6H9V6Zm0 9h1m4 0h1m-6 3h1m4 0h1",
  activity: "M4 4h16v16H4V4Zm4 4h8M8 12h8m-8 4h5",
  plus: "M12 5v14M5 12h14",
  search: "m20 20-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  back: "M19 12H5m5-5-5 5 5 5",
  logout: "M9 4H4v16h5m5-12 4 4-4 4m-5-4h10",
  check: "m5 12 4 4L19 6",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  refresh:
    "M20 11a8 8 0 0 0-14-5L3 9m0-6v6h6m-5 4a8 8 0 0 0 14 5l3-3m0 6v-6h-6",
  key: "M14 10a5 5 0 1 0-3 4l8-8-2-2-3 3m-3 7 2 2",
  shield: "m12 3 8 3v6c0 5-8 9-8 9S4 17 4 12V6l8-3Zm-4 9 3 3 5-6",
  chevron: "m9 5 7 7-7 7",
  close: "m6 6 12 12M6 18 18 6",
};
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.terminals} />
    </svg>
  );
}
