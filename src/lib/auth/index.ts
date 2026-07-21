type OAuthProvider = "google" | "apple" | "microsoft" | "lovable";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

export const lovable = {
  auth: {
    signInWithOAuth: async (_provider: OAuthProvider, _opts?: SignInOptions) => {
      return {
        redirected: false,
        error: new Error(
          "OAuth is not configured in this standalone Barry app. Add your auth provider here when you enable hosted sign-in."
        ),
      };
    },
  },
};

