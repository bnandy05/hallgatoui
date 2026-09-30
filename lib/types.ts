export type PlatformId = string; // built-in ids below or "custom-<id>"

export interface Platform {
  id: PlatformId;
  name: string;
  color: string; // hex
  builtIn: boolean;
}

export interface CourseLink {
  id: string;
  platformId: PlatformId;
  label?: string;
  url: string;
}

export type ResourceKind = "jegyzet" | "zh" | "megoldas" | "video" | "egyeb";

export interface Resource {
  id: string;
  title: string;
  url: string;
  kind: ResourceKind;
  note?: string;
  createdAt: string;
}

export interface Course {
  id: string;
  name: string;
  code?: string;
  semester?: string;
  color: string;
  links: CourseLink[];
  resources: Resource[];
  matchKeywords: string[]; // used to auto-assign iCal events
  createdAt: string;
}

export type DeadlineSource = "manual" | "ical";

export interface Deadline {
  id: string;
  courseId: string | null;
  title: string;
  due: string; // ISO
  platformId?: PlatformId;
  url?: string;
  note?: string;
  critical: boolean;
  done: boolean;
  source: DeadlineSource;
  feedId?: string;
  externalUid?: string;
}

export interface IcalFeed {
  id: string;
  name: string;
  url: string;
  platformId: PlatformId;
  courseId: string | null;
  lastSyncedAt?: string;
  lastError?: string;
}

export interface AppData {
  version: 1;
  courses: Course[];
  deadlines: Deadline[];
  customPlatforms: Platform[];
  feeds: IcalFeed[];
}
