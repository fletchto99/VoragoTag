// Ambient declarations for webpack asset imports handled by loaders.
declare module "*.html";
declare module "*.png";

// webpack's require() used to load detection images via alt1's imagedata-loader.
declare function require(path: string): any;
