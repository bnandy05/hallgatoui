export interface IcalEventDTO {
  uid: string;
  summary: string;
  start: string; // ISO
  end?: string; // ISO; equals start for all-day and zero-length events
  location?: string;
  url?: string;
  description?: string;
  categories: string[];
}
