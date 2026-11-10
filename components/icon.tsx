import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  name: "football" | "trade" | "rankings" | "lineup" | "arrow";
};

export function Icon({ name, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {name === "football" && (
        <>
          <path d="M4 20C1 12 9 1 20 4c3 11-8 19-16 16Z" />
          <path d="m8 16 8-8M9 11l4 4m-1-7 4 4M4 14l6 6M14 4l6 6" />
        </>
      )}
      {name === "trade" && (
        <>
          <path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4" />
        </>
      )}
      {name === "rankings" && (
        <>
          <path d="M4 20v-6h5v6m0 0V8h6v12m0 0V4h5v16M3 20h18" />
        </>
      )}
      {name === "lineup" && (
        <>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="m8 8 1 1 2-2m-3 7 1 1 2-2m3-5h3m-3 6h3" />
        </>
      )}
      {name === "arrow" && (
        <>
          <path d="M4 12h16m-6-6 6 6-6 6" />
        </>
      )}
    </svg>
  );
}
