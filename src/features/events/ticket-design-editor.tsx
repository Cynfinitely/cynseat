"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select } from "@/components/ui/field";
import { ticketLayouts, type TicketDesign } from "@/domain/events/ticket-design";
import { MAX_IMAGE_BYTES } from "@/domain/images/detect";
import { useRouter } from "@/i18n/navigation";
import { useErrorText } from "@/lib/use-error-text";
import { saveTicketDesignAction } from "./actions";

export function TicketDesignEditor({
  orgSlug,
  eventId,
  title,
  initial,
}: {
  orgSlug: string;
  eventId: string;
  title: string;
  initial: TicketDesign;
}) {
  const t = useTranslations("events.design");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const errorText = useErrorText();
  const [layout, setLayout] = useState(initial.layout);
  const [accent, setAccent] = useState(initial.accent);
  const [note, setNote] = useState(initial.note);
  const [file, setFile] = useState<File | null>(null);
  const [remove, setRemove] = useState(false);
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  const image =
    url || (!remove && initial.artwork ? `data:image/jpeg;base64,${initial.artwork}` : "");
  return (
    <details className="border-line bg-surface mb-7 rounded-2xl border p-5">
      <summary className="text-ink cursor-pointer font-semibold">{t("title")}</summary>
      <form
        className="mt-4 grid gap-5 md:grid-cols-2"
        onChange={() => setNotice("")}
        onSubmit={async (event) => {
          event.preventDefault();
          if (file && file.size > MAX_IMAGE_BYTES) {
            setNotice(errorText("image_too_large") ?? "");
            return;
          }
          const data = new FormData(event.currentTarget);
          setPending(true);
          try {
            const result = await saveTicketDesignAction(orgSlug, eventId, data);
            if (result.ok) {
              if (input.current) input.current.value = "";
              setFile(null);
              setUrl("");
              setRemove(false);
              router.refresh();
            }
            setNotice(
              result.ok
                ? t("saved")
                : (errorText(Object.values(result.fields)[0] ?? result.reason) ?? t("failed")),
            );
          } catch {
            setNotice(t("failed"));
          } finally {
            setPending(false);
          }
        }}
      >
        <fieldset disabled={pending} className="space-y-3">
          <Field id="ticket-layout" label={t("layout")}>
            <Select
              id="ticket-layout"
              name="layout"
              value={layout}
              onChange={(e) => setLayout(e.target.value as TicketDesign["layout"])}
            >
              {ticketLayouts.map((value) => (
                <option value={value} key={value}>
                  {t(value)}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="ticket-image" label={t("image")} hint={t("imageHint")}>
            <input
              className="block w-full text-sm"
              ref={input}
              type="file"
              id="ticket-image"
              name="image"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const selected = e.target.files?.[0] ?? null;
                setFile(selected);
                setUrl(
                  selected && selected.size <= MAX_IMAGE_BYTES ? URL.createObjectURL(selected) : "",
                );
                setRemove(false);
              }}
            />
          </Field>
          {initial.artwork && !file ? (
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                name="remove"
                checked={remove}
                onChange={(e) => setRemove(e.target.checked)}
              />
              {t("remove")}
            </label>
          ) : null}
          <Field id="ticket-accent" label={t("accent")}>
            <input
              type="color"
              id="ticket-accent"
              name="accent"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
            />
          </Field>
          <Field id="ticket-note" label={t("note")}>
            <Input
              id="ticket-note"
              name="note"
              maxLength={140}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <Button type="submit">{t("save")}</Button>
          <p aria-live="polite" className="text-sm">
            {notice}
          </p>
        </fieldset>
        <div>
          <p className="text-muted mb-2 text-sm">{t("preview")}</p>
          <div
            className="border-line rounded-lg border border-t-4 bg-white p-4 text-neutral-900"
            style={{ borderTopColor: accent }}
          >
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element -- local draft preview
              <img
                src={image}
                alt=""
                className={
                  layout === "logo"
                    ? "mb-3 h-12 max-w-full object-contain object-left"
                    : layout === "front"
                      ? "mb-3 max-h-64 w-full object-contain"
                      : "mb-3 h-28 w-full object-contain"
                }
              />
            ) : null}
            <p className="font-semibold">{title}</p>
            {note && <p className="mt-2 text-sm break-words">{note}</p>}
          </div>
          <p className="text-muted mt-2 text-sm">{t("pdfHint")}</p>
        </div>
      </form>
    </details>
  );
}
