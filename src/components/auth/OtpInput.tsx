import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

/**
 * 6-digit OTP input using shadcn input-otp (auto-advance, paste support).
 * Auto-submits via onComplete when 6 digits entered.
 */
export function OtpInput({ value, onChange, onComplete, disabled, autoFocus }: OtpInputProps) {
  return (
    <InputOTP
      maxLength={6}
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      disabled={disabled}
      autoFocus={autoFocus}
      containerClassName="justify-center"
    >
      <InputOTPGroup>
        {Array.from({ length: 6 }).map((_, i) => (
          <InputOTPSlot
            key={i}
            index={i}
            // 44px minimum touch target
            className="h-12 w-12 text-lg sm:h-14 sm:w-12"
          />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}
