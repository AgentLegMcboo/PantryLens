/** Serial, durable queue. A job is removed only after the server acknowledges it. */
export interface QueueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface IntakeJob {
  id: string;
  userId: string;
  pantryId: string;
  source: "donation" | "shelf_audit" | "manual";
  locationId: string | null;
  createdAt: string;
  items: Record<string, unknown>[];
  photos: { uri: string; width: number; height: number }[];
}

export function isNetworkError(error: unknown): boolean {
  const e = error as { message?: string; status?: number; code?: string };
  // Policy/validation/server errors must be shown, never disguised as offline.
  return (
    !e?.code &&
    (!e?.status || e.status === 0) &&
    /network|failed to fetch|fetch failed|load failed|offline|timeout|timed out/i.test(
      e?.message ?? String(error),
    )
  );
}

export function createOutbox(storage: QueueStorage, key: string) {
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T>(run: () => Promise<T>): Promise<T> => {
    const result = tail.then(run, run);
    tail = result.catch(() => {});
    return result;
  };
  const read = async (): Promise<IntakeJob[]> => {
    const raw = await storage.getItem(key);
    if (!raw) return [];
    const jobs = JSON.parse(raw);
    if (!Array.isArray(jobs))
      throw new Error("The saved intake queue could not be read.");
    return jobs;
  };
  return {
    list: () => serial(read),
    add: (job: IntakeJob) =>
      serial(async () => {
        const jobs = await read();
        if (!jobs.some((j) => j.id === job.id)) jobs.push(job);
        await storage.setItem(key, JSON.stringify(jobs));
      }),
    remove: (id: string) =>
      serial(async () => {
        await storage.setItem(
          key,
          JSON.stringify((await read()).filter((j) => j.id !== id)),
        );
      }),
  };
}
