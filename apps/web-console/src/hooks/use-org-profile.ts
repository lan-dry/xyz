"use client";

import { useQuery } from "@tanstack/react-query";

import { consoleApi } from "@/lib/api";

export type OrgProfile = {
  organization_id: string;
  name: string;
  slug: string;
  /** A hosted demo tenant (cosmetic: quiet tag, no plan badge, no Production/Sandbox switch). */
  is_demo: boolean;
};

/** Profile of the signed-in organisation. `isDemo` is false until known. */
export function useOrgProfile() {
  const query = useQuery({
    queryKey: ["console", "organization", "profile"],
    staleTime: 5 * 60_000,
    queryFn: async () =>
      (await consoleApi<{ organization: OrgProfile }>("/organization/profile")).organization,
  });
  return { profile: query.data, isDemo: query.data?.is_demo === true };
}
