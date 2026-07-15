import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  emailLoginSchema,
  phoneLoginSchema,
  type EmailLoginInput,
  type PhoneLoginInput,
} from "@/schemas/auth";
import { supabase } from "@/integrations/supabase/client";
import { sendPhoneOtp } from "@/lib/auth-otp.functions";

type Mode = "phone" | "email";

export function LoginForm({ defaultMode = "phone" as Mode }: { defaultMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(defaultMode);

  return (
    <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="phone" className="min-h-11">Phone OTP</TabsTrigger>
        <TabsTrigger value="email" className="min-h-11">Email &amp; Password</TabsTrigger>
      </TabsList>
      <TabsContent value="phone" className="mt-6">
        <PhoneForm />
      </TabsContent>
      <TabsContent value="email" className="mt-6">
        <EmailForm />
      </TabsContent>
    </Tabs>
  );
}

function PhoneForm() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PhoneLoginInput>({
    resolver: zodResolver(phoneLoginSchema),
    defaultValues: { phone: "" },
  });

  const onSubmit = async (values: PhoneLoginInput) => {
    setSubmitting(true);
    try {
      await sendPhoneOtp({ data: { phone: values.phone } });
      navigate({ to: "/verify-otp", search: { phone: values.phone } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not send OTP. Please try again.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone number</Label>
        <Input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+91 98765 43210"
          className="min-h-11"
          aria-invalid={errors.phone ? "true" : undefined}
          {...register("phone")}
        />
        {errors.phone ? (
          <p className="text-sm text-destructive" role="alert">{errors.phone.message}</p>
        ) : (
          <p className="text-xs text-muted-foreground">We'll send a 6-digit code to this number.</p>
        )}
      </div>
      <Button type="submit" disabled={submitting} className="min-h-11 w-full">
        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Send code
      </Button>
    </form>
  );
}

function EmailForm() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmailLoginInput>({
    resolver: zodResolver(emailLoginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: EmailLoginInput) => {
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      navigate({ to: "/post-login" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign-in failed. Please try again.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@hostel.com"
          className="min-h-11"
          aria-invalid={errors.email ? "true" : undefined}
          {...register("email")}
        />
        {errors.email ? (
          <p className="text-sm text-destructive" role="alert">{errors.email.message}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          className="min-h-11"
          aria-invalid={errors.password ? "true" : undefined}
          {...register("password")}
        />
        {errors.password ? (
          <p className="text-sm text-destructive" role="alert">{errors.password.message}</p>
        ) : null}
      </div>
      <Button type="submit" disabled={submitting} className="min-h-11 w-full">
        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Sign in
      </Button>
    </form>
  );
}
