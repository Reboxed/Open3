import { EventEmitter } from "events";

export const CHAT_TITLE_GENERATE_EVENT = "chat-title-generate";

class ChatEventBus extends EventEmitter {
    constructor() {
        super();
        // Increase max listeners to handle multiple concurrent SSE connections
        this.setMaxListeners(100);
        
        // Add error handling
        this.on("error", (error) => {
            console.error("EventBus error:", error);
        });
    }
    
    // Helper method to safely emit events
    safeEmit(event: string, ...args: unknown[]): boolean {
        try {
            return this.emit(event, ...args);
        } catch (error) {
            console.error(`Error emitting event ${event}:`, error);
            return false;
        }
    }
    
    // Helper method to safely add listeners with error handling
    safeOn(event: string, listener: (...args: unknown[]) => void): this {
        const wrappedListener = (...args: unknown[]) => {
            try {
                listener(...args);
            } catch (error) {
                console.error(`Error in event listener for ${event}:`, error);
                this.emit("error", error);
            }
        };
        
        return this.on(event, wrappedListener);
    }
}

declare global {
  var eventBus: ChatEventBus | undefined;
}

let eventBus: ChatEventBus;
{
    if (!global.eventBus) {
        global.eventBus = new ChatEventBus();
    }
    eventBus = global.eventBus;
}

export default eventBus;

