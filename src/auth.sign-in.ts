import { authClient } from "~/auth.client";

export const signInGithub = async () => {
  const data = await authClient.signIn.social({
    provider: "github",
  });
  return data;
};
