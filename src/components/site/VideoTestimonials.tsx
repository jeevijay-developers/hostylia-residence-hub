import { useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, Quote, Star } from "lucide-react";
import { SectionHeading } from "@/components/site/Primitives";

import vid1 from "@/assets/testimonials/testimonial-1.mp4";
import vid2 from "@/assets/testimonials/testimonial-2.mp4";
import vid3 from "@/assets/testimonials/testimonial-3.mp4";
import vid4 from "@/assets/testimonials/testimonial-4.mp4";
import p1 from "@/assets/testimonials/testimonial-poster-1.jpg";
import p2 from "@/assets/testimonials/testimonial-poster-2.jpg";
import p3 from "@/assets/testimonials/testimonial-poster-3.jpg";
import p4 from "@/assets/testimonials/testimonial-poster-4.jpg";

type Testimonial = {
  src: string;
  poster: string;
  name: string;
  role: string;
  quote: string;
  tag: string;
};

const testimonials: Testimonial[] = [
  {
    src: vid1,
    poster: p1,
    name: "Operator",
    role: "240-bed PG chain",
    quote: "Collections jumped 22% in the first quarter on Hostylia.",
    tag: "Finance",
  },
  {
    src: vid2,
    poster: p2,
    name: "Warden",
    role: "Boarding school",
    quote: "Wardens finally get their evenings back. One screen, every block.",
    tag: "Operations",
  },
  {
    src: vid3,
    poster: p3,
    name: "Parent",
    role: "Student family",
    quote: "I stopped calling the warden. The app tells me everything.",
    tag: "Parent App",
  },
  {
    src: vid4,
    poster: p4,
    name: "Founder",
    role: "Co-living chain",
    quote: "Hostylia is the only platform we run our portfolio on.",
    tag: "Owner",
  },
];

function VideoCard({ t }: { t: Testimonial }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const v = ref.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  return (
    <figure className="group relative">
      {/* Glow */}
      <div className="pointer-events-none absolute -inset-3 rounded-[2.75rem] bg-gradient-to-br from-[color:var(--brand-blue)]/20 via-soft-teal/15 to-gold/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />

      {/* Phone frame */}
      <div className="relative mx-auto w-full max-w-[260px] rounded-[2.25rem] border border-dark-border bg-[color:var(--navy)] p-2 shadow-2xl">
        <div className="relative overflow-hidden rounded-[1.85rem] border border-dark-border bg-black">
          <div className="relative aspect-[9/16]">
            <video
              ref={ref}
              src={t.src}
              poster={t.poster}
              playsInline
              preload="metadata"
              onEnded={() => setPlaying(false)}
              onClick={toggle}
              className="h-full w-full object-cover"
            />

            {/* Notch */}
            <div className="pointer-events-none absolute left-1/2 top-2 z-20 h-5 w-20 -translate-x-1/2 rounded-full bg-black/80" />

            {/* Tag pill */}
            <div className="pointer-events-none absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-soft-teal" />
              {t.tag}
            </div>

            {/* Bottom gradient + caption */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4">
              <div className="text-[11px] font-semibold text-soft-teal">{t.role}</div>
              <div className="text-sm font-extrabold text-white">{t.name}</div>
            </div>

            {/* Play overlay */}
            {!playing && (
              <button
                onClick={toggle}
                aria-label="Play testimonial"
                className="absolute inset-0 z-20 grid place-items-center bg-gradient-to-b from-black/10 via-black/20 to-black/40 transition-opacity hover:bg-black/30"
              >
                <span className="grid h-14 w-14 place-items-center rounded-full bg-gold text-navy shadow-2xl ring-4 ring-white/20 transition-transform group-hover:scale-110">
                  <Play size={22} className="ml-0.5" fill="currentColor" />
                </span>
              </button>
            )}

            {/* Controls when playing */}
            {playing && (
              <div className="absolute bottom-3 right-3 z-30 flex gap-2">
                <button
                  onClick={toggleMute}
                  aria-label={muted ? "Unmute" : "Mute"}
                  className="grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur-sm hover:bg-black/80"
                >
                  {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
                <button
                  onClick={toggle}
                  aria-label="Pause"
                  className="grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur-sm hover:bg-black/80"
                >
                  <Pause size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quote card under the phone */}
      <figcaption className="mx-auto mt-5 max-w-[280px] rounded-2xl border border-dark-border bg-card p-4 text-center">
        <div className="mx-auto flex w-fit gap-0.5 text-gold">
          {Array.from({ length: 5 }).map((_, i) => <Star key={i} size={11} fill="currentColor" />)}
        </div>
        <Quote className="mx-auto mt-2 text-soft-teal" size={14} />
        <blockquote className="mt-1 text-xs leading-relaxed text-white">"{t.quote}"</blockquote>
      </figcaption>
    </figure>
  );
}

export function VideoTestimonials() {
  return (
    <section className="relative overflow-hidden border-y border-dark-border bg-section-dark py-20">
      {/* Ambient backdrop */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--brand-blue)_22%,transparent),transparent_70%)] blur-3xl" />
        <div className="absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--soft-teal)_22%,transparent),transparent_70%)] blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 md:px-6">
        <SectionHeading
          eyebrow="Video Testimonials"
          title="Hear it from operators, wardens and parents"
          desc="Real voices from properties live on Hostylia — tap any card to play."
        />
        <div className="mt-14 grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
          {testimonials.map((t) => <VideoCard key={t.name} t={t} />)}
        </div>
      </div>
    </section>
  );
}
