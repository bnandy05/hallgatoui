"use client";

import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n/I18nProvider";
import { BUILT_IN_PLATFORMS, platformName } from "@/lib/platforms";
import { normalizeLinkUrl } from "@/lib/url";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";

export function normalizeFeedUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  return normalizeLinkUrl(trimmed.replace(/^webcal:\/\//i, "https://"));
}

export interface FeedFields {
  url: string;
  name: string;
  platformId: string;
  courseId: string;
}

export function CalendarLinkField({
  id, value, error, onChange,
}: {
  id: string;
  value: string;
  error: string | null;
  onChange: (url: string) => void;
}) {
  const t = useT().feeds;
  return (
    <div className="min-w-0 flex-1">
      <Label htmlFor={id}>{t.calendarLink}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t.linkPlaceholder}
        inputMode="url"
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && <p id={`${id}-error`} role="alert" className="mt-1 text-small font-semibold text-danger">{error}</p>}
    </div>
  );
}

export function CalendarFeedOptions({
  id, value, onChange,
}: {
  id: string;
  value: FeedFields;
  onChange: (patch: Partial<FeedFields>) => void;
}) {
  const t = useT();
  const courses = useStore((s) => s.courses);
  const customPlatforms = useStore((s) => s.customPlatforms);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label htmlFor={`${id}-name`}>{t.feeds.name}</Label>
        <Input
          id={`${id}-name`}
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={t.feeds.namePlaceholder}
        />
      </div>
      <div>
        <Label htmlFor={`${id}-platform`}>{t.feeds.platform}</Label>
        <Select id={`${id}-platform`} value={value.platformId} onChange={(e) => onChange({ platformId: e.target.value })}>
          <optgroup label={t.feeds.builtIn}>
            {BUILT_IN_PLATFORMS.map((p) => <option key={p.id} value={p.id}>{platformName(p, t.platforms.other)}</option>)}
          </optgroup>
          {customPlatforms.length > 0 && (
            <optgroup label={t.feeds.custom}>
              {customPlatforms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </optgroup>
          )}
        </Select>
      </div>
      <div>
        <Label htmlFor={`${id}-course`}>{t.feeds.course}</Label>
        <Select id={`${id}-course`} value={value.courseId} onChange={(e) => onChange({ courseId: e.target.value })}>
          <option value="">{t.feeds.autoCourse}</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
    </div>
  );
}
