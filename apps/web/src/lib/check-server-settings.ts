import { config } from './config';

// Loaded by instrumentation.ts in the Node.js runtime only, as the server starts: a setting the
// server reads at run time stops it here, by name, instead of failing the first request.
try {
  config.serverGatewayUrl();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
