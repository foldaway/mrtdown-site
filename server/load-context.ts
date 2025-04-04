import type { AppLoadContext } from 'react-router';
import type { PlatformProxy } from 'wrangler';

// Run npm run typecheck to generate Cloudflare types!!!

// Define environment interface
export type CF = Omit<PlatformProxy<Env>, 'dispose'> & { env: Cloudflare.Env }; // This is the Cloudflare environment
declare module 'react-router' {
  interface AppLoadContext {
    cloudflare: CF;
  }
}

export type GetLoadContext = (args: {
  request: Request;
  context: { cloudflare: CF } & AppLoadContext; // load context _before_ augmentation
}) => AppLoadContext;

export const getLoadContext: GetLoadContext = ({ context }) => {
  return {
    ...context,
  };
};
