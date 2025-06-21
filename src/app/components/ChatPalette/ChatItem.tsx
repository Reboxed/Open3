import { ApiError, ChatResponse } from "@/internal-lib/types/api";
import { format } from "date-fns";
import { useCallback, useEffect, useState } from "react";
import EditSvg from "../EditSvg";
import CheckmarkSvg from "../CheckmarkSvg";
import TrashSvg from "../TrashSvg";
import CancelSvg from "../CancelSvg";
import StarSvg from "../StarSvg";
import ChatSvg from "../ChatSvg";
import { getSectionLabel, PINNED_SECTION } from "../ChatPalette";

interface ChatItemProps {
    chat: ChatResponse;
    idx: number;
    section?: string;
    isSelected: boolean;
    isBulkSelected?: boolean;
    bulkDeleteMode?: boolean;
    onRenameTrigger?: (id: string, idx: number) => void;
    onRename?: (newLabel: string, id: string, idx: number) => void;
    onRenameCancel?: () => void;
    onRenameInput?: (newLabel: string) => void;
    onDeleteTrigger?: (id: string, idx: number) => void;
    onDelete?: (id: string, idx: number) => void;
    onPinUpdate?: (chatId: string, newPinned: boolean) => void;
    renameId?: string | null;
    pendingDeleteId?: string | null;
    deletingId?: string | null;
}

