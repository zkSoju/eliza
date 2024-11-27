import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.ts"],
    outDir: "dist",
    sourcemap: true,
    dts: true,
    clean: true,
    format: ["esm"], // Ensure you're targeting CommonJS
    external: [
        "readline",
        // Add other modules you want to externalize
    ],
});
