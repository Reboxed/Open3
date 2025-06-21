export default function isNestedButton(target: HTMLElement): boolean {
    // Check if it's a nested button
    let isChildButton = false;
    let current: HTMLElement = target;
    for (let i = 0; i < 10; i++) { // Max depth
        if (
            current.classList.contains("child-button") ||
            current.tagName.toLowerCase() === "a" ||
            current.tagName.toLowerCase() === "button"
        ) {
            isChildButton = true;
            break;
        }
        if (current.parentElement) {
            current = current.parentElement;
            continue;
        }
        break;
    }
    return isChildButton;
}
