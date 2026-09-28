# Atlas Forge

AI-assisted construction plan takeoff, measurement, markup, and estimating platform powered by Athena.

## Architecture

- **Atlas Forge**: standalone frontend and product
- **Atlas Prime / Supabase**: authentication, access control, feedback, and shared licensing backend
- **Atlas Solutions**: separate product and repository; integration is only enabled for licensed clients that use both products

This repository is intentionally independent from Atlas Solutions.
