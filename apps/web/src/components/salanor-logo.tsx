import type { SVGProps } from "react";

type SalanorLogoProps = {
  className?: string;
  showWordmark?: boolean;
  markClassName?: string;
  wordmarkClassName?: string;
};

export function SalanorLogo({
  className = "",
  showWordmark = true,
  markClassName = "h-8 w-8",
  wordmarkClassName = "text-lg font-semibold tracking-tight text-ink",
}: SalanorLogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <SalanorMark className={markClassName} aria-hidden />
      {showWordmark ? <span className={wordmarkClassName}>Salanor</span> : null}
    </span>
  );
}

/** Abstract mark: layered arcs suggesting provenance / trust chain. */
export function SalanorMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <rect width="32" height="32" rx="8" className="fill-ink" />
      <path
        d="M8 22c4-6 12-6 16 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="text-teal-soft"
      />
      <path
        d="M10 16c3-4 9-4 12 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="text-teal"
      />
      <circle cx="16" cy="11" r="2.5" className="fill-bone" />
    </svg>
  );
}
