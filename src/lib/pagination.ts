export const PAGE_SIZE = 25;

// Ответ PostgREST, когда запрошенной страницы больше нет.
const RANGE_NOT_SATISFIABLE = 'PGRST103';

export type Page<T> = { rows: T[]; total: number };

type RangeResponse<T> = {
  data: T[] | null;
  error: (Error & { code?: string }) | null;
  count: number | null;
};

export async function fetchPage<T>(
  page: number,
  query: (from: number, to: number) => PromiseLike<RangeResponse<T>>,
): Promise<Page<T>> {
  const from = (page - 1) * PAGE_SIZE;
  const { data, error, count } = await query(from, from + PAGE_SIZE - 1);
  if (error?.code === RANGE_NOT_SATISFIABLE) return { rows: [], total: 0 };
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}
