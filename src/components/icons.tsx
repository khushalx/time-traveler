export function Arrow({
  diagonal = false,
  className = "",
}: {
  diagonal?: boolean;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d={diagonal ? "M6 18 18 6M6 6h12v12" : "M4 12h15m-6-6 6 6-6 6"}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}
export function TimeMark() {
  return (
    <svg
      width="30"
      height="34"
      viewBox="0 0 30 34"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 4h24M10 4v26M20 4v26M3 30h24"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        d="m10 11 10 12m0-12L10 23"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}
export function Asterisk({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M24 2v44M2 24h44M8.4 8.4l31.2 31.2m0-31.2L8.4 39.6"
        stroke="currentColor"
        strokeWidth="5"
      />
      <circle cx="24" cy="24" r="6" fill="var(--paper)" />
    </svg>
  );
}
export function Expand() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9 4H4v5m11-5h5v5M4 15v5h5m6 0h5v-5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}
