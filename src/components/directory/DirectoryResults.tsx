/**
 * The directory's denial gate, shared by /directory and /validators.
 *
 * ## Why this component exists at all
 *
 * <DirectoryGrid> receives the query as PROPS, so it holds no query key and
 * cannot remove its own cache entry. That is a placement constraint, not an
 * exemption from the withdrawal policy: the key exists wherever the hook is
 * called, which was the page component — and a page also owns filter and
 * URL state, so gating there would mean gating the filters too.
 *
 * So the hook call moves down here instead, into the smallest component
 * that can be unmounted without taking the filters with it. The gate is the
 * parent, the hook is the child, and removing the cache entry after the
 * child unmounts is what keeps it from refetching into the same denial.
 *
 * Both pages read nothing from the query except to hand it to the grid
 * (checked: zero `query.` references in either page), so this is a lift of
 * two lines rather than a redesign.
 */

"use client";

import { DirectoryGrid } from "@/components/directory/DirectoryGrid";
import { LoadFailure } from "@/components/ui/LoadFailure";
import {
  shouldWithdrawOnDenial,
  useDenialGate,
  useReportDenial,
} from "@/lib/api/resource-denial";
import {
  directoryQueryKey,
  useDirectory,
  type DirectoryFilters,
} from "@/hooks/useDirectory";

/** Shown once the server has withdrawn permission to read the directory. */
const DIRECTORY_WITHDRAWN_COPY = "You can’t browse the directory.";

export function DirectoryResults({ filters }: { filters: DirectoryFilters }) {
  // Keyed on the FILTER SET, exactly as the hook is — so changing a filter
  // is a different resource and never inherits the previous refusal.
  const gate = useDenialGate(directoryQueryKey(filters));

  if (gate.withdrawn) {
    return (
      <div className="bcc-panel mx-auto max-w-md p-6 text-center">
        <LoadFailure message={DIRECTORY_WITHDRAWN_COPY} />
      </div>
    );
  }

  return <DirectoryResultsData filters={filters} onDenied={gate.withdraw} />;
}

function DirectoryResultsData({
  filters,
  onDenied,
}: {
  filters: DirectoryFilters;
  onDenied: () => void;
}) {
  const query = useDirectory(filters);

  // A denied REFRESH of the results already on screen withdraws them. A
  // denied next page does not — it says nothing about the page already
  // served under its own authorised 200.
  useReportDenial(
    shouldWithdrawOnDenial(query.error, query.isRefetchError, query.data !== undefined),
    onDenied,
  );

  return <DirectoryGrid query={query} />;
}
