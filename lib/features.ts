export type Feature = {
  title: string;
  href: string;
  description: string;
  category: string;
  available?: boolean;
  icon: "trade" | "rankings" | "lineup";
};

export const features: Feature[] = [
  {
    title: "Trade Calculator",
    available: true,
    href: "/trade-calculator",
    description:
      "See both sides of the deal. A clearer way to weigh your next big roster move.",
    category: "Make your move",
    icon: "trade",
  },
  {
    title: "Player Rankings",
    available: true,
    href: "/player-rankings",
    description:
      "Find your next difference-maker. A fresh perspective on the players that matter.",
    category: "Know the field",
    icon: "rankings",
  },
  {
    title: "Lineup Review",
    available: true,
    href: "/lineup-review",
    description:
      "Put your best team on the field. Give every spot in your starting lineup a second look.",
    category: "Set yourself up",
    icon: "lineup",
  },
];
