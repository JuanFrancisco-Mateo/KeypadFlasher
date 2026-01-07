import type { ReactNode } from "react";

type StatusTone = "info" | "success" | "warn" | "error";

type StatusBannerProps = {
  tone: StatusTone;
  title: string;
  body?: ReactNode;
};

export function StatusBanner({ tone, title, body }: StatusBannerProps) {
  return (
    <div className={`status-banner status-${tone}`}>
      <div className="status-title">{title}</div>
      {body && <div className="status-body">{body}</div>}
    </div>
  );
}
