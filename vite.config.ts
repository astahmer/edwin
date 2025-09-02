import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
// import jsxSource from "unplugin-jsx-source/vite";

// const defaultTransformFileName = (
//   id: string,
//   loc: {
//     start: { line: number; column: number };
//     end: { line: number; column: number };
//   }
// ) => {
//   const fileName = id.split("/").slice(-2).join("/") ?? "unknown";
//   return `${fileName}:${loc.start.line}`;
// };

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    devtools(),
    // jsxSource(),
    tailwindcss() as any,
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tanstackStart({ customViteReactPlugin: true, target: "vercel" }),
    viteReact(),
  ],
});
