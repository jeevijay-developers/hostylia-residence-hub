import type { LucideIcon } from "lucide-react";
import {
  Apple,
  CalendarCheck,
  CreditCard,
  Megaphone,
  Play,
  Smartphone,
  UserRound,
  Users,
} from "lucide-react";
import { SectionChip } from "@/components/site/marketing/MarketingPrimitives";
import { marketingAssets } from "@/components/site/marketing/marketing-assets";

type Feature = { label: string; icon: LucideIcon };

const features: Feature[] = [
  { label: "Parent updates", icon: Users },
  { label: "Attendance & check-ins", icon: CalendarCheck },
  { label: "Fee alerts", icon: CreditCard },
  { label: "Complaints & notices", icon: Megaphone },
  { label: "Warden tools", icon: UserRound },
];

type Store = { name: string; icon: LucideIcon };

// The apps are not published yet — these are deliberately non-interactive.
const stores: Store[] = [
  { name: "App Store", icon: Apple },
  { name: "Google Play", icon: Play },
];

export function MobileAppSection() {
  const img = marketingAssets.mobileApp;

  return (
    <section className="overflow-hidden bg-background py-16 md:py-20">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 md:px-6 lg:grid-cols-2 lg:gap-16">
        {/* Copy first in DOM so small screens read heading → features → image. */}
        <div className="min-w-0 lg:order-2">
          <SectionChip icon={Smartphone}>Mobile experience</SectionChip>
          <h2 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-foreground md:text-4xl lg:text-5xl">
            Mobile app <span className="text-brand-green">coming soon</span>
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Parents, wardens and students will be able to manage key residential workflows on the
            go.
          </p>

          <ul className="mt-8 grid max-w-xl gap-3 sm:grid-cols-2">
            {features.map(({ label, icon: Icon }) => (
              <li
                key={label}
                className="flex items-center gap-3 rounded-xl border border-brand-green/10 leading-snug bg-linear-to-r from-mint to-card px-4 py-3 font-heading text-sm font-semibold text-foreground shadow-card-ambient"
              >
                <Icon className="size-5 shrink-0 text-brand-green" aria-hidden />
                {label}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap gap-3">
            {stores.map(({ name, icon: Icon }) => (
              <div
                key={name}
                role="img"
                aria-label={`${name} — coming soon`}
                className="liquid-glass relative flex min-w-40 flex-1 items-center gap-3 rounded-2xl px-4 py-2.5 text-foreground sm:flex-none"
              >
                <Icon className="size-6 shrink-0" aria-hidden />
                <div aria-hidden className="leading-tight">
                  <div className="font-heading text-sm font-bold">{name}</div>
                  <div className="text-xs text-muted-foreground">Coming Soon</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-md sm:max-w-lg lg:order-1 lg:max-w-none">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-[8%] top-[12%] bottom-[6%] rounded-full bg-linear-to-br from-mint via-brand-green-soft to-brand-green/20 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -left-10 bottom-0 size-56 rounded-full bg-brand-green/10 blur-3xl"
          />
          <img
            src={img.src}
            srcSet={img.srcSet}
            sizes="(min-width: 1280px) 576px, (min-width: 640px) 512px, calc(100vw - 32px)"
            alt="Hostylia mobile app preview showing attendance, room status, fees, notices and parent updates"
            width={img.w}
            height={img.h}
            loading="lazy"
            decoding="async"
            className="relative mx-auto h-auto w-full max-w-xl"
          />
        </div>
      </div>
    </section>
  );
}
