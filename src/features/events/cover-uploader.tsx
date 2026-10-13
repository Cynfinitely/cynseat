"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { controlProps, Field } from "@/components/ui/field";
import { MAX_IMAGE_BYTES } from "@/domain/images/detect";
import { useRouter } from "@/i18n/navigation";
import { useErrorText } from "@/lib/use-error-text";
import { removeEventCoverAction, setEventCoverAction } from "./actions";
import { useActionForm } from "./use-action-form";

export function CoverUploader({
  orgSlug,
  eventId,
  coverImageUrl,
  disabled,
}: {
  orgSlug: string;
  eventId: string;
  coverImageUrl: string | null;
  disabled: boolean;
}) {
  const t = useTranslations("events.cover");
  const errorText = useErrorText();
  const router = useRouter();
  const form = useActionForm();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [tooLarge, setTooLarge] = useState(false);
  const error = tooLarge ? errorText("image_too_large") : form.fieldError("cover");

  async function run(action: () => ReturnType<typeof removeEventCoverAction>) {
    setPending(true);
    await form.submit(async () => {
      const outcome = await action();
      return outcome.ok ? { ok: true as const, data: true } : outcome;
    });
    setPending(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <form
      className="max-w-xl"
      onSubmit={(event) => {
        event.preventDefault();
        const file = input.current?.files?.[0];
        if (!file) return;
        // Checked here too, so a large file is not uploaded just to be refused.
        setTooLarge(file.size > MAX_IMAGE_BYTES);
        if (file.size > MAX_IMAGE_BYTES) return;
        const data = new FormData();
        data.set("cover", file);
        void run(() => setEventCoverAction(orgSlug, eventId, data));
      }}
    >
      <fieldset disabled={disabled || pending} className="space-y-4">
        {form.saved && !error ? <Alert tone="success">{t("saved")}</Alert> : null}
        {form.formError ? <Alert tone="danger">{form.formError}</Alert> : null}
        {coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- organizer upload, sized by CSS
          <img
            src={coverImageUrl}
            alt={t("current")}
            className="border-line aspect-[16/9] w-full rounded-xl border object-cover"
          />
        ) : null}
        <Field id="cover" label={t("choose")} hint={t("hint")} error={error}>
          <input
            ref={input}
            type="file"
            name="cover"
            accept="image/jpeg,image/png,image/webp"
            required
            className="file:bg-brand-50 file:text-brand-700 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-2 file:font-semibold"
            {...controlProps("cover", { error, hint: t("hint") })}
          />
        </Field>
        <div className="flex gap-2">
          <Button type="submit">{t("upload")}</Button>
          {coverImageUrl ? (
            <Button
              variant="ghost"
              onClick={() => run(() => removeEventCoverAction(orgSlug, eventId))}
            >
              {t("remove")}
            </Button>
          ) : null}
        </div>
      </fieldset>
    </form>
  );
}
