// esbuild's "text" loader turns .css imports into strings.
declare module "*.css" {
  const css: string;
  export default css;
}
