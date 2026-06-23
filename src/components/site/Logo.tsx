import { Link } from "@tanstack/react-router";
import logo from "@/assets/hostylia-logo.png.asset.json";

export function Logo({ className = "h-9 w-auto", withLink = true }: { className?: string; withLink?: boolean }) {
  const img = <img src={logo.url} alt="Hostylia — Smart Residential Management" className={className} />;
  if (!withLink) return img;
  return (
    <Link to="/" className="inline-flex items-center" aria-label="Hostylia home">
      {img}
    </Link>
  );
}
