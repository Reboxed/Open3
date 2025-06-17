# Open3

Open3 is a modern, full-stack AI chat application inspired by platforms like ChatGPT, Gemini, and more. Built with Next.js, TypeScript, and Bun, it supports multi-model chat, file uploads, and real-time streaming, with a clean, extensible architecture.

## Features

- **Multi-Model Chat:** Seamlessly chat with multiple AI models (OpenAI, Gemini, Anthropic, and more).
- **File Uploads:** Attach and process files in conversations.
- **Real-Time Streaming:** Enjoy instant responses with Server-Sent Events (SSE).
- **Chat Management:** Create, delete, search, and organize chats with titles and bulk actions.
- **Tabs:** Your device has "tabs" of the chats you currently want to see, you can switch bettwn them, close them, open them, etc. Helps with organizing especially across devices.
- **Works well with keyboard:** Command+k (Ctrl+K) for Chat-Palette, Opt+W (Alt+W) for closing a tab, Opt+Tab/Opt+Shift+Tab (Alt+Tab/Alt+Shift+Tab) for switching to the next/previous tab, **in chat palette** shift+backspace or delete key for deleting a chat, enter for entering a chat (and creating a new tab), shift+click for bulk selecting, etc.
- **Message copying/deleting/regenerating**
- **Syntax highlighting and Markdown**
- **Works well with touch**
- **BYOK (Bring Your Own Key):** Securely use your own API keys for supported models.
- **Extensible:** Modular(-ish?) codebase for easy addition of new models and features.
- **Modern UI:** Responsive, accessible, and beautiful interface.

## Tech Stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS
- **Backend:** Next.js API routes, SSE, Redis
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
- `src/lib/` — Utilities, types, and helpers
- `src/internal-lib/` — Backend used libraries like reddis, event busses, types, and more.
- `src/internal-lib/constants.ts` — Shared constants
- `public/` — Static assets
- `public/uploads` — Uploads

## API Routes

- `/api/chat` — Main chat endpoint
- `/api/models` — List available models
- `/api/upload` — File uploads
- `/api/byok` — BYOK endpoints
- `/attachments` — "Virtual attachment" endpoint

## Customization & Extensibility

- BYOK functionality
- Extend chat logic in `src/app/api/chat/`
- Customize UI in `src/app/components/` and `src/app/` (page.tsx/layout.tsx)

## Contributing

1. Fork the repo
2. Create a new branch (`git checkout -b feature/your-feature`)
3. Follow CONTRIBUTING.md
4. Commit your changes
5. Push to your fork and open a Pull Request

## Roadmap

### *Chapter 1:* Right after the cloneathon
1. A bit of a refactor/touch ups/speed improvements
2. Implement message editing + chat branching + model switching mid-chat.
3. Image generation and web search
4. Pinning favorite models
5. Chat sharing
### *Chapter 2:* Publishing
6. Migration to Reboxed infrastructure and SDKs since by then probably stable (Rebxd Auth, Rebxd Serverless, Rebxd Storage, Rebxd Realtime DB, etc. What is Rebxd? Right now not yet launched but check out our [Discord](https://discord.gg/xsBn7D9n6K) and YouTube (@rebxdcloud) so yeah)
7. Adding captchas
8. Clerk billing integration
9. Posthog for analytics
10. Mobile app! (We have some really talented mobile devs on the team including me too)
11. Chat sharing and "collaborative chatting" — what that is y'all will find out soon 👀 

And that's as far as I want to plan, more detailed roadmap soon!

## License

Apache 2.0

---

**Open3** — The open, extensible AI chat platform.
