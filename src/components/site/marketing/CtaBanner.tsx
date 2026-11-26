import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { marketingAssets } from "./marketing-assets";

type CtaAction = { label: string; to: "/book-demo" | "/contact" | "/solutions"; icon: LucideIcon };

const building = marketingAssets.ctaBuilding;

/**
 * Emerald closing call-to-action banner, shared by every marketing page; the
 * site footer renders right after it. lg+: building bottom-left, copy in the
 * right half. Below lg: the building sits above centred copy.
 */
export function CtaBanner({
  title,
  desc,
  primary,
  secondary,
}: {
  title: string;
  desc: string;
  primary: CtaAction;
  secondary: CtaAction;
}) {
  return (
    <section className="bg-linear-to-b from-mint/50 to-background py-16 md:py-20">
      <div className="mx-auto w-full max-w-7xl px-4 md:px-6">
        <div className="relative rounded-[2rem] bg-linear-to-br from-brand-green to-brand-green-strong px-5 pb-8 pt-6 text-brand-green-foreground shadow-xl shadow-brand-green-strong/25 sm:px-10 sm:pb-10 lg:py-14 lg:pl-[50%] lg:pr-12">
          {/* Decorative light sweeps and the lg+ building, clipped to the banner's rounded shape. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-[2rem]"
          >
            <div className="absolute -left-1/4 inset-y-0 w-1/2 -skew-x-12 bg-linear-to-r from-transparent via-brand-green-foreground/10 to-transparent dark:via-foreground/20" />
            <div className="absolute left-1/2 inset-y-0 w-1/5 -skew-x-12 bg-linear-to-r from-transparent via-brand-green-foreground/5 to-transparent dark:via-foreground/10" />
            <div className="absolute -right-24 -top-28 size-80 rounded-full bg-brand-green-foreground/10 blur-3xl dark:bg-foreground/20" />
            <div className="absolute -bottom-32 right-1/4 size-72 rounded-full bg-brand-green-strong/60 blur-3xl" />
            <img
              src={building.src}
              srcSet={building.srcSet}
              sizes="(min-width: 1280px) 567px, 44vw"
              alt=""
              width={building.w}
              height={building.h}
              loading="lazy"
              decoding="async"
              className="absolute bottom-0 left-4 hidden h-auto w-[46%] lg:block"
            />
          </div>

          <img
            src={building.src}
            srcSet={building.srcSet}
            sizes="(min-width: 640px) 384px, 288px"
            alt=""
            aria-hidden
            width={building.w}
            height={building.h}
            loading="lazy"
            decoding="async"
            className="relative mx-auto h-auto w-72 sm:w-96 lg:hidden"
          />

          <div className="relative mt-4 text-center lg:mt-0 lg:text-left">
            <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl">{title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-brand-green-foreground/85 sm:text-base">
              {desc}
            </p>
            <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center lg:justify-start">
              <Button asChild variant="on-brand" size="pill-lg">
                <Link to={primary.to}>
                  <primary.icon aria-hidden />
                  {primary.label}
                </Link>
              </Button>
              <Button asChild variant="on-brand-outline" size="pill-lg">
                <Link to={secondary.to}>
                  <secondary.icon aria-hidden />
                  {secondary.label}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
