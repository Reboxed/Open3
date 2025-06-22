import { useEffect, useRef, useState } from "react";

const useScrollToBottom = (isLoading: boolean, messages: any[], tabId: string) => {
    const [hasMounted, setHasMounted] = useState(false);
    const shouldScrollToBottomRef = useRef(true); // Ensure this is preserved

    useEffect(() => {
        setHasMounted(true);
    }, []);

    useEffect(() => {
        if (!hasMounted) return;

        if (!isLoading && messages.length > 0 && shouldScrollToBottomRef.current) {
            shouldScrollToBottomRef.current = false;

            // Wait until layout is fully rendered
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    window.scrollTo({
                        top: document.body.scrollHeight,
                        behavior: "auto",
                    });
                });
            });
        }
    }, [hasMounted, isLoading, messages.length, tabId]);
};

export default useScrollToBottom;