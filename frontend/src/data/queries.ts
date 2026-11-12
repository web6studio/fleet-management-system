import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { FleetSnapshot, Site, UnitCommand } from "../domain/types";
import { applyFrame } from "./apply-frame";
import { apiGet, apiSend, streamUrl } from "./http";
import { type ConnectionState, FleetStream } from "./stream";
import type { AcceptedResponse, AcknowledgeResponse, SitesResponse } from "./wire";

const queryKeys = {
  sites: ["sites"] as const,
  fleet: ["fleet"] as const,
};

/**
 * The buildings. Static between deployments, so it is fetched once and never refetched —
 * the stream carries everything that moves.
 */
export function useSites() {
  return useQuery({
    queryKey: queryKeys.sites,
    queryFn: ({ signal }) => apiGet<SitesResponse>("/sites", signal),
    select: (data): readonly Site[] => data.sites,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * The fleet.
 *
 * Fetched once to bootstrap, then owned by the stream: {@link useFleetStream} writes every frame
 * straight into this cache entry. Refetching is disabled because a poll racing the socket
 * would overwrite newer state with older.
 */
export function useFleet() {
  return useQuery({
    queryKey: queryKeys.fleet,
    queryFn: ({ signal }) => apiGet<FleetSnapshot>("/fleet", signal),
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/**
 * Connects the stream to the fleet cache and reports the connection's own state.
 *
 * A frame the client cannot reconcile means it missed one; it asks for a snapshot and
 * ignores deltas until the answer arrives, rather than rendering a fleet it has guessed at.
 */
export function useFleetStream(): ConnectionState {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ConnectionState>("connecting");

  useEffect(() => {
    const stream = new FleetStream(streamUrl(), {
      onState: setState,
      onFrame: (frame) => {
        let needsResync = false;

        queryClient.setQueryData<FleetSnapshot>(queryKeys.fleet, (current) => {
          const result = applyFrame(current, frame);
          if (result.status === "gap") needsResync = true;
          return result.status === "applied" ? result.snapshot : current;
        });

        if (needsResync) stream.requestResync();
      },
    });

    stream.start();
    return () => stream.stop();
  }, [queryClient]);

  return state;
}

/**
 * Commands are accepted, not applied, so none of these mutations touches the cache.
 *
 * The fleet changes when the server says it changed — the stream delivers that as a frame
 * like any other. Writing an optimistic result here would show an operator a unit they
 * believe they stopped, seconds before it reports that it did not.
 */
export function useUnitCommand() {
  return useMutation({
    mutationFn: ({ unitId, command }: { unitId: string; command: UnitCommand }) =>
      apiSend<AcceptedResponse>("POST", `/units/${encodeURIComponent(unitId)}/commands`, {
        command,
      }),
  });
}

export function useEmergencyStop() {
  return useMutation({
    mutationFn: ({ siteId, engaged }: { siteId: string; engaged: boolean }) =>
      apiSend<AcceptedResponse>("PUT", `/sites/${encodeURIComponent(siteId)}/emergency-stop`, {
        engaged,
      }),
  });
}

export function useAcknowledgeAlarms() {
  return useMutation({
    mutationFn: (seqs: readonly number[]) =>
      apiSend<AcknowledgeResponse>("POST", "/alarms/acknowledge", { seqs }),
  });
}
