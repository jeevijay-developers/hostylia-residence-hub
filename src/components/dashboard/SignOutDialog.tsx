import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { signOut } from "@/lib/auth";
import { usePropertyStore } from "@/stores/property-store";

interface SignOutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  confirmLabel?: string;
}

export function SignOutDialog({
  open,
  onOpenChange,
  title = "Logout?",
  confirmLabel = "Logout",
}: SignOutDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            You'll need to sign in again to get back to your dashboard.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => {
              try {
                await signOut();
              } finally {
                // The persisted property belongs to this user's tenant — don't
                // carry it over to whoever signs in next on this browser. Wipe
                // the stored copy only after the network call: a mounted
                // PropertySwitcher reconciles a null in-memory selection back to
                // its first property while signOut() is in flight, so resetting
                // state up front would just be re-persisted. clearStorage()
                // leaves in-memory state alone, so nothing rewrites it before
                // the hard redirect below drops the store.
                usePropertyStore.persist.clearStorage();
                window.location.href = "/login";
              }
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
