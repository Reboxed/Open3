# Open3

Open3 is a modern, full-stack AI chat application inspired by platforms like ChatGPT, Gemini, and more. Built with Next.js, TypeScript, and Bun, it supports multi-model chat, file uploads, and real-time streaming, with a clean, extensible architecture.

## Features

- **Multi-Model Chat:** Seamlessly chat with multiple AI models (OpenAI, Gemini, Anthropic, and more).
- **File Uploads:** Attach and process files in conversations.
- **Real-Time Streaming:** Enjoy instant responses with Server-Sent Events (SSE).
- **Chat Management:** Create, delete, and organize chats with titles and bulk actions.
- **BYOK (Bring Your Own Key):** Securely use your own API keys for supported models.
- **Extensible:** Modular codebase for easy addition of new models and features.
- **Modern UI:** Responsive, accessible, and beautiful interface.

## Tech Stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS
- **Backend:** Next.js API routes, Bun, Redis
- **Other:** Docker, ESLint, PostCSS

## Getting Started

### Prerequisites
- [Bun](https://bun.sh/) (or Node.js)
- [Docker](https://www.docker.com/) (for Redis)

### Installation

1. **Clone the repository:**
   ```sh
   git clone https://github.com/yourusername/open3.git
   cd open3
   ```
2. **Install dependencies:**
   ```sh
   bun install
   # or
   npm install
   ```

3. **Configure environment variables:**
   - Copy `.env.example` to `.env` and fill in your API keys and settings.
   - The AI API keys are optional **if** REQUIRE_BYOK is true.

4. **Start the project (via Docker):**
   ```sh
   docker-compose up -d
   ```

5. **Run the development server:**
   ```sh
   bun run dev
   # or
   npm run dev
   ```

6. **Open in your browser:**
   Visit [http://localhost:3000](http://localhost:3000)

## Project Structure

- `src/app/` — Next.js app directory (pages, API routes, components)
- `src/lib/` — Utilities, Redis, event bus, and helpers
- `src/constants.ts` — Shared constants
- `public/` — Static assets and uploads

## API Routes

- `/api/chat` — Main chat endpoint
- `/api/models` — List available models
- `/api/upload` — File uploads
- `/api/byok` — BYOK endpoints
- `/api/attachments` — File attachment handling

## Customization & Extensibility

- Add new models in `src/lib/utils/`
- Extend chat logic in `src/app/api/chat/`
- Customize UI in `src/app/components/`

## Contributing

1. Fork the repo
2. Create a new branch (`git checkout -b feature/your-feature`)
3. Commit your changes
4. Push to your fork and open a Pull Request

## License

MIT

---

**Open3** — The open, extensible AI chat platform.
