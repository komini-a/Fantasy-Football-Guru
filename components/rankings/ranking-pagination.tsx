import { Icon } from "@/components/icon";

export function RankingPagination({
  page,
  totalPages,
  disabled,
  loading,
  onPage,
}: {
  page: number;
  totalPages: number;
  disabled: boolean;
  loading: boolean;
  onPage: (page: number) => void;
}) {
  return (
    <nav className="ranking-pagination" aria-label="Rankings pages">
      <button
        type="button"
        className="pagination-arrow previous-arrow"
        aria-label="Previous page"
        disabled={disabled || page <= 1}
        onClick={() => onPage(page - 1)}
      >
        <Icon name="arrow" />
      </button>
      <span aria-live="polite">
        {loading ? (
          "Loading page…"
        ) : (
          <>
            Page <strong>{page}</strong> of {Math.max(1, totalPages)}
          </>
        )}
      </span>
      <button
        type="button"
        className="pagination-arrow"
        aria-label="Next page"
        disabled={disabled || page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        <Icon name="arrow" />
      </button>
    </nav>
  );
}
