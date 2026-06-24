const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");

/**
 * @param {Record<string, unknown>} _env
 * @param {{ mode?: string }} argv
 * @returns {import("webpack").Configuration}
 */
module.exports = (_env, argv) => {
  const isProduction = argv.mode === "production";

  return {
    context: path.resolve(__dirname, "src"),
    entry: {
      main: "./index.ts",
    },
    output: {
      path: path.resolve(__dirname, "dist"),
      library: { type: "umd", name: "VoragoTag" },
      clean: true,
    },
    // Source maps in development for debugging; none in production.
    devtool: isProduction ? false : "source-map",
    externals: ["sharp", "canvas", "electron/common"],
    optimization: {
      // The minimizers only run when optimization.minimize is on, which webpack
      // enables automatically in production mode, so this is mode-aware.
      minimizer: [
        // Strip the (noise) license-style banner comments rather than extract
        // them to a separate main.js.LICENSE.txt sidecar file.
        new TerserPlugin({
          extractComments: false,
          terserOptions: { format: { comments: false } },
        }),
        new CssMinimizerPlugin(),
      ],
    },
    resolve: {
      extensions: [".wasm", ".tsx", ".ts", ".mjs", ".jsx", ".js"],
    },
    module: {
      rules: [
        { test: /\.tsx?$/, loader: "ts-loader" },
        // Extract CSS into a standalone main.css (linked from index.html)
        // instead of injecting it at runtime via JavaScript.
        { test: /\.css$/, use: [MiniCssExtractPlugin.loader, "css-loader"] },
        {
          test: /\.(png|jpg|jpeg|gif|webp)$/,
          type: "asset/resource",
          generator: { filename: "[base]" },
        },
        { test: /\.(html|json)$/, type: "asset/resource", generator: { filename: "[base]" } },
        { test: /\.data\.png$/, loader: "alt1/imagedata-loader", type: "javascript/auto" },
        { test: /\.fontmeta.json/, loader: "alt1/font-loader" },
      ],
    },
    plugins: [new MiniCssExtractPlugin()],
  };
};
