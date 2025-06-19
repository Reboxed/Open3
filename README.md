# Open3

Open3 is a modern, full-stack AI chat application inspired by platforms like ChatGPT, Gemini, and more — created in connection to the [T3 Chat Cloneathon](https://cloneathon.t3.chat/) (we do not infringe any of T3 Chat's brandings, UIs, assets or copyrights nor are we affiliated with, but not exclusive to, T3, Theo or T3 Chat). Built with Next.js, TypeScript, and Node, it supports multi-model chat, file uploads, and real-time streaming, with a clean, mostly modular architecture.

## Features

- **Multi-Model Chat:** Seamlessly chat with multiple AI models (OpenAI, Gemini, Anthropic, and more).
- **File Uploads:** Attach and process files in conversations.
- **Real-Time Streaming:** Enjoy instant responses with Server-Sent Events (SSE).
- **Syntax highlighting and Markdown**
- **BYOK (Bring Your Own Key):** Securely use your own API keys for supported models.
- **Web Search**
- **Robust streams:** You can leave the website, come back, switch between chats or even devices and all your progress will be retained! (Title generation isn't yet robust, wait until title is done generating if you don't wanna loose it)
- **Chat Management:** Create, delete, search, and organize chats with titles and bulk actions.
- **Tabs:** Your device has "tabs" of the chats you currently want to see, you can switch bettwn them, close them, open them, etc. Helps with organizing especially across devices.
- **Works well with keyboard:** Shortcuts below!
- **Message copying/deleting/regenerating**
- **Works well with touch**
- **Extensible:** Modular(-ish?) codebase for easy addition of new models and features.
- **Modern UI:** Responsive, accessible, and beautiful interface.

## Screenshots

<img src="https://github.com/user-attachments/assets/c9a6cd07-4538-41ad-a647-053803705d71" width="512" />
<img src="https://github.com/user-attachments/assets/023dd755-5d9c-4b1b-835f-79dcf6d7faa1" width="512" /><br/>
Chat Palette<br/>
<img src="https://github.com/user-attachments/assets/5dc98f02-83c3-4115-aedc-b7b80072d202" width="512" />

![ezgif-5e212176bf3e47](https://github.com/user-attachments/assets/82dcfb69-fe15-433a-9480-981b1dee3996)

## (Keyboard) Shortcuts

- Global
  - CMD/CTRL+K (Chat Palette/Search)
  - OPT/ALT+TAB (Next tab)
  - OPT/ALT+SHIFT+TAB (Prev tab)
- In-chat
  - OPT/ALT+W (Close tab)
- Chat Palette
  - Shift+Backspace / DELETE (Delete chat)
  - Shift+Click / Touch: Press and Hold (Bulk select)
  - Enter (When in delete mode: Confirm delete chat, otherwise: Open chat)
  - Typing (Search)
  - ESC (Close)

### For the judges: I added the following within the additional 24 hour period for updating our submission

1. Web Search. If you want to judge without it then pull the commit [`559d501`](https://github.com/Reboxed/Open3/tree/559d50181aacf4a8ec0cad8f6655b84bdf7c27aa) instead.

<img width="927" alt="image" src="https://github.com/user-attachments/assets/8648aa1e-8a39-46e9-b64d-617ce81d1258" />

Idk if I misunderstood it but if I did then I at least got you guys covered (I would've probably added web search either way, I loved working on this project).

## Tech Stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS
- **Backend:** Next.js API routes, SSE, Redis
- **Other:** Docker, ESLint, PostCSS

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/en) for development
- [Docker](https://www.docker.com/)

### Installation

**WARNING: THIS APP IS NOT COMPATIBLE WITH SERVERLESS ENVIRONMENTS LIKE VERCEL OR NETLIFY. THIS HANDLING IS COMING LATER.**

1. **Clone the repository:**
   ```sh
   git clone https://github.com/Reboxed/Open3.git
   cd open3
   ```

2. **Configure environment variables:**
   - Copy `.env.example` to `.env` and fill in your API keys and settings.
   - The AI API keys are optional **if** REQUIRE_BYOK is true, but Clerk and NEXT_PUBLIC_APP_URL, are 100% required.

3. **Start the project (via Docker):**
   ```sh
   docker-compose up -d
   ```

4. **Open in your browser:**
   Visit [http://localhost:3000](http://localhost:3000)

#### For Developers

5. **Install dependencies:**
   ```sh
   bun install
   # or
   npm install
   ```

6. **Run the development server:** (you have to modify docker-compose.yml to comment out production build to get just redis running)
   ```sh
   bun run dev
   # or
   npm run dev
   ```

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
3. Image generation
4. Pinning favorite models
5. Chat sharing and Open3 Extensions

### *Chapter 2:* Publishing

1. Migration to Reboxed infrastructure and SDKs since by then probably stable (Rebxd Auth, Rebxd Serverless, Rebxd Storage, Rebxd Realtime DB, etc. What is Rebxd? Right now not yet launched but check out our [Discord](https://discord.gg/xsBn7D9n6K) and YouTube (@rebxdcloud) so yeah)
2. Adding captchas
3. Stripe billing integration
4. Posthog for analytics
5. Mobile app! (We have some really talented mobile devs on the team including me too)
6. Chat sharing and "collaborative chatting" — what that is y'all will find out soon 👀 

And that's as far as I want to plan, more detailed roadmap soon!

## License

Apache 2.0

---

**Open3** — The open, extensible AI chat platform.
