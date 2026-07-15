import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdmissionForm } from "@/components/students/AdmissionForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/apply/$propertySlug")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Apply for admission — Hostylia" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PublicApplyPage,
});

function PublicApplyPage() {
  const { propertySlug } = Route.useParams();
  const [property, setProperty] = useState<{ name: string; city: string } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("properties")
        .select("name, city, status")
        .eq("slug", propertySlug)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (!data || data.status !== "ACTIVE") {
        setNotFound(true);
      } else {
        setProperty({ name: data.name, city: data.city });
      }
    })();
  }, [propertySlug]);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-2xl">
            {property ? `Apply to ${property.name}` : notFound ? "Property not found" : "Loading…"}
          </CardTitle>
          {property && (
            <p className="text-sm text-muted-foreground">
              {property.city} • Fill in your details to start the admission process.
            </p>
          )}
        </CardHeader>
        <CardContent>
          {notFound && (
            <p className="text-sm text-muted-foreground">
              The property link you followed isn't active. Please contact the hostel for a valid application link.
            </p>
          )}
          {property && !submittedRef && (
            <AdmissionForm propertySlug={propertySlug} onSuccess={setSubmittedRef} />
          )}
          {submittedRef && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-bed-vacant" />
              <h3 className="font-display text-xl font-semibold">Application received</h3>
              <p className="text-sm text-muted-foreground">
                Reference number:{" "}
                <span className="font-mono font-semibold text-foreground">{submittedRef}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                The hostel team will contact you shortly. Save this reference for follow-up.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
