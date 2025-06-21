import { SVGAttributes } from "react";

export default function CheckmarkSvg(props: SVGAttributes<SVGSVGElement>) {
    return (
        <svg width="18" height="18" {...props} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3.5 9.5208L7.63598 13.1296L14.5 4.87061" stroke="white" strokeWidth="2.5" />
        </svg>
    )
}
