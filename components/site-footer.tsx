import Link from "next/link";
import { Icon } from "@/components/icon";

export function SiteFooter() {
  return (
    <footer className="site-footer page-width">
      <Link href="/" className="footer-brand">
        <Icon name="football" /> Fantasy Football Guru
      </Link>
      <p>For the love of the game. And the win.</p>
      <span className="footer-note">Built for fantasy football.</span>
    </footer>
  );
}
