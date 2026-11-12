# HomeverseAI frontend

This is the existing HomeverseAI React/Vite application. It calls the Express API for accounts, property listings, Home Partner profiles, enquiries, service requests, reviews, and AI designs; it does not persist application data in browser storage.

## Local development

1. Configure and start the backend using the instructions in [`../backend/README.md`](../backend/README.md).
2. From this directory run `npm install`.
3. Run `npm run dev -- --host 0.0.0.0 --port 3001`.

The Vite development server proxies `/api` to the backend on port `4000`. For a production frontend build served separately from the API, copy `.env.example` to `.env.local` and set `VITE_API_BASE_URL` to the HTTPS API origin ending in `/api`. This variable is public configuration; never put database or AI credentials in frontend environment variables.
