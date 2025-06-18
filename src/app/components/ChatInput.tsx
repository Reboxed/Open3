"use client";

import Image from "next/image";
import { useEffect, useState, useRef, FormEventHandler } from "react";
import Dropdown from "./Dropdown";
import { ModelCapabilities } from "../lib/types/ai";
import { escape as escapeHtml } from "html-escaper";

type OptionalReturn<T> = void | T | Promise<void> | Promise<T>;
type ChatInputProps = {
    /**
     * @returns the new value to set the input field to after. Default is "".
    **/
    onSend?: (message: string, attachments: { url: string; filename: string }[], model: string, provider: string) => OptionalReturn<string>;
    className?: string;
    generating?: boolean;
    model?: string | null | undefined;
    provider?: string | null | undefined;
    isModelFixed?: boolean;
    onModelChange?: (model: string, provider: string) => void;
};

function ErrorToast({ message, onClose }: { message: string, onClose: () => void }) {
    useEffect(() => {
        const timer = setTimeout(onClose, 3500);
        return () => clearTimeout(timer);
    }, [onClose]);
    return (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded shadow-lg z-50 animate-fade-in">
            {message}
        </div>
    );
}

export default function ChatInput({ onSend,
    className, generating, isModelFixed = false,
    model: initialModel, provider: initialProvider, onModelChange
}: ChatInputProps) {
    const labelRef = useRef<HTMLLabelElement>(null);
    const inputRef = useRef<HTMLDivElement>(null);
    const [inputValue, setInputValue] = useState("");
    // const [makeImage, setMakeImage] = useState(false);
    // const [search, setSearch] = useState(false);
    const [enableAttachments, setEnableAttachments] = useState(false);
    const [attachments, setAttachments] = useState<{ url: string; filename: string }[]>([]);
    const [errorToast, setErrorToast] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [model, setModel] = useState(initialModel);
    const [provider, setProvider] = useState(initialProvider);
    const [modelCapabilities, setModelCapabilities] = useState(new Map<string, ModelCapabilities>());

    useEffect(() => {
        const label = labelRef.current;
        if (!label) return;
        label.hidden = inputValue.trim() != "" || inputValue.trim().split("\n").length > 2;
    }, [inputValue])

    // Fetch model capabilities
    useEffect(() => {
        if (isModelFixed) {
            if ((!model || !provider) && initialModel && initialProvider) {
                setModel(initialModel);
                setProvider(initialProvider);
                onModelChange?.(initialModel, initialProvider);
            }
            if (!model || !provider) return;
            fetch(`/api/models?model=${encodeURIComponent(model)}&provider=${encodeURIComponent(provider)}`)
                .then(res => res.json())
                .then((filtered: [string, ModelCapabilities][]) => {
                    setModelCapabilities(new Map(filtered));
                })
                .catch(() => {
                    setModelCapabilities(new Map());
                });
        } else {
            fetch("/api/models")
                .then(res => res.json())
                .then((allCaps: [string, ModelCapabilities][]) => {
                    setModelCapabilities(new Map(allCaps));
                })
                .catch(() => {
                    setModelCapabilities(new Map());
                });
        }
    }, [isModelFixed, model, provider, initialModel, initialProvider, onModelChange]);

    // Set initial model and provider after fetching capabilities
    useEffect(() => {
        if ((modelCapabilities?.size ?? 0) > 0 && !isModelFixed) {
            const found = modelCapabilities?.get(model ?? "") || modelCapabilities?.values().find(m => m.name === model);
            if (!found) {
                const model = modelCapabilities?.get("google/gemini-2.5-flash") || modelCapabilities?.values()?.toArray()?.[0];
                if (!model) return;
                setModel(model.model);
                setProvider(model.provider);
                onModelChange?.(model.model, model.provider);
            }
        }
    }, [modelCapabilities, model, onModelChange, isModelFixed]);

    // Find the selected model's capabilities
    const selectedModel = modelCapabilities?.get(model ?? "") || // First check if the model is directly set
        modelCapabilities?.values().find(m => m.name === model) || // Then check if the model name matches the display name?? (idk just in case)
        modelCapabilities?.get("google/gemini-2.5-flash") || // Fallback to a default model if nothing matches
        modelCapabilities?.values()?.toArray()?.[0]; // Finally, if gemini also doesn't exist, just use the first one

    const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        const uploaded: { url: string; filename: string }[] = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const formData = new FormData();
            formData.append("file", file);
            try {
                const res = await fetch("/api/upload", { method: "POST", body: formData });
                if (res.ok) {
                    const data = await res.json();
                    uploaded.push({ url: data.url, filename: data.filename });
                } else {
                    const err = await res.json().catch(() => ({}));
                    setErrorToast(err.error || "Upload failed");
                }
            } catch (e) {
                setErrorToast("Upload failed");
            }
        }
        setAttachments(prev => [...prev, ...uploaded]);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const onRemoveAttachment = async (filename: string) => {
        setAttachments(prev => prev.filter(a => a.filename !== filename));
        // Attempt to delete the uploaded file via API (nulled lookup key)
        try {
            await fetch(`/api/upload?filename=${encodeURIComponent(filename)}`, { method: "DELETE" });
        } catch (error) {
            console.error("Failed to delete attachment:", filename, error);
        }
    };

    const onSubmitForm = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (generating) return;
        if (!inputValue && attachments.length === 0) return;
        if (!model || !provider) return;

        const newContentRaw = onSend?.(inputValue, attachments, model, provider);
        const newContent = newContentRaw instanceof Promise ? await newContentRaw : newContentRaw;

        const input = inputRef.current;
        if (input) {
            input.innerText = newContent ?? "";
            setInputValue((newContent ?? ""));
        }
        setAttachments([]);
    }

    const onInput: FormEventHandler<HTMLDivElement> = (e) => {
        setInputValue(e.currentTarget.innerText);
    }

    // Hide attachment button if not supported by selected model
    const showAttachmentButton = selectedModel?.supportsAttachmentsImages;

    return (
        <div className={`bg-[#222121] rounded-[36px] flex flex-col justify-stretch shadow-[inset_0_0_35px_#000,0_8px_20px_rgba(0,0,0,0.1)]/30 sticky bottom-6 max-md:bottom-4 ${className}`} style={{
            backgroundImage: "",
        }}>
            {errorToast && <ErrorToast message={errorToast} onClose={() => setErrorToast(null)} />}
            <form onSubmit={onSubmitForm}>
                <div className="bg-[#252424] rounded-[36px] flex flex-col p-6 justify-center cursor-text gap-4 relative shadow-2xl z-5">
                    <label ref={labelRef} htmlFor="chat" className="text-neutral-50/50 absolute top-6 pointer-events-none">Ask anything to us...</label>
                    <div
                        ref={inputRef} onInput={onInput} onChange={onInput}
                        onPaste={(e) => {
                            e.preventDefault();
                            const text = e.clipboardData.getData("text/plain");
                            const formatted = escapeHtml(text.replace(/\t/g, "    "));
                            const lines = formatted.split("\n");
                            const fragment = document.createDocumentFragment();

                            lines.forEach((line, idx) => {
                                if (idx > 0) {
                                    fragment.appendChild(document.createElement("br"));
                                }
                                // Replace spaces with &nbsp; for each line
                                const span = document.createElement("span");
                                span.innerHTML = line.replace(/ /g, "&nbsp;");
                                fragment.appendChild(span);
                            });

                            const sel = window.getSelection();
                            if (sel && sel.rangeCount > 0) {
                                const range = sel.getRangeAt(0);
                                range.deleteContents();
                                range.insertNode(fragment);

                                // Move cursor to the end of the inserted content
                                range.collapse(false);
                                sel.removeAllRanges();
                                sel.addRange(range);
                            }

                            // Scroll to bottom
                            e.currentTarget.scrollTop = e.currentTarget.scrollHeight;
                            setInputValue(e.currentTarget.innerText);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault(); // prevent newline
                                // Call your submit function here
                                onSubmitForm();
                            }
                        }}
                        contentEditable
                        id="chat"
                        className="max-h-[250px] w-full overflow-auto outline-none min-h-14"
                    />

                    <div className="flex justify-between items-stretch gap-5">
                        <div className="flex gap-3 items-stretch">
                            {/* Only render dropdown if modelCapabilities are loaded and model is not fixed */}
                            {(() => {
                                return !isModelFixed && (modelCapabilities?.size ?? 0) > 0 && (
                                    <Dropdown
                                        label=""
                                        options={{
                                            disableLabelsOnElements: true,
                                        }}
                                        className="mr-3"
                                        items={modelCapabilities?.values().toArray().map(m => {
                                            const supportedFeatures: string[] = [];
                                            if (m?.supportsAttachmentsImages) {
                                                supportedFeatures.push("./vision.svg");
                                            }
                                            if (m?.supportsAttachmentsPDFs) {
                                                supportedFeatures.push("./pdfs.svg");
                                            }

                                            return {
                                                name: m.name,
                                                value: m.model,
                                                disabled: false,
                                                activeName: m.name,
                                                default: m.model === model,
                                                description: m.description || "",
                                                developer: m.developer,
                                                provider: m.provider,
                                                icon: m.developer.toLowerCase() == "openai" ? "/openai.svg" :
                                                    m.developer.toLowerCase() == "anthropic" ? "/anthropic.svg" : "/gemini.svg",
                                                featureIcons: supportedFeatures,
                                            }
                                        })}
                                        name="model"
                                        onChange={option => {
                                            setModel(option.value);
                                            const cap = modelCapabilities?.get(option.value);
                                            const prov = cap?.provider || "openrouter";
                                            setProvider(prov);
                                            onModelChange?.(option.value, prov);
                                        }}
                                    />
                                )
                            })()}
                            {showAttachmentButton && (
                                <button type="button" onClick={() => setEnableAttachments(!enableAttachments)}
                                    className={`${enableAttachments ? "bg-primary shadow-active-button text-neutral-50" : "bg-black/10 shadow-inactive-button text-neutral-50/50"} rounded-full py-1.5 h-full aspect-square cursor-pointer flex justify-center items-center`}
                                >
                                    <svg width="26" height="26" viewBox="0 0 19 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <g filter="url(#filter0_di_3138_685)">
                                            <path d="M10.3854 7.81831L7.7509 11.2884C7.21033 12.0004 7.34934 13.0159 8.06138 13.5564V13.5564C8.77341 14.097 9.78882 13.958 10.3294 13.2459L13.6406 8.88427C14.5354 7.70565 14.3053 6.02483 13.1267 5.13006V5.13006C11.948 4.2353 10.2672 4.46541 9.37246 5.64403L5.31426 10.9897C4.06553 12.6346 4.38668 14.9803 6.03156 16.229V16.229C7.67644 17.4778 10.0222 17.1566 11.2709 15.5117L14.3436 11.4642"
                                                stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                                        </g>
                                        <defs>
                                            <filter id="filter0_di_3138_685" x="0.882069" y="0.911854" width="17.1343" height="19.751" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                                                <feFlood floodOpacity="0" result="BackgroundImageFix" />
                                                <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
                                                <feOffset />
                                                <feGaussianBlur stdDeviation="1.52381" />
                                                <feComposite in2="hardAlpha" operator="out" />
                                                <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.32 0" />
                                                <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_3138_685" />
                                                <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_3138_685" result="shape" />
                                                <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
                                                <feOffset />
                                                <feGaussianBlur stdDeviation="0.571429" />
                                                <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
                                                <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.32 0" />
                                                <feBlend mode="normal" in2="shape" result="effect2_innerShadow_3138_685" />
                                            </filter>
                                        </defs>
                                    </svg>
                                </button>
                            )}
                        </div>
                        <button type="submit" className="bg-white text-black rounded-full px-4 py-1.5 cursor-pointer font-semibold disabled:opacity-50" disabled={generating}>
                            {generating ? "Generating" : "Send"}
                        </button>
                    </div>
                </div>
            </form>
            <div className={`w-full p-6 rounded-b-3xl flex gap-6 overflow-x-auto overflow-y-hidden ${enableAttachments ? "translate-0 opacity-100 h-fit" : "-translate-y-full h-0 absolute opacity-0 pointer-events-none"} transition-all duration-250`}>
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={onFileChange}
                />
                <button
                    type="button"
                    className="aspect-square w-[72px] bg-black/10 rounded-2xl shadow-inactive-button flex justify-center items-center text-5xl font-light text-neutral-50/50 cursor-pointer hover:bg-white/10 transition-all duration-200"
                    onClick={() => fileInputRef.current?.click()}
                >
                    <svg width="54" height="54" viewBox="0 0 54 54" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <g filter="url(#filter0_dii_3141_688)">
                            <path d="M25.0795 41.3863V12.6135H28.9659V41.3863H25.0795ZM12.625 28.9317V25.0681H41.4205V28.9317H12.625Z" fill="white" fillOpacity="0.5" shapeRendering="crispEdges" />
                        </g>
                        <defs>
                            <filter id="filter0_dii_3141_688" x="0.625" y="0.613525" width="52.7969" height="52.7727" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                                <feFlood floodOpacity="0" result="BackgroundImageFix" />
                                <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
                                <feOffset />
                                <feGaussianBlur stdDeviation="6" />
                                <feComposite in2="hardAlpha" operator="out" />
                                <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.4 0" />
                                <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_3141_688" />
                                <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_3141_688" result="shape" />
                                <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
                                <feOffset />
                                <feGaussianBlur stdDeviation="1.5" />
                                <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
                                <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.7 0" />
                                <feBlend mode="normal" in2="shape" result="effect2_innerShadow_3141_688" />
                                <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
                                <feOffset dy="6" />
                                <feGaussianBlur stdDeviation="6.5" />
                                <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
                                <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.12 0" />
                                <feBlend mode="normal" in2="effect2_innerShadow_3141_688" result="effect3_innerShadow_3141_688" />
                            </filter>
                        </defs>
                    </svg>
                </button>
                {attachments.map(att => {
                    const isImage = /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(att.filename);
                    return (
                        <div key={att.filename} className="flex flex-col items-center aspect-square w-[72px] bg-black/15 rounded-2xl shadow-inactive-button cursor-pointer hover:opacity-50 transition-all duration-200 relative">
                            {isImage ? (
                                <a href={att.url} target="_blank" rel="noopener noreferrer" className="w-full h-full flex items-center justify-center">
                                    <Image width={128} height={128} src={att.url} alt={att.filename} className="w-full h-full object-cover rounded-2xl" style={{ objectFit: "contain" }} />
                                </a>
                            ) : (
                                <a href={att.url} target="_blank" rel="noopener noreferrer" className="w-full h-full flex flex-col items-center justify-center no-underline hover:no-underline text-inherit">
                                    <span className="text-3xl text-neutral-50/50 no-underline hover:no-underline">?</span>
                                    <span className="text-[10px] text-neutral-50/80 text-center truncate w-full px-1 mt-1 no-underline hover:no-underline">{att.filename}</span>
                                </a>
                            )}
                            <button type="button" className="absolute top-1 right-1 text-white bg-black/50 rounded-full w-5 h-5 flex items-center justify-center" onClick={() => onRemoveAttachment(att.filename)}>&times;</button>
                        </div>
                    );
                })}
            </div>
        </div>
    )
}

