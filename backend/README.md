# HomeverseAI backend

The backend uses Express, MongoDB Atlas, and MongoDB GridFS. It has no in-memory or browser-storage fallback for accounts, listings, or uploaded media.

## Local development

1. Copy `.env.example` to `.env`.
2. Set `MONGODB_URI` to the HomeverseAI database in your MongoDB Atlas cluster and set a random `JWT_SECRET` of at least 32 characters.
3. Set `REPLICATE_API_TOKEN` to enable real image-to-image generation. Keep all credentials in this backend-only `.env`; never put them in the frontend.
4. From this directory run `npm install`, then `npm run dev`.
5. From `frontend`, run `npm run dev -- --host 0.0.0.0 --port 3001`.

The Vite development server proxies `/api` requests to `http://localhost:4000`. The API refuses to start without a MongoDB URI and JWT secret. Production deployments must provide a persistent Atlas URI, a strong secret, the exact HTTPS frontend origin in `FRONTEND_ORIGIN`, and HTTPS cookies (`COOKIE_SAME_SITE=none`). A separate frontend host also needs `VITE_API_BASE_URL` set before its build. No deployment is performed by this project.

## Persistence

Accounts, role profiles, listings, service requests, enquiries, reviews, and generated-design records are stored in MongoDB. User-uploaded media and successful AI outputs are stored in MongoDB GridFS, not on ephemeral application disk.
