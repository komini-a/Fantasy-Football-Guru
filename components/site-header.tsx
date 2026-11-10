import Link from "next/link";
import { Icon } from "@/components/icon";

export function SiteHeader() {
  return (
    <header className="site-header page-width">
      <Link href="/" className="brand" aria-label="Fantasy Football Guru home">
        <span className="brand-mark">
          <Icon name="football" />
        </span>
        <span>
          FANTASY FOOTBALL <strong>GURU</strong>
        </span>
      </Link>
      <nav aria-label="Main navigation">
        <Link href="/#playbook">
          The playbook <span aria-hidden="true">↗</span>
        </Link>
      </nav>
    </header>
  );
}
