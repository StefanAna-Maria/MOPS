import { useCallback, useEffect, useState } from "react";

export const RESEND_COOLDOWN_SECONDS = 30;

export function formatCountdown(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// Counts down from 30 seconds; `restart` starts it again after a new code was sent.
export function useResendCountdown() {
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) {
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const restart = useCallback(() => setSecondsLeft(RESEND_COOLDOWN_SECONDS), []);

  return { secondsLeft, restart };
}
