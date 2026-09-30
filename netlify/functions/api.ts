import serverless from 'serverless-http';
import { app } from '../../server.ts';

const functionPath = '/.netlify/functions/api';

export const handler = serverless(app, {
  request: (request: object) => {
    const url = (request as { url?: string }).url;
    // Restore the public API prefix when Netlify forwards a rewritten function URL.
    if (url?.startsWith(functionPath)) {
      (request as { url: string }).url = `/api${url.slice(functionPath.length)}`;
    }
  },
});
