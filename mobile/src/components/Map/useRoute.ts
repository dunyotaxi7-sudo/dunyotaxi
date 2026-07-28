import { useQuery } from "@tanstack/react-query";
import { getRoute } from "./routing";
import type { Coords } from "./types";

/**
 * Road-following polyline points between two coords, for the <Map route> prop.
 * Returns the OSRM geometry once loaded, a straight line meanwhile / on failure,
 * or undefined until both points exist. Safe to call unconditionally.
 */
export function useRoutePoints(
  from?: Coords | null,
  to?: Coords | null,
): Coords[] | undefined {
  const q = useQuery({
    queryKey: ["route", from?.lat, from?.lng, to?.lat, to?.lng],
    queryFn: () => getRoute(from!, to!),
    enabled: Boolean(from && to),
    staleTime: 5 * 60 * 1000,
  });
  if (!from || !to) return undefined;
  return q.data?.points ?? [from, to];
}
