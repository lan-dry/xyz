export type BusLogLevel = "info" | "warn" | "error";

export interface BusLogEntry {
  level: BusLogLevel;
  trace_id: string;
  msg: string;
  event_id?: string;
  subject?: string;
  stream?: string;
  consumer?: string;
  detail?: string;
}

export type BusLogger = (entry: BusLogEntry) => void;

export const consoleBusLogger: BusLogger = (entry) => {
  console.log(JSON.stringify(entry));
};
