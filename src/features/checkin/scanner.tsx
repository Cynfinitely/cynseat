"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { controlProps, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { scanTicketAction, undoCheckInAction, type ScanResponse } from "./actions";

type Props = {
  orgSlug: string;
  eventId: string;
  timezone: string;
  canUndo: boolean;
  initialProgress: { checkedIn: number; total: number };
};

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };

/** The browser's own QR reader where there is one, otherwise a bundled fallback. */
async function createDetector(): Promise<Detector> {
  const native = (globalThis as { BarcodeDetector?: new (options: object) => Detector })
    .BarcodeDetector;
  if (native) return new native({ formats: ["qr_code"] });
  const { BarcodeDetector } = await import("barcode-detector/ponyfill");
  return new BarcodeDetector({ formats: ["qr_code"] });
}

/** Seconds a code is ignored after being read, so one ticket held up is not scanned twice. */
const REPEAT_GUARD_MS = 4000;

export function Scanner({ orgSlug, eventId, timezone, canUndo, initialProgress }: Props) {
  const t = useTranslations("events.checkin");
  const tSeat = useTranslations("seating.ticket");
  const format = useFormatter();
  const video = useRef<HTMLVideoElement>(null);
  const last = useRef({ code: "", at: 0 });
  const busy = useRef(false);
  const [camera, setCamera] = useState<"off" | "on" | "error" | "unsupported">("off");
  const [progress, setProgress] = useState(initialProgress);
  const [outcome, setOutcome] = useState<ScanResponse>();
  const [offline, setOffline] = useState(false);
  const [manual, setManual] = useState("");

  /** Sends one scan, repeating it with the same id until the server has answered. */
  const submit = useCallback(
    async (code: string) => {
      if (busy.current || !code.trim()) return;
      busy.current = true;
      const scanId = crypto.randomUUID();
      try {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          try {
            const result = await scanTicketAction(orgSlug, eventId, { code: code.trim(), scanId });
            setOffline(false);
            if (result.ok) {
              setOutcome(result.data);
              setProgress(result.data.progress);
            }
            return;
          } catch {
            // No answer: say so plainly, then ask again. Never guess a result.
            setOffline(true);
            setOutcome(undefined);
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
        }
      } finally {
        busy.current = false;
      }
    },
    [orgSlug, eventId],
  );

  useEffect(() => {
    if (camera !== "on") return;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let stopped = false;

    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) return setCamera("unsupported");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (stopped || !video.current) return stream.getTracks().forEach((track) => track.stop());
        video.current.srcObject = stream;
        await video.current.play();
        const detector = await createDetector();
        timer = setInterval(async () => {
          if (!video.current || busy.current) return;
          const [found] = await detector.detect(video.current).catch(() => []);
          if (!found) return;
          const now = Date.now();
          if (found.rawValue === last.current.code && now - last.current.at < REPEAT_GUARD_MS)
            return;
          last.current = { code: found.rawValue, at: now };
          void submit(found.rawValue);
        }, 250);
      } catch {
        setCamera("error");
      }
    })();

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [camera, submit]);

  const accepted = outcome?.result === "accepted";

  return (
    <div className="max-w-xl space-y-6">
      <p className="text-ink text-lg font-semibold" aria-live="polite">
        {t("progress", progress)}
      </p>

      {/* The answer is announced at once and is never colour alone. */}
      <div aria-live="assertive" aria-atomic="true">
        {offline ? <Alert tone="danger">{t("offline")}</Alert> : null}
        {outcome ? (
          <div
            className={cn(
              "rounded-xl border-2 p-5",
              accepted
                ? "border-green-700 bg-green-50 text-green-900"
                : "border-red-700 bg-red-50 text-red-900",
            )}
          >
            <p className="text-2xl font-bold">
              <span aria-hidden>{accepted ? "✓ " : "✕ "}</span>
              {t(`result.${outcome.result}`)}
            </p>
            {outcome.ticket ? (
              <p className="mt-2 text-sm">
                {t("holder", {
                  description: outcome.ticket.description,
                  name: outcome.ticket.buyerName,
                  reference: outcome.ticket.reference,
                })}
              </p>
            ) : null}
            {outcome.ticket?.seat ? (
              <p className="mt-1 text-lg font-semibold">{tSeat("seat", outcome.ticket.seat)}</p>
            ) : null}
            {outcome.result === "duplicate" && outcome.ticket?.checkedInAt ? (
              <p className="mt-1 text-sm font-semibold">
                {t("usedAt", {
                  time: format.dateTime(new Date(outcome.ticket.checkedInAt), {
                    timeStyle: "short",
                    timeZone: timezone,
                  }),
                })}
              </p>
            ) : null}
            {canUndo && outcome.ticket && (accepted || outcome.result === "duplicate") ? (
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={async () => {
                  const result = await undoCheckInAction(orgSlug, eventId, outcome.ticket!.id);
                  if (result.ok) {
                    setProgress(result.data);
                    setOutcome(undefined);
                  }
                }}
              >
                {t("undo")}
              </Button>
            ) : null}
          </div>
        ) : !offline ? (
          <p className="text-muted border-line rounded-xl border-2 border-dashed p-5">
            {t("ready")}
          </p>
        ) : null}
      </div>

      <section className="space-y-3">
        {camera === "error" ? <Alert tone="warning">{t("cameraError")}</Alert> : null}
        {camera === "unsupported" ? <Alert tone="warning">{t("cameraUnsupported")}</Alert> : null}
        {camera === "on" ? (
          <>
            <video
              ref={video}
              muted
              playsInline
              className="aspect-square w-full rounded-xl bg-black object-cover"
            />
            <p className="text-muted text-sm">{t("cameraHelp")}</p>
          </>
        ) : null}
        <Button
          variant={camera === "on" ? "secondary" : "primary"}
          onClick={() => setCamera(camera === "on" ? "off" : "on")}
        >
          {camera === "on" ? t("stopCamera") : t("startCamera")}
        </Button>
      </section>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(manual).then(() => setManual(""));
        }}
      >
        <h2 className="text-ink text-lg font-semibold">{t("manualTitle")}</h2>
        <Field id="manual-code" label={t("manualLabel")}>
          <Input
            {...controlProps("manual-code", {})}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={manual}
            onChange={(event) => setManual(event.target.value)}
          />
        </Field>
        <Button type="submit" variant="secondary">
          {t("manualSubmit")}
        </Button>
      </form>
    </div>
  );
}