export default function ChatItem({
    chat,
    idx,
    section,
    isSelected = false,
    isBulkSelected = false,
    bulkDeleteMode = false,
    onRenameTrigger,
    onRename,
    onRenameCancel,
    onDeleteTrigger,
    onDelete,
    onPinUpdate,
    onRenameInput,
    renameId,
    pendingDeleteId,
    deletingId
}: ChatItemProps) {
    const [label, setLabel] = useState(chat.label);
    const timeFormat = useCallback(() => {
        return format(chat.createdAt ?? Date.now(), "HH:mm");
    }, [chat.createdAt])
    const [time, setTime] = useState(timeFormat());

    useEffect(() => {
        setTime(timeFormat());
        // Check if the state actually changed to prevent infinite loops
        if (chat.label !== label) setLabel(chat.label);
    }, [chat, timeFormat]);

    return (
        <>
            {!bulkDeleteMode ? (
                <button
                    className="bg-white/10 backdrop-blur-xl z-10 w-8 h-8 rounded-xl flex justify-center items-center group hover:bg-white/15 transition-all duration-250 child-button cursor-pointer"
                    onClick={() => onPinUpdate?.(chat.id, !chat.pinned)}
                >
                    <span
                        style={{ scale: isSelected ? 0 : 1, opacity: isSelected ? 0 : 1 }}
                        className="absolute group-hover:!scale-0 group-hover:!opacity-0 translate-all duration-250"
                    >
                        <ChatSvg />
                    </span>
                    <span
                        style={{ scale: isSelected ? 1 : 0, opacity: isSelected ? 1 : 0 }}
                        className="absolute group-hover:!scale-100 group-hover:!opacity-100 translate-all duration-250"
                    >
                        <StarSvg highlighted={!!chat.pinned} />
                    </span>
                </button>
            ) : (
                <div className="bg-white/10 backdrop-blur-xl z-10 w-8 h-8 rounded-xl flex justify-center items-center transition-all duration-250 cursor-pointer" style={{
                    backgroundColor: isBulkSelected ? "#3b82f6" : "",
                }}>
                    <span
                        style={{ transform: isBulkSelected ? "scale(1)" : "scale(0)", zIndex: isBulkSelected ? 1 : 0 }}
                        className="absolute inset-0 flex items-center justify-center transition-transform duration-200"
                    >
                        <CheckmarkSvg />
                    </span>
                    <span
                        style={{ transform: isBulkSelected ? "scale(0)" : "scale(1)", zIndex: isBulkSelected ? 0 : 1 }}
                        className="absolute inset-0 flex items-center justify-center transition-transform duration-200"
                    >
                        <ChatSvg />
                    </span>
                </div>
            )}

            {renameId !== chat.id ? (
                <span className="flex-1 truncate">{label ?? "New Chat"}</span>
            ) : (
                <form onSubmit={e => {
                    e.preventDefault();
                    if (label && label !== chat.label) {
                        onRename?.(label, chat.id, idx);
                        return;
                    }
                    e.currentTarget.reset();
                }} className="flex-1 flex items-center">
                    <input
                        inputMode="text"
                        placeholder="New Chat"
                        autoComplete="off"
                        id="chat-label-input"
                        onChange={e => { setLabel(e.currentTarget.value); onRenameInput?.(e.currentTarget.value); }}
                        onFocus={e => e.currentTarget.select()}
                        maxLength={100}
                        autoFocus
                        value={label ?? "New Chat"}
                        className="flex-1 outline-none transition-all duration-250 py-1 focus:py-2 focus:px-2 border-2 border-white/50 focus:border-1 focus:border-white/10 rounded-lg focus:bg-black/10"
                    />
                </form>
            )}
            <span className="ml-2 text-xs text-neutral-400 font-mono">{section === PINNED_SECTION ? `${getSectionLabel(chat.createdAt ?? Date.now())} ${time}` : time}</span>

            { /* Actions */}
            {!bulkDeleteMode && (
                <div className="flex gap-3 group">
                    {/* rename */}
                    <button
                        style={{
                            opacity: isSelected || renameId === chat.id ? 1 : -1,
                            translate: isSelected || renameId === chat.id ? "0 0" : "50px 0",
                            color: renameId === chat.id ? "#fff !important" : undefined,
                            width: 32, height: 32, position: "relative",
                        }}
                        className={`
                            bg-white/10 backdrop-blur-xl z-10 w-8 h-8 rounded-xl text-transparent flex justify-center items-center cursor-pointer ml-auto transition-all duration-200
                            group-hover:!opacity-100 group-hover:!translate-0 hover:!bg-white/20

                            child-button
                        `}
                        onClick={e => {
                            e.stopPropagation();
                            if (renameId === chat.id) {
                                if (label && label !== chat.label) {
                                    onRename?.(label, chat.id, idx)
                                }
                            } else {
                                onRenameTrigger?.(chat.id, idx);
                            }
                        }}
                    >
                        <span
                            className="absolute inset-0 flex items-center justify-center transition-transform duration-200"
                            style={{ transform: renameId === chat.id ? "scale(0)" : "scale(1)", zIndex: renameId === chat.id ? 0 : 1 }}
                        >
                            <EditSvg />
                        </span>
                        <span
                            className="absolute inset-0 flex items-center justify-center transition-transform duration-200"
                            style={{ transform: renameId === chat.id ? "scale(1)" : "scale(0)", zIndex: renameId === chat.id ? 1 : 0 }}
                        >
                            <CheckmarkSvg />
                        </span>
                    </button>

                    {/* delete */}
                    <button
                        style={{
                            opacity: isSelected || renameId === chat.id ? 1 : -1,
                            translate: isSelected || renameId === chat.id ? "0 0" : "50px 0",
                            color: pendingDeleteId === chat.id ? "#fff !important" : undefined,
                            border: pendingDeleteId === chat.id && renameId !== chat.id ? "1px solid #ef4444" : undefined,
                            width: 32, height: 32, position: "relative",
                        }}
                        className={`
                            bg-white/10 backdrop-blur-xl z-10 w-8 h-8 rounded-xl text-transparent flex justify-center items-center cursor-pointer ml-auto transition-all duration-200
                            group-hover:!opacity-100 group-hover:!translate-0 hover:bg-white/20
                            ${pendingDeleteId === chat.id && renameId !== chat.id ? "!bg-red-500" : ""}

                            child-button
                        `}
                        onClick={e => {
                            e.stopPropagation();
                            if (renameId === chat.id) {
                                setLabel(chat.label);
                                onRenameCancel?.();
                                return;
                            }

                            if (deletingId) return;
                            if (pendingDeleteId === chat.id) {
                                onDelete?.(chat.id, idx);
                            } else {
                                onDeleteTrigger?.(chat.id, idx);
                            }
                        }}
                    >
                        <span
                            className="absolute inset-0 flex items-center justify-center transition-transform duration-200"
                            style={{ transform: pendingDeleteId === chat.id || renameId === chat.id ? "scale(0)" : "scale(1)", zIndex: pendingDeleteId === chat.id || renameId === chat.id ? 0 : 1 }}
                        >
                            <TrashSvg />
                        </span>
                        <span
                            className="absolute inset-0 flex items-center justify-center transition-transform duration-200"
                            style={{ transform: pendingDeleteId === chat.id && renameId !== chat.id ? "scale(1)" : "scale(0)", zIndex: pendingDeleteId === chat.id && renameId !== chat.id ? 1 : 0 }}
                        >
                            <CheckmarkSvg />
                        </span>
                        <span
                            className="absolute inset-0 flex items-center justify-center transition-transform duration-200"
                            style={{ transform: renameId === chat.id ? "scale(1)" : "scale(0)", zIndex: renameId === chat.id ? 1 : 0 }}
                        >
                            <CancelSvg />
                        </span>
                    </button>
                </div>
            )}
        </>
    );
}
