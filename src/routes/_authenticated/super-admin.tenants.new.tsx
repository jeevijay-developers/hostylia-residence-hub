import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowLeft, Building2, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { z } from "zod";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createHostelWithAdmin, listPlans } from "@/lib/super-admin.functions";
import { getErrorMessage } from "@/lib/utils";

const formSchema = z.object({
  hostelName: z.string().min(1, "Required"),
  slug: z.string().min(1, "Required"),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  contactPhone: z.string().optional(),
  adminName: z.string().min(1, "Required"),
  adminEmail: z.string().email("Invalid email"),
  adminPhone: z.string().optional(),
  planId: z.string().min(1, "Required"),
  status: z.enum(["ACTIVE", "TRIAL"]).default("ACTIVE"),
});

const STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", 
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", 
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", 
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", 
  "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", 
  "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"
];

export const Route = createFileRoute("/_authenticated/super-admin/tenants/new")({
  component: AddHostelPage,
});

function AddHostelPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createFn = useServerFn(createHostelWithAdmin);
  const listPlansFn = useServerFn(listPlans);

  const { data: plans = [] } = useQuery({
    queryKey: ["plans"],
    queryFn: () => listPlansFn({}),
  });

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      hostelName: "",
      slug: "",
      address: "",
      city: "",
      state: "",
      contactPhone: "",
      adminName: "",
      adminEmail: "",
      adminPhone: "",
      planId: "",
      status: "ACTIVE",
    },
  });

  // Auto-generate slug when hostelName changes
  const hostelName = form.watch("hostelName");
  const formSlug = form.watch("slug");

  const mutation = useMutation({
    mutationFn: (data: z.infer<typeof formSchema>) => createFn({ data }),
    onSuccess: () => {
      toast.success("Hostel created successfully. Admin invitation queued.");
      qc.invalidateQueries({ queryKey: ["all-tenants"] });
      navigate({ to: "/super-admin/tenants" });
    },
    onError: (e) => {
      toast.error(getErrorMessage(e, "Failed to create hostel"));
    },
  });

  function onSubmit(data: z.infer<typeof formSchema>) {
    mutation.mutate(data);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-24 lg:pb-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="shrink-0" asChild>
          <Link to="/super-admin/tenants">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <PageHeader
          title="Create Hostel"
          description="Create a new hostel and invite the primary administrator."
        />
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          
          {/* Section 1: Hostel Details */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-4 flex items-center text-lg font-semibold text-foreground">
              <Building2 className="mr-2 h-5 w-5 text-primary" />
              1. Hostel Details
            </h2>
            <div className="grid gap-6 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="hostelName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hostel Name *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter hostel name"
                        {...field}
                        onChange={(e) => {
                          field.onChange(e);
                          if (!form.formState.touchedFields.slug || formSlug === "") {
                            form.setValue("slug", e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""));
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hostel Slug *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. hostylia-residence" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="sm:col-span-2">
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter complete address" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter city" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>State</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select state" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {STATES.map((state) => (
                          <SelectItem key={state} value={state}>
                            {state}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contactPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Number</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter hostel phone number" type="tel" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Section 2: Hostel Admin Details */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-4 flex items-center text-lg font-semibold text-foreground">
              <ShieldCheck className="mr-2 h-5 w-5 text-primary" />
              2. Hostel Admin Details
            </h2>
            <div className="grid gap-6 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="adminName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter admin full name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="adminEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email *</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter admin email address" type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="adminPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter admin phone number" type="tel" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Section 3: Subscription */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-4 flex items-center text-lg font-semibold text-foreground">
              <CreditCard className="mr-2 h-5 w-5 text-primary" />
              3. Subscription
            </h2>
            <div className="grid gap-6 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="planId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select Plan *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a plan" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {plans.map((plan) => (
                          <SelectItem key={plan.id} value={plan.id}>
                            {plan.name} ({(plan.price_paise / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })} / {plan.billing_interval})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ACTIVE">Active</SelectItem>
                        <SelectItem value="TRIAL">Trial</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Action Bar */}
          <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-border bg-card/80 p-4 backdrop-blur-md lg:static lg:bg-transparent lg:p-0 lg:border-none lg:backdrop-blur-none">
            <div className="mx-auto flex max-w-4xl items-center justify-end gap-3">
              <Button type="button" variant="outline" asChild>
                <Link to="/super-admin/tenants">Cancel</Link>
              </Button>
              <Button type="submit" disabled={mutation.isPending} className="bg-primary text-primary-foreground">
                {mutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Create Hostel
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
