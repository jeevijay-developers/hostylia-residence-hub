import { FlaskConical } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/finance";

/**
 * Shown instead of the Razorpay Checkout modal when payment_simulation_mode
 * is enabled for the tenant (see supabase/functions/razorpay-create-order).
 * No real money moved — this is the one surface every student/parent sees
 * that unambiguously says so.
 */
export function SimulatedPaymentSuccessDialog({
  open,
  onOpenChange,
  amountPaise,
  paymentNumber,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amountPaise: number;
  paymentNumber: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm text-center">
        <DialogHeader className="items-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-warning/15 text-warning">
            <FlaskConical className="h-7 w-7" />
          </span>
          <DialogTitle className="mt-2">Payment Successful</DialogTitle>
          <Badge variant="warning" className="mt-1">
            SIMULATED — no real money moved
          </Badge>
          <DialogDescription className="mt-2">
            This was a test payment recorded for demo purposes only.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1 rounded-xl border border-border/80 bg-muted/30 p-4">
          <p className="text-2xl font-bold text-foreground">{formatInr(amountPaise)}</p>
          <p className="font-mono text-xs text-muted-foreground">{paymentNumber}</p>
        </div>
        <DialogFooter>
          <Button className="w-full" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
