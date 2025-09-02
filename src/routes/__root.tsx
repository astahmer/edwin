/// <reference types="vite/client" />

import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import type * as React from "react";
import { DefaultCatchBoundary } from "~/components/default-catch-boundary";
import { NotFound } from "~/components/not-found";
import type { AppRouterContext } from "~/routes/-root.context";
import appCss from "~/styles/app.css?url";
import { seo } from "~/utils/seo";

export const Route = createRootRouteWithContext<AppRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      ...seo({
        title: "Edwin Stars",
        description: `GitHub Stars Organizer`,
      }),
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicon.png",
      },
      { rel: "manifest", href: "/site.webmanifest", color: "#fffff" },
    ],
    // scripts: [
    //   {
    //     src: '/customScript.js',
    //     type: 'text/javascript',
    //   },
    // ],
  }),
  errorComponent: (props) => {
    return (
      <RootDocument>
        <DefaultCatchBoundary {...props} />
      </RootDocument>
    );
  },
  notFoundComponent: () => <NotFound />,
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <TanStackDevtools
          plugins={[
            {
              name: "TanStack Query",
              render: <ReactQueryDevtools initialIsOpen position="right" />,
            },
            {
              name: "TanStack Router",
              render: <TanStackRouterDevtools initialIsOpen position="bottom-right" />,
            },
          ]}
        />

        <Scripts />
      </body>
    </html>
  );
}
