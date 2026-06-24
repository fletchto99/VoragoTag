// Ambient declarations for webpack asset imports handled by loaders.
declare module "*.html";
declare module "*.png";
declare module "*.css";

// webpack's require() used to load detection images via alt1's imagedata-loader.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare function require(path: string): any;
