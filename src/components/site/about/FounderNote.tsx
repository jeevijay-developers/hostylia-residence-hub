import { Link } from "@tanstack/react-router";
import { ArrowRight, Quote, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingHeading } from "@/components/site/marketing/MarketingPrimitives";
import { marketingAssets } from "@/components/site/marketing/marketing-assets";

const photo = marketingAssets.founder;

export function FounderNote() {
  return (
    <section className="bg-background py-16 md:py-20">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <MarketingHeading
          chip="Our founder"
          chipIcon={UserRound}
          title="Meet the person behind Hostylia"
        />

        <figure className="mx-auto mt-12 grid max-w-5xl items-center gap-8 rounded-[2rem] border border-brand-green/10 bg-linear-to-br from-mint via-mint/60 to-card p-6 shadow-card-ambient md:grid-cols-[auto_1fr] md:gap-12 md:p-10">
          <img
            src={photo.src}
            alt="Vikas Patel, Founder & CEO of Hostylia"
            width={photo.w}
            height={photo.h}
            loading="lazy"
            decoding="async"
            className="mx-auto aspect-[4/5] w-48 rounded-3xl object-cover shadow-card-ambient ring-4 ring-card md:w-56"
          />
          <div>
            <Quote className="size-8 text-brand-green" aria-hidden />
            <blockquote className="mt-4 font-heading text-xl font-semibold leading-relaxed text-foreground md:text-2xl">
              “Hostylia was created to simplify the way residential businesses manage students,
              parents, staff, rooms, fees and daily operations through one intelligent platform.”
            </blockquote>
            <figcaption className="mt-6">
              <div className="font-heading text-lg font-bold text-foreground">Vikas Patel</div>
              <div className="text-sm text-muted-foreground">
                Founder &amp; CEO, Hostylia · Jeevijay Technologies Private Limited
              </div>
            </figcaption>
            <Button asChild variant="glass" size="pill" className="mt-6">
              <Link to="/founder">
                Read the founder&apos;s story <ArrowRight />
              </Link>
            </Button>
          </div>
        </figure>
      </div>
    </section>
  );
}
