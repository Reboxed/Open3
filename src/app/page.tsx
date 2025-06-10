import ChatInput from "./components/chatInput";

export default function Home() {
    return (
        <div className="min-w-full min-h-full flex flex-col gap-4 justify-between items-center">
            <div className="min-h-full w-full">.</div>
            <ChatInput />
        </div>
    );
}

