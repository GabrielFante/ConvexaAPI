import { z } from "zod";

export const DEFAULT_PER_PAGE = 20;
export const MAX_PER_PAGE = 100;

export const paginationQuerySchema = z.object({
  page: z.coerce
    .number()
    .int()
    .min(1, "page deve ser maior ou igual a 1")
    .default(1),
  perPage: z.coerce
    .number()
    .int()
    .min(1, `perPage deve estar entre 1 e ${MAX_PER_PAGE}`)
    .max(MAX_PER_PAGE, `perPage deve estar entre 1 e ${MAX_PER_PAGE}`)
    .default(DEFAULT_PER_PAGE),
});

export type Pagination = z.infer<typeof paginationQuerySchema>;

export type Page<T> = {
  data: T[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
};

export function toPrismaPage({ page, perPage }: Pagination) {
  return { skip: (page - 1) * perPage, take: perPage };
}

export function buildPage<T>(
  data: T[],
  total: number,
  { page, perPage }: Pagination,
): Page<T> {
  return {
    data,
    meta: {
      page,
      perPage,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / perPage),
    },
  };
}
