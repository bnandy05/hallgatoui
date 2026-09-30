export interface IcalEventDTO {
  uid: string;
  summary: string;
  start: string; // ISO
  url?: string;
  description?: string;
  categories: string[];
}
