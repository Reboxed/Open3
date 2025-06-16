import { NEW_TITLE_EVENT } from "./app/lib/constants";

export const TITLE_PROMPT = `Generate ONLY a title of the main topic or intent of this request in a clearly and concisely (max 50 characters).
The title should accurately reflect what the user is asking or discussing, and be engaging and easy to understand.
NEVER generate \`${NEW_TITLE_EVENT}\` as a title.`;