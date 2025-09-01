import type { useRouter } from "@tanstack/react-router";
import { authClient } from "~/auth.client";
import { queryClient } from "~/query-client";

export const appSignOut = async (router: ReturnType<typeof useRouter>) => {
  // localStorage.removeItem(activeOrganizationKey);
  await authClient.signOut();
  await router.invalidate();

  return () => queryClient.invalidateQueries();
};
