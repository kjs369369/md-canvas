import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/main.js", "src/view.js"],
  bundle: true,
  splitting: true,
  format: "esm",
  outdir: "prototype/js",
  minify: true,
  target: ["es2022"],
  sourcemap: false,
  chunkNames: "chunk-[hash]",
  entryNames: "[name]",
});
