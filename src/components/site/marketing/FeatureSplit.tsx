import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { ChecklistCopy } from "./MarketingPrimitives";
import type { MarketingImage } from "./marketing-assets";

/**
 * Section with checklist copy on one side and an illustration on a soft mint
 * glow on the other. Copy always comes first on mobile.
 */
export function FeatureSplit({
  copy,
  image,
  imageAlt,
  imageSide = "right",
  sectionClassName,
}: {
  copy: ComponentProps<typeof ChecklistCopy>;
  image: MarketingImage;
  imageAlt: string;
  imageSide?: "left" | "right";
  sectionClassName?: string;
}) {
  const isImageLeft = imageSide === "left";
  return (
    <section className={cn("overflow-hidden py-16 md:py-20", sectionClassName)}>
      <div
        className={cn(
          "mx-auto grid max-w-7xl items-center gap-12 px-4 md:px-6 lg:gap-10",
          isImageLeft
            ? "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]"
            : "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]",
        )}
      >
        <div className={cn(isImageLeft && "lg:order-2")}>
          <ChecklistCopy {...copy} />
        </div>

        <div className={cn("relative min-w-0", isImageLeft && "lg:order-1")}>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-[8%] inset-y-[6%] rounded-full bg-linear-to-br from-mint via-brand-green-soft to-brand-green/20 blur-3xl"
          />
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-0 size-56 rounded-full bg-brand-green/10 blur-3xl",
              isImageLeft ? "-left-10" : "-right-10",
            )}
          />
          <img
            src={image.src}
            srcSet={image.srcSet}
            sizes="(min-width: 1280px) 672px, (min-width: 1024px) 54vw, (min-width: 704px) 672px, calc(100vw - 32px)"
            alt={imageAlt}
            width={image.w}
            height={image.h}
            loading="lazy"
            decoding="async"
            className="relative mx-auto h-auto w-full max-w-2xl"
          />
        </div>
      </div>
    </section>
  );
}
