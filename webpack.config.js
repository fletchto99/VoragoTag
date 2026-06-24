const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");

/**
 * @type {import("webpack").Configuration}
 */
module.exports = {
  context: path.resolve(__dirname, "src"),
  entry: {
    main: "./index.ts",
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    library: { type: "umd", name: "VoragoTag" },
  },
  devtool: false,
  externals: ["sharp", "canvas", "electron/common"],
  optimization: {
    minimizer: [
      // Keep the default Terser minifier, but strip the (noise) license-style
      // banner comments instead of extracting them to a separate
      // main.js.LICENSE.txt sidecar file.
      new TerserPlugin({
        extractComments: false,
        terserOptions: { format: { comments: false } },
      }),
    ],
  },
  resolve: {
    extensions: [".wasm", ".tsx", ".ts", ".mjs", ".jsx", ".js"],
  },
  module: {
    rules: [
      { test: /\.tsx?$/, loader: "ts-loader" },
      { test: /\.css$/, use: ["style-loader", "css-loader"] },
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
};
